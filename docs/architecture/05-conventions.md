# 05 — Conventions

## 1. Langues

| Élément                                          | Langue                                     |
| ------------------------------------------------ | ------------------------------------------ |
| Identifiants de code, noms de fichiers, API      | Anglais (voir le glossaire §9)             |
| Textes d'interface, messages d'erreur utilisateur | Français, centralisés dans `messages/fr`  |
| Segments d'URL visibles                          | Français sans accents (`/projets/…/chute-tension`) |
| Documentation, ADR, commentaires métier          | Français                                   |
| Messages de commit                               | Anglais (Conventional Commits)             |

## 2. TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- Pas de `any` (règle ESLint `no-explicit-any` en erreur). `unknown` + validation Zod aux frontières.
- Types de marque (branded types) pour les identifiants : `ProjectId`, `OrganizationId`…
  On ne peut pas passer un `ProjectId` là où un `StudyId` est attendu.
- Erreurs métier : type `Result<T, E>` (pas d'exception) dans `domain`, `calc-*` et
  `application`. Les exceptions sont réservées aux erreurs de programmation et
  d'infrastructure.
- Exports nommés uniquement (pas d'`export default`, sauf là où Next.js l'impose).
- Fichiers en `kebab-case.ts`, composants React en `PascalCase.tsx`.

## 3. Calculs, unités et nombres

| Règle                    | Détail                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unités internes          | **SI** dans les moteurs (m, m², m³, kg, s, A, V, W, Pa, rad, K). Conversion uniquement aux frontières (entrée / affichage).                                                                                     |
| Entrées avec unité       | Une grandeur saisie est un objet `{ value, unit }` validé par le registre d'unités. Une grandeur nue n'est acceptée que si le schéma fixe l'unité.                                                             |
| Nommage des nombres bruts | Dans les formules, suffixe d'unité obligatoire : `lengthM`, `sectionMm2`, `currentA`, `angleRad`, `flowM3s`.                                                                                                |
| Arrondis                 | **Jamais d'arrondi intermédiaire.** Arrondi à l'affichage et dans les rapports, selon la précision déclarée par sortie. Les quantitatifs stockent la valeur arrondie selon la précision de l'unité, la valeur brute reste dans la révision. |
| Comparaisons             | Toujours avec une tolérance explicite (`approxEqual(a, b, tol)`), jamais `===` sur des flottants.                                                                                                            |
| Itérations               | Tout calcul itératif (ex. Colebrook-White) déclare un nombre maximal d'itérations et une tolérance de convergence, et trace le nombre d'itérations effectuées. Non-convergence ⇒ résultat `ERROR`, jamais une valeur approchée silencieuse. |
| Valeurs par défaut       | Toute valeur par défaut appliquée par un moteur produit une **hypothèse** visible (principe P4).                                                                                                              |
| Affichage                | `Intl.NumberFormat('fr-FR')` : espace insécable comme séparateur de milliers, virgule décimale. Unités affichées avec leur symbole normalisé (mm², kVA, m³/h, gon).                                            |
| Angles (topographie)     | Interne en radians ; saisie et affichage en gon par défaut (paramétrable : degrés décimaux, DMS).                                                                                                             |
| Argent                   | `Decimal` (jamais `number`). Arrondi bancaire à l'affichage selon la devise.                                                                                                                                  |

## 4. Moteurs de calcul

- Identifiant : `<discipline>.<calcul>` en anglais `kebab-case` (ex. `elec.voltage-drop`).
- Version **semver** par moteur, avec un `CHANGELOG.md` par moteur :
  - **patch** : aucun changement de sortie pour les mêmes entrées et paramètres (refactor, message) ;
  - **minor** : ajout d'une sortie, d'une vérification ou d'un avertissement, sans changer les valeurs existantes ;
  - **major** : une valeur de sortie change pour les mêmes entrées. Les révisions existantes sont alors signalées « calculées avec une version antérieure ».
- Chaque formule déclare dans `metadata.ts` : identifiant, LaTeX, description, source
  (référentiel et article), symboles avec unités.
- Chaque moteur a des cas de référence ([06](06-strategie-de-tests.md)) avant d'être exposé dans l'UI.

## 5. API HTTP

| Sujet          | Convention                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base           | `/api/v1`, ressources en anglais, pluriel, `kebab-case` (`/api/v1/projects/{id}/calculations`)                                                     |
| Actions        | Sous-ressource verbale pour les transitions : `POST /calculations/{id}/revisions` (calculer), `POST /revisions/{id}/validate`, `POST /revisions/{id}/verify` |
| Validation     | Corps, query et params validés par les schémas de `contracts` dans l'adaptateur, puis revalidés par les invariants du domaine                       |
| Erreurs        | **RFC 9457** (`application/problem+json`) : `type`, `title`, `status`, `detail`, `code` (stable, ex. `PROJECT_ARCHIVED`), `errors[]` (chemin du champ, code, message) |
| Pagination     | Par curseur : `?cursor=…&limit=…` (limite maximale 100)                                                                                             |
| Concurrence    | `ETag` = `version` de l'entité ; `If-Match` obligatoire sur `PATCH` et `DELETE` ⇒ `412` en cas de conflit                                         |
| Idempotence    | En-tête `Idempotency-Key` accepté sur les `POST` coûteux (calcul, génération de rapport, import)                                                    |
| Traçabilité    | En-tête `X-Request-Id` propagé jusqu'aux journaux et à l'audit                                                                                     |
| Dates          | ISO 8601 UTC                                                                                                                                       |

## 6. Base de données

- Prisma : modèles en `PascalCase`, `@@map` vers des tables `snake_case` au pluriel, colonnes en `snake_case`.
- Une migration fusionnée n'est **jamais** modifiée. Toute correction passe par une nouvelle migration.
- SQL brut (triggers d'immuabilité, RLS, index `pg_trgm`) dans les migrations, commenté.
- Accès aux données **uniquement** via les repositories de `infrastructure`, qui exigent
  un `TenantContext`. Aucun `prisma.*` dans `apps/web` ou dans `application`.

## 7. Interface

- **Aucune formule** dans les composants. Un composant affiche un `CalculationResult` reçu de l'API.
- État serveur : TanStack Query exclusivement (clés centralisées dans `lib/query-keys.ts`).
  Zustand : état d'interface uniquement, jamais de copie de données serveur.
- Formulaires : React Hook Form + schéma Zod importé de `contracts`.
- Chaque écran de données gère quatre états : chargement (squelettes), vide (action
  proposée), erreur (message et nouvelle tentative), nominal.
- Actions destructives ou irréversibles (archiver, rejeter, retirer un membre) :
  boîte de confirmation qui nomme l'objet concerné.
- Accessibilité : WCAG 2.2 AA, navigation clavier complète, focus visible, contrastes
  vérifiés en thème clair et sombre.
- Module non livré : affiché désactivé, avec la mention « Disponible en Phase N » (principe P7).
  Source unique : le registre `packages/domain/src/modules/registry.ts`.
- Textes : `apps/web/messages/fr.json` (next-intl). Pas de point dans une clé (next-intl
  l'interprète comme un niveau d'imbrication).
- Dates : formatées avec next-intl (`useFormatter` / `getFormatter`), qui applique le même
  fuseau côté serveur et navigateur.
- Composants : uniquement ceux de `@consulpro/ui` et ses tokens ; aucune couleur codée en dur
  (voir [14 — Design system](14-design-system.md)).

## 8. Git et revue

- Branche principale `main`, protégée. Branches courtes : `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- **Conventional Commits** (`feat(calc-elec): add voltage drop engine`).
- Toute PR passe la CI. Checklist de PR :
  - [ ] tests ajoutés ou mis à jour ;
  - [ ] hypothèses et sources documentées (si un calcul est touché) ;
  - [ ] version et CHANGELOG du moteur mis à jour (si un moteur est touché) ;
  - [ ] analyse des dépendances (si une fonctionnalité est supprimée, principe P8) ;
  - [ ] permissions couvertes par la matrice (si un endpoint est ajouté).

## 9. Glossaire métier FR → EN (identifiants de code)

| Français                    | Identifiant anglais          | Français                     | Identifiant anglais        |
| --------------------------- | ---------------------------- | ---------------------------- | -------------------------- |
| Avant-métré                 | `quantityTakeoff`            | Chute de tension             | `voltageDrop`              |
| Quantitatif / DQE           | `billOfQuantities`           | Bilan de puissance           | `powerBalance`             |
| Lot                         | `boqSection`                 | Courant d'emploi             | `designCurrent`            |
| Terrassement                | `earthworks`                 | Section de câble             | `cableSection`             |
| Foisonnement                | `bulking`                    | Disjoncteur                  | `circuitBreaker`           |
| Semelle isolée / filante    | `padFooting` / `stripFooting` | Tableau (électrique)        | `distributionBoard`        |
| Longrine                    | `groundBeam`                 | Départ                       | `outgoingCircuit`          |
| Poteau                      | `column`                     | Coefficient de simultanéité  | `diversityFactor`          |
| Poutre                      | `beam`                       | Coefficient d'utilisation    | `utilizationFactor`        |
| Dalle                       | `slab`                       | Pertes de charge             | `headLoss`                 |
| Plancher à corps creux      | `hollowBlockSlab`            | Débit probable               | `probableFlow`             |
| Entrevous / hourdis         | `infillBlock`                | Eaux usées                   | `greyWater`                |
| Escalier / paillasse        | `stairs` / `waistSlab`       | Eaux vannes                  | `blackWater`               |
| Maçonnerie                  | `masonry`                    | Fosse septique               | `septicTank`               |
| Agglo (bloc béton)          | `concreteBlock`              | Regard                       | `manhole`                  |
| Enduit                      | `render`                     | Chauffe-eau                  | `waterHeater`              |
| Carrelage                   | `tiling`                     | Surpresseur                  | `boosterPump`              |
| Coffrage                    | `formwork`                   | HMT                          | `totalHead`                |
| Béton de propreté           | `blindingConcrete`           | Gisement                     | `bearing`                  |
| Dosage                      | `mixRatio`                   | Polygonale / cheminement     | `traverse`                 |
| Ratio d'acier               | `rebarRatio`                 | Fermeture                    | `misclosure`               |
| Étude                       | `study`                      | Compensation                 | `adjustment`               |
| Vérification (contrôle humain) | `verification`            | Nivellement                  | `leveling`                 |
| Référentiel                 | `standard`                   | Implantation                 | `stakeout`                 |
| Hypothèse                   | `hypothesis`                 | Rayonnement                  | `radiation`                |
| Avertissement               | `warning`                    | Matricule (point)            | `pointId`                  |
