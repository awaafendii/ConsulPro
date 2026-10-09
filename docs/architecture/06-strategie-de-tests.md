# 06 — Stratégie de tests

## 1. Objectifs

1. Un calcul critique ne doit jamais régresser sans être détecté.
2. Aucune donnée ne doit fuiter d'une organisation ou d'un projet à l'autre.
3. Chaque permission est testée, pour chaque rôle.
4. Une phase n'est close que si ses critères de sortie sont atteints en CI (principe P9).

## 2. Niveaux de tests

| Niveau                    | Outil                                     | Cible                                                                                      | Où                                         |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| Unitaires                 | Vitest                                    | Domaine, moteurs, unités, résolution des paramètres, parsing des imports, modèle de rapport | `packages/*/src/**/__tests__`               |
| **Calculs de référence**  | Vitest + fixtures JSON                    | Chaque moteur, sur des cas vérifiables                                                     | `calc-*/src/<moteur>/__tests__/reference-cases` |
| Propriétés                | `fast-check`                              | Invariants mathématiques des moteurs                                                       | `calc-*`                                    |
| Mutation                  | Stryker                                   | Robustesse des tests des moteurs critiques                                                 | CI nocturne                                 |
| Validation                | Vitest                                    | Schémas Zod : entrées refusées avec le bon code et le bon chemin                            | `contracts`, `calc-*`                      |
| Intégration               | Vitest + Testcontainers (PostgreSQL réel) | Repositories, services applicatifs, migrations, triggers d'immuabilité, RLS                 | `infrastructure`, `application`            |
| API                       | Vitest (Route Handlers appelés avec des `Request`) | Codes HTTP, format RFC 9457, contrats, ETag / If-Match                            | `apps/web`                                  |
| **Permissions**           | Vitest, générés depuis la matrice RBAC    | Rôle × action × portée                                                                     | `application`, `apps/web`                  |
| Imports                   | Vitest + fichiers fixtures                | Détection, mapping, validation, aperçu                                                     | `importers`                                 |
| Rapports                  | Vitest                                    | Modèle de document (snapshot), DOCX / XLSX relus, texte du PDF extrait                     | `reports`                                   |
| Composants                | Vitest + Testing Library + axe            | Composants du design system, états, accessibilité                                           | `ui`, `apps/web`                           |
| E2E                       | Playwright                                | Parcours critiques de chaque phase                                                         | `apps/web/e2e`                              |

## 3. Calculs de référence

Exigence du cahier des charges : *« Les calculs critiques doivent disposer de cas de
référence vérifiables. »*

### 3.1 Format d'un cas

Exemple de format (les valeurs de paramètres restent à confronter à la norme) :

```json
{
  "id": "elec.voltage-drop/mono-cu-2.5mm2-30m-10A",
  "engine": "elec.voltage-drop",
  "engineVersionRange": "^1.0.0",
  "source": {
    "kind": "HAND_CALCULATION",
    "reference": "u = 2 × (0,0225 × 30 / 2,5 × 1) × 10 = 5,40 V ; 100 × 5,40 / 230 = 2,348 %",
    "checkedBy": null,
    "checkedAt": null
  },
  "parameters": {
    "elec.conductor.resistivity.cu.service": { "value": 0.0225, "unit": "Ω·mm²/m" },
    "elec.conductor.reactance.linear": { "value": 0.00008, "unit": "Ω/m" }
  },
  "inputs": {
    "system": "SINGLE_PHASE",
    "phaseToNeutralVoltage": { "value": 230, "unit": "V" },
    "length": { "value": 30, "unit": "m" },
    "section": { "value": 2.5, "unit": "mm2" },
    "conductor": "CU",
    "designCurrent": { "value": 10, "unit": "A" },
    "powerFactor": 1
  },
  "expected": {
    "resultStatus": "OK",
    "outputs": {
      "voltageDrop": { "value": 5.4, "unit": "V", "tolerance": 0.001 },
      "voltageDropPercent": { "value": 2.348, "tolerance": 0.001 }
    },
    "checks": [{ "rule": "elec.voltage-drop.limit", "status": "PASS" }]
  }
}
```

`source.kind` vaut `NORM_EXAMPLE` (exemple publié dans un texte), `TEXTBOOK` (ouvrage
de référence, avec page), `HAND_CALCULATION` (calcul manuel rédigé et contre-vérifié)
ou `VALIDATED_SPREADSHEET` (tableur validé par un ingénieur).

### 3.2 Exigences par moteur

