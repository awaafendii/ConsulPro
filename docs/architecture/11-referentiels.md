# 11 — Référentiels normatifs

## 1. Modèle

```
Standard                 ex. « NF C 15-100 » (nature : NORM)
└── StandardVersion      ex. « 2002 + amendements » — DRAFT → PUBLISHED (immuable) → DEPRECATED
    ├── Parameter        valeur scalaire, table ou énumération, avec unité, source et statut de vérification
    └── Rule             règle de vérification : code, article, sévérité, paramètres utilisés, implémentation
```

| Nature     | Exemple                                                    | Remarque                                                       |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `NORM`     | NF C 15-100, DTU 60.11, BAEL 91 mod. 99                    | Valeurs issues du texte normatif                               |
| `GUIDE`    | UTE C 15-105 (méthodes de calcul électriques)              | Guides d'application                                           |
| `PRACTICE` | « Usages courants — métré »                                | Pratiques professionnelles : **toujours** `TO_VERIFY` par défaut, explicitement modifiables |
| `CUSTOM`   | Référentiel interne d'une organisation                     | Créé par une organisation, visible d'elle seule                |

**Droits d'auteur** : les textes normatifs (AFNOR, etc.) sont protégés. ConsulPro stocke
des **valeurs** et des **références d'articles**, jamais la reproduction des textes.

## 2. Paramètre

```ts
interface Parameter {
  key: ParameterKey;               // stable, hiérarchique : 'plumbing.fixture.base_flow.washbasin'
  kind: 'SCALAR' | 'TABLE' | 'ENUM';
  value: ScalarValue | TableValue | EnumValue;
  unit?: UnitSymbol;
  source: {
    document: string;              // 'NF C 15-100'
    clause?: string;               // '§ 525'
    table?: string;                // 'Tableau 52W'
    note?: string;
  };
  verification: 'VERIFIED' | 'TO_VERIFY';
  verifiedBy?: UserRef[];          // VERIFIED exige deux personnes distinctes (double saisie)
}
```

Une **table** (ex. courants admissibles selon le mode de pose et la section) est un
paramètre de type `TABLE` avec des axes typés et unités, et une règle d'interpolation
explicite (`NONE` : lecture exacte ou valeur supérieure, ou `LINEAR`). Jamais
d'interpolation implicite.

## 3. Règle

```ts
interface Rule {
  code: RuleCode;                  // 'elec.voltage-drop.limit'
  description: string;
  clause?: string;
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  parameterKeys: ParameterKey[];   // seuils utilisés
  implementation: string;          // identifiant de la vérification dans le moteur
}
```

Les règles sont **implémentées en code** dans les moteurs (typées, testées) et
**décrites** dans le référentiel (article, sévérité, seuils). On écarte un langage de
règles en base : il serait moins testable et pourrait diverger du moteur. La CI vérifie
que chaque `Rule` d'une version publiée a une implémentation enregistrée, et inversement.

## 4. Résolution des paramètres

Pour un calcul donné :

```
valeur = surcharge projet  ??  surcharge organisation  ??  valeur de la StandardVersion
```

- Le **profil** du projet (par discipline) détermine la `StandardVersion` utilisée.
- Une surcharge exige une **justification**, est auditée, et apparaît sur le résultat
  (« valeur de référence 5 % — valeur utilisée 4 % — justification : exigence du maître d'ouvrage »).
- Le résultat de la résolution est un `ResolvedParameterSet` **figé**. Il est sérialisé
  de façon canonique (clés triées) puis haché (SHA-256), et stocké dans la révision.

## 5. Cycle de vie

| Action                         | Qui                                        | Effet                                                                                      |
| ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Créer ou modifier une version `DRAFT` | `PlatformAdmin` (système) ou Owner / Admin (`CUSTOM`) | Modifiable                                                               |
| Publier                        | idem, après contrôle de complétude         | Immuable (trigger). Utilisable par les calculs.                                            |
| Déprécier                      | idem                                       | Toujours lisible, plus proposée pour les nouveaux calculs. Les révisions existantes restent valides. |
| Passer un paramètre à `VERIFIED` | Deux personnes distinctes                | Seulement dans une nouvelle version (une version publiée est immuable)                     |

## 6. Profil initial « Afrique francophone »

Choix validé en Phase 0. Chaque ligne sera **sourcée paramètre par paramètre** pendant
la phase métier concernée. Rien n'est saisi sans source.

| Discipline   | Référentiel                                            | Nature     | Usage dans ConsulPro                                                                                         | Phase |
| ------------ | ------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ | ----- |
| BTP          | Usages courants — métré                                | `PRACTICE` | Dosages (béton de propreté, béton armé, mortiers), coefficients de foisonnement, taux de pertes, ratios d'acier, rendements de peinture, dimensions des blocs et des entrevous | 4 |
| BTP          | BAEL 91 mod. 99                                        | `NORM`     | Seulement si le dimensionnement structurel est retenu (Q2) ; sinon, éventuellement les enrobages pour les longueurs d'acier | 4 |
| BTP          | DTU 13.12 (fondations superficielles)                  | `NORM`     | À évaluer selon Q2                                                                                           | 4     |
| Électricité  | NF C 15-100 (version à trancher : Q4)                  | `NORM`     | Courants admissibles, facteurs de correction, limites de chute de tension, règles de protection             | 5     |
| Électricité  | UTE C 15-105                                           | `GUIDE`    | Méthodes de calcul (sections, chutes de tension)                                                            | 5     |
| Électricité  | Normes nationales dérivées (selon pays cibles : Q3)    | `NORM`     | Versions distinctes de la NF C 15-100 lorsqu'un pays en publie une                                          | 5     |
| Plomberie    | DTU 60.11                                              | `NORM`     | Débits de base, coefficient de simultanéité, diamètres, évacuation                                          | 6     |
| Plomberie    | DTU 64.1                                               | `NORM`     | Assainissement non collectif (fosses), à adapter aux pratiques locales                                      | 6     |
| Plomberie    | Usages courants — plomberie                            | `PRACTICE` | Vitesses admissibles, pressions minimales aux appareils, consommations journalières, autonomie des réservoirs | 6   |
| Topographie  | Tolérances de projet                                   | `PRACTICE` | Tolérances de fermeture angulaire et planimétrique, tolérance de nivellement ; fixées par projet ou par organisation | 7 |

## 7. Bibliothèque technique (correspondance avec le cahier des charges)

| Élément demandé         | Implémentation                                                              |
| ----------------------- | --------------------------------------------------------------------------- |
| Référentiels, normes    | `Standard`, `StandardVersion`                                               |
| Tables, coefficients    | `Parameter` (`TABLE`, `SCALAR`)                                             |
| Formules                | Générées depuis `metadata.ts` des moteurs (jamais stockées en base)         |
| Unités                  | Registre d'unités de `calc-core`                                            |
| Matériaux, sections, équipements | `Catalog` / `CatalogItem` (propriétés typées et sourcées)          |
| Paramètres personnalisés | `ParameterOverride` (organisation, projet) et référentiels `CUSTOM`        |
