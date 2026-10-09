# 12 — Sécurité et RBAC

## 1. Authentification

| Sujet                 | Décision                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Bibliothèque          | Better Auth (proposé, [ADR-0009](../adr/0009-authentification.md))                                                                |
| Méthodes              | E-mail + mot de passe avec vérification d'e-mail (Phase 1). TOTP (2FA) disponible pour tous, **obligatoire** pour Owner et Admin : Phase 3. |
| Mots de passe         | Hachage fort (scrypt ou argon2id selon la bibliothèque), longueur minimale 12, refus des mots de passe compromis connus (liste locale). |
| Sessions              | Stockées en base, cookie `HttpOnly`, `Secure`, `SameSite=Lax`, rotation à la connexion, révocation (déconnexion de toutes les sessions). |
| CSRF                  | `SameSite=Lax` + vérification de l'en-tête `Origin` sur toute requête mutante.                                                    |
| Jetons (invitation, réinitialisation) | Aléatoires, stockés **hachés**, à usage unique, avec expiration courte.                                           |

## 2. Isolation

### 2.1 Organisations ([ADR-0006](../adr/0006-isolation-multi-organisation.md))

1. **Contexte de requête** : l'adaptateur HTTP résout la session, l'organisation active
   (depuis `orgSlug`) et l'adhésion. Pas d'adhésion ⇒ 404.
2. **Repositories scopés** : chaque méthode exige un `TenantContext` et filtre par
   `organization_id`. Un test d'architecture interdit tout accès Prisma hors des repositories.
3. **RLS PostgreSQL** (défense en profondeur) : politiques sur `organization_id` alimentées
   par `set_config('app.organization_id', …, true)` dans la transaction. La faisabilité
   avec Prisma est validée par un spike en Phase 1. En cas d'échec, les étapes 1 et 2
   restent et les tests d'isolation deviennent la seule barrière (décision tracée).

### 2.2 Projets

- Owner et Admin accèdent à tous les projets de l'organisation.
- Les autres rôles n'accèdent qu'aux projets dont ils sont membres (`ProjectMember`).
- Rôle effectif sur un projet = **le plus restrictif** entre le rôle d'organisation et
  le rôle projet. Un rôle projet ne peut jamais élever un rôle d'organisation.

## 3. Rôles

| Rôle            | Intention                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------- |
| `OWNER`         | Responsable de l'organisation : tous les droits, transfert de propriété, suppression         |
| `ADMIN`         | Administration : membres, référentiels de l'organisation, audit, tous les projets           |
| `ENGINEER`      | Produit et **vérifie** les calculs, gère ses projets, génère les rapports                    |
| `TECHNICIAN`    | Saisit les données, importe, calcule, valide ses propres calculs ; **ne vérifie pas**        |
| `COLLABORATOR`  | Partenaire invité sur des projets précis : consulte, dépose des documents et des données ; ne calcule pas |
| `VIEWER`        | Lecture seule sur les projets dont il est membre                                             |
| `PLATFORM_ADMIN` | *(plateforme, hors organisation)* Publie les référentiels système                           |

## 4. Matrice des permissions (proposition)

`●` autorisé · `○` autorisé sur ses propres objets seulement · `—` refusé.
Les permissions « projet » supposent l'accès au projet (§2.2).

| Permission                         | Owner | Admin | Engineer | Technician | Collaborator | Viewer |
| ---------------------------------- | :---: | :---: | :------: | :--------: | :----------: | :----: |
| `org.read` (organisation, membres) | ●     | ●     | ●        | ●          | ●            | ●      |
| `org.update`                       | ●     | ●     | —        | —          | —            | —      |
| `org.delete`, `org.transfer`       | ●     | —     | —        | —          | —            | —      |
| `org.member.manage` ¹              | ●     | ●     | —        | —          | —            | —      |
| `audit.read`                       | ●     | ●     | —        | —          | —            | —      |
| `library.read`                     | ●     | ●     | ●        | ●          | ●            | ●      |
| `library.org.manage` ²             | ●     | ●     | —        | —          | —            | —      |
| `price.manage`                     | ●     | ●     | ●        | —          | —            | —      |
| `project.create`                   | ●     | ●     | ●        | —          | —            | —      |
| `project.read`                     | ●     | ●     | ●        | ●          | ●            | ●      |
| `project.update`, `project.archive` | ●    | ●     | ●        | —          | —            | —      |
| `project.member.manage`            | ●     | ●     | ●        | —          | —            | —      |
| `project.parameter.override`       | ●     | ●     | ●        | —          | —            | —      |
| `dataset.write`                    | ●     | ●     | ●        | ●          | ●            | —      |
| `import.run`                       | ●     | ●     | ●        | ●          | ●            | —      |
| `study.manage`                     | ●     | ●     | ●        | ●          | —            | —      |
| `calculation.run`                  | ●     | ●     | ●        | ●          | —            | —      |
| `calculation.validate` ³           | ○     | ○     | ○        | ○          | —            | —      |
| `calculation.verify` ⁴             | ●     | ●     | ●        | —          | —            | —      |
| `boq.manage`                       | ●     | ●     | ●        | ●          | —            | —      |
| `document.upload`                  | ●     | ●     | ●        | ●          | ●            | —      |
| `document.delete`                  | ●     | ●     | ●        | —          | ○            | —      |
| `report.generate`                  | ●     | ●     | ●        | —          | —            | —      |
| `report.read`                      | ●     | ●     | ●        | ●          | ●            | ●      |