| Exigence                                                                 | Seuil                                   |
| ------------------------------------------------------------------------ | --------------------------------------- |
| Cas de référence nominaux                                                | ≥ 3                                     |
| Cas limites (valeur au seuil de conformité, bornes du domaine)           | ≥ 2                                     |
| Cas de refus (entrées invalides, paramètre manquant)                     | ≥ 2                                     |
| Couverture lignes / branches (`calc-*`, `calc-core`)                     | ≥ 95 %                                  |
| Score de mutation (moteurs critiques : électricité, topographie, pressions) | ≥ 80 %                               |
| Cas `checkedBy` renseigné par un ingénieur du métier                      | Requis avant la clôture de la phase métier |

**Honnêteté sur la vérification** : je peux rédiger les cas et les calculs manuels
détaillés. Leur validation finale (`checkedBy`) relève d'un ingénieur du métier
(question ouverte Q6). Tant qu'elle manque, le moteur reste marqué « non vérifié »
dans l'interface.

### 3.3 Tests par propriétés (exemples)

| Moteur               | Invariant                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `topo.traverse`      | Après compensation de Bowditch, la fermeture planimétrique est nulle (à 1e-9 m près) ; la somme des corrections vaut −f_X et −f_Y. |
| `topo.leveling`      | Après compensation, la somme des dénivelées compensées égale la différence d'altitude des repères.       |
| `topo.coordinates`   | Aller-retour gon → rad → gon et rectangulaire → polaire → rectangulaire sans dérive.                       |
| `elec.voltage-drop`  | ΔU croît avec L et I_B et décroît avec S ; triphasé (b = 1) < monophasé (b = 2) à charge égale.             |
| `elec.cable-sizing`  | La section retenue vérifie toujours I_z corrigé ≥ I_n ; la section immédiatement inférieure ne le vérifie pas. |
| `plumbing.head-loss` | Les pertes croissent avec le débit et la longueur, et décroissent avec le diamètre.                       |
| `btp.*`              | Les quantités sont positives ou nulles, additives (somme des éléments = total) et homogènes en unités.     |

## 4. Matrice de permissions

La matrice RBAC (`domain/access`) est la **source unique** ([12](12-securite-rbac.md)).
Les tests sont générés à partir d'elle :

```
pour chaque endpoint ou cas d'usage
  pour chaque rôle (OWNER … VIEWER, + non-membre, + non authentifié)
    pour chaque portée (même organisation et membre du projet / même organisation non membre / autre organisation)
      → attendu : autorisé | 403 | 404
```

- Une ressource d'une **autre organisation** renvoie **404** (et non 403), pour ne pas
  révéler son existence.
- Un endpoint absent de la matrice fait échouer la CI : impossible d'ajouter un endpoint
  sans déclarer ses permissions.
- Les tests d'isolation tentent explicitement l'accès par identifiant direct (IDOR) sur
  chaque type de ressource.

## 5. Imports

Corpus de fixtures versionné dans `importers/__fixtures__` :

- CSV Excel FR : séparateur `;`, virgule décimale, Windows-1252, BOM UTF-8 ;
- XLSX : plusieurs feuilles, cellules fusionnées, lignes vides, formules, en-têtes sur deux lignes ;
- copier-coller Excel (TSV + HTML) et copier-coller Word (tableau HTML, cellules fusionnées) ;
- angles en gon, en degrés décimaux et en DMS (`45°30'15"`) ;
- fichiers hostiles : extension trompeuse, archive XLSX surdimensionnée (zip bomb),
  cellules commençant par `=`, `+`, `-`, `@` (injection de formules).

## 6. Intégration continue

Ordre des étapes, chacune bloquante :

1. `pnpm install --frozen-lockfile`
2. Typecheck (`tsc --noEmit`, tous les packages)
3. Lint + `dependency-cruiser` (règles de couches)
4. Tests unitaires et calculs de référence, avec seuils de couverture
5. Tests d'intégration (PostgreSQL via Testcontainers)
6. Build (`apps/web`, `apps/worker`)
7. E2E Playwright (parcours critiques)

En CI nocturne : Stryker (mutation), audit des dépendances, E2E complets.

## 7. Définition de « terminé »

Une fonctionnalité est terminée quand :

- [ ] ses tests (unitaires + intégration, et calculs de référence si c'est un moteur) passent en CI ;
- [ ] ses permissions sont déclarées dans la matrice et testées ;
- [ ] ses quatre états d'interface sont gérés (chargement, vide, erreur, nominal) ;
- [ ] ses hypothèses et sources sont affichées (si c'est un calcul) ;
- [ ] elle est accessible au clavier et passe axe sans violation ;
- [ ] ses actions sensibles sont auditées.