1. Un Admin ne peut ni modifier, ni retirer, ni promouvoir un Owner.
2. Référentiels `CUSTOM`, surcharges au niveau organisation, catalogues de l'organisation.
3. Seul l'auteur de la révision la valide.
4. Le vérificateur doit être différent de l'auteur (invariant du domaine, testé).

Cette matrice est codée **une seule fois** dans `domain/access` et sert à la fois à
l'autorisation (application), à l'affichage conditionnel (UI) et à la génération des
tests ([06 §4](06-strategie-de-tests.md)). L'UI masque ce qui est interdit, mais seul le
serveur fait foi.

## 5. Validation serveur

- Toute entrée est validée par Zod dans l'adaptateur HTTP, puis par les invariants du
  domaine. La validation côté client n'existe que pour le confort.
- Tailles maximales explicites (corps de requête, lignes d'un import, longueur des champs).
- Aucune requête SQL construite par concaténation. Les requêtes brutes passent par des
  paramètres liés.

## 6. Fichiers

| Risque                     | Mesure                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Type déguisé               | Détection par octets magiques (`file-type`), liste blanche (PDF, images, XLSX, DOCX, CSV, DWG en lecture seule) ; l'extension seule ne suffit jamais |
| Contenu malveillant        | Dépôt en **quarantaine** (bucket séparé) → contrôles → déplacement vers le bucket sain ; antivirus (ClamAV) en Phase 10 |
| Zip bomb (XLSX, DOCX)      | Limites de taille compressée et décompressée, de nombre d'entrées, de lignes et de colonnes                  |
| Exécution dans le navigateur | Téléchargement via URL signée de courte durée, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` ; jamais de HTML ou SVG servi en ligne |
| Injection de formules (exports) | Toute cellule exportée commençant par `=`, `+`, `-`, `@`, tabulation ou retour chariot est neutralisée |
| Accès                      | Clés de stockage non devinables ; URL signée émise seulement après contrôle de permission                    |

## 7. Limitation de débit

| Cible                                        | Clé                  | Exemple de limite (à calibrer) |
| -------------------------------------------- | -------------------- | ------------------------------ |
| Connexion, inscription, réinitialisation     | IP + e-mail          | 5 / 15 min                     |
| API authentifiée                             | utilisateur          | 300 / min                      |
| Calculs, imports, rapports                   | organisation         | quotas par minute et par jour  |

Réponse `429` avec l'en-tête `Retry-After`.

## 8. Journal d'audit

Append-only (trigger interdisant UPDATE et DELETE), écrit **dans la même transaction**
que la mutation. Événements audités (au minimum) :

- authentification : connexion réussie ou échouée, 2FA, réinitialisation de mot de passe ;
- membres : invitation, changement de rôle, retrait, transfert de propriété ;
- projets : création, modification, archivage, membres ;
- calculs : nouvelle révision, validation, vérification, rejet ;
- référentiels : publication, dépréciation, surcharges ;
- documents : dépôt, suppression, purge ; rapports : génération ; imports : exécution.

Aucun secret ni mot de passe n'est journalisé. Les valeurs sensibles sont masquées dans
les différences avant / après.

## 9. En-têtes et configuration

- CSP stricte (nonces), HSTS, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Variables d'environnement validées par Zod au démarrage (échec immédiat si invalide).
  Secrets jamais versionnés (`.env.example` sans valeurs).

## 10. Sauvegardes (mise en œuvre en Phase 10)

| Élément           | Mesure proposée                                                                       |
| ----------------- | ------------------------------------------------------------------------------------- |
| PostgreSQL        | PITR (archivage WAL) + sauvegarde complète quotidienne, chiffrées, rétention 30 jours |
| Stockage objet    | Versionnage des objets + réplication ou sauvegarde quotidienne                         |
| Objectifs         | RPO ≤ 15 min, RTO ≤ 4 h (à valider)                                                   |
| Contrôle          | Restauration complète testée chaque mois sur un environnement isolé                    |
