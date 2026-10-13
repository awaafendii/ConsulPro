# 10 — Moteur de calcul

## 1. Rôle

Le Calculation Engine est **partagé** par les quatre métiers. Il impose à chaque calcul
le même pipeline, la même structure de résultat et les mêmes garanties de traçabilité.

```
INPUT → VALIDATION → CALCULATION → VERIFICATION → RESULT → WARNINGS → HYPOTHESES → HISTORY
└────────────────────── packages/calc-core + calc-* (purs) ─────────────────────┘   └ application ┘
```

`HISTORY` (persistance de la révision) est la seule étape qui n'est pas dans le moteur.
Le moteur est pur ; l'application persiste.

## 2. Garanties

| Garantie            | Mécanisme                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Déterminisme        | Fonctions pures ; ESLint interdit `Date`, `Math.random`, I/O, `process`, timers dans `calc-*`. Ordre d'itération stable (tableaux, jamais d'itération sur un `Set` non trié). |
| Reproductibilité    | La révision stocke entrées normalisées, snapshot complet des paramètres résolus, version du moteur et sorties.                                                    |
| Testabilité isolée  | Un moteur s'exécute avec `run(engine, input, params)` sans base de données, sans réseau, sans framework.                                                          |
| Transparence        | Chaque étape enregistre la formule (LaTeX), les valeurs substituées, le résultat et la source. Les valeurs par défaut deviennent des hypothèses. Les paramètres `TO_VERIFY` deviennent des avertissements. |
| Autorité serveur    | Seul le résultat calculé côté serveur est persisté. L'aperçu navigateur utilise le même package, sans valeur légale.                                               |

## 3. Contrat d'un moteur (esquisse TypeScript)

```ts
// packages/calc-core/src/engine.ts
export interface EngineDefinition<I, O> {
  id: EngineId;                      // 'elec.voltage-drop'
  version: SemVer;                   // '1.0.0'
  discipline: Discipline;
  title: string;                     // clé de texte d'interface
  inputSchema: z.ZodType<I>;         // VALIDATION
  outputSchema: z.ZodType<O>;        // garde-fou contre les défauts du moteur
  parameters: readonly ParameterRequirement[]; // clés attendues dans le référentiel
  formulas: readonly FormulaDoc[];   // documentation (bibliothèque > formules)
  calculate(input: I, ctx: CalcContext): Result<O, CalcFailure>;  // CALCULATION
  verify(input: I, output: O, ctx: CalcContext): readonly Check[]; // VERIFICATION
}

export interface CalcContext {
  params: ResolvedParameterSet;      // lecture typée : ctx.params.scalar('key', 'Ω·mm²/m')
  trace: TraceRecorder;              // ctx.trace.step({...})
  assume: HypothesisRecorder;        // ctx.assume.defaulted('powerFactor', 0.8, 'reason')
  warn: WarningRecorder;
}

export interface ParameterRequirement {
  key: ParameterKey;                 // 'elec.conductor.resistivity.cu.service'
  kind: 'SCALAR' | 'TABLE' | 'ENUM';
  unit?: UnitSymbol;                 // unité attendue : refus si incompatible
  optional?: boolean;
}
```

```ts
// packages/calc-core/src/pipeline/run.ts
export function run<I, O>(
  engine: EngineDefinition<I, O>,
  rawInput: unknown,
  params: ResolvedParameterSet,
): CalculationResult<O>;
```

Présentation (Phase 4) : chaque sortie déclare son unité et sa précision d'affichage. Une sortie
d'ouvrage porte une **famille** (`EARTHWORKS`, `CONCRETE`, `FORMWORK`, `STEEL`, `MASONRY`…) qui la
reprend comme ligne de quantitatif (ouvrage `<moteur>.<sortie>`, clé des prix) ; une sortie
`MATERIAL` alimente la décomposition en matériaux, cumulée entre calculs seulement si elle est
déclarée `additive` (matériau générique). `referenceCases` (cas rédigés / contre-vérifiés par un
ingénieur) commande l'affichage « moteur non contre-vérifié ». Les entrées acceptent aussi des
entiers et des listes de lignes (ouvertures, nomenclature d'aciers).

Entrée « jeu de données » (Phase 5) : une entrée peut désigner un type de jeu de données du
projet (`kind: 'dataset'`, ex. `ELEC_BOARD_TREE`). La saisie est `{ fromDataset: <id> }` ;
le serveur lit la révision courante du jeu, la valide avec le schéma du moteur et trace la
révision lue (`calculation_dataset_links`). Le moteur reste pur : il reçoit des lignes.

## 4. Étapes du pipeline

| Étape            | Comportement                                                                                                                                                                                                                         | Échec ⇒                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| **INPUT**        | Entrée brute (`unknown`) reçue de l'application                                                                                                                                                                                       | —                          |
| **VALIDATION**   | 1) `inputSchema.safeParse` (types, bornes physiques, unités compatibles) ; 2) conversion en SI ; 3) contrôle que chaque `ParameterRequirement` est présent avec une unité compatible                                                   | `INVALID` + erreurs par champ |
| **CALCULATION**  | `engine.calculate` sur une entrée normalisée **figée** (`Object.freeze` profond). Chaque étape significative est tracée.                                                                                                               | `ERROR` (non-convergence, cas hors domaine détecté) |
| **VERIFICATION** | `engine.verify` : chaque `Check` cite sa règle (`Rule.code`), la valeur mesurée, la limite, l'unité, l'article. Statut `PASS`, `FAIL` ou `NOT_APPLICABLE`.                                                                            | —                          |
| **RESULT**       | `outputSchema.parse(outputs)`. Un écart signale un défaut du moteur, jamais l'utilisateur.                                                                                                                                             | `ERROR`                    |
| **WARNINGS**     | Avertissements du moteur + un avertissement automatique par paramètre `TO_VERIFY` utilisé + un par paramètre surchargé (valeur de référence ≠ valeur utilisée).                                                                         | —                          |
| **HYPOTHESES**   | Hypothèses déclarées par le moteur (ex. « régime permanent ») + une hypothèse automatique par valeur par défaut appliquée.                                                                                                              | —                          |
| **HISTORY**      | *Application* : calcule le hash du snapshot, crée une `CalculationRevision` immuable, écrit l'audit, met à jour la révision courante, signale les calculs dépendants obsolètes.                                                         | —                          |

L'étape HISTORY est écrite dans `packages/application/src/calculations/calculation-service.ts` :
entrées liées résolues (sortie de la révision courante d'un autre calcul du projet), paramètres
résolus et figés, empreinte, révision, dépendances, révision courante, fil d'activité et audit,
dans une seule transaction. Le présentateur `toCalculationView` reconstruit l'affichage à partir
du résultat enregistré. Les moteurs de démonstration (`packages/calc-demo`) n'ont aucune valeur
technique et ne sont enregistrés que si `CONSULPRO_DEMO_ENGINES=true` (refusé en production).

Statut global (`result_status`), par ordre de priorité :

1. `INVALID` : entrées ou paramètres refusés (aucune sortie) ;
2. `ERROR` : défaut interne ou non-convergence (aucune sortie présentée comme un résultat) ;
3. `NON_COMPLIANT` : au moins une vérification bloquante en `FAIL` ;
4. `OK_WITH_WARNINGS` : au moins un avertissement ;
5. `OK`.

## 5. Structure du résultat

```ts
export interface CalculationResult<O> {
  engine: { id: EngineId; version: SemVer };
  standards: StandardRef[];                  // référentiels et versions utilisés (un calcul peut en combiner plusieurs)
  status: ResultStatus;
  rawInputs: unknown;                        // entrées telles que reçues (conservées même si refusées)
  inputs: NormalizedInputs | null;           // entrées après conversion SI
  parameters: ParameterSnapshotEntry[];      // { key, value, source, verification, used, override? }, triés par clé
  hypotheses: Hypothesis[];                  // { code, text, origin: 'ENGINE' | 'DEFAULT_VALUE' }
  outputs: O | null;
  checks: Check[];                           // { rule, status, severity, measured, limit, comparison, unit, clause }
  warnings: Warning[];                       // { code, severity, text, origin }
  trace: TraceStep[];                        // { id, label, formula, substitutions, value, unit, source }
  errors: FieldError[];                      // si INVALID
  failure: CalcFailure | null;               // si ERROR
}
```

Implémentation de référence : `packages/calc-core/src/result/calculation-result.ts`.

L'interface affiche toujours, dans cet ordre : **données d'entrée, hypothèses, paramètres,
résultat, vérification, avertissements**, puis la trace détaillée (repliable). C'est
l'exigence du cahier des charges pour l'électricité, appliquée à tous les métiers.

## 6. Exemple : `elec.voltage-drop`

Les valeurs de paramètres ci-dessous illustrent la **forme**. Elles sont `TO_VERIFY`
jusqu'à leur confrontation au texte de la norme retenue (Q4).

**Entrées** : monophasé, U₀ = 230 V, L = 30 m, S = 2,5 mm², cuivre, I_B = 10 A, cos φ non fourni.

**Hypothèses**
- H1 (moteur) : chute de tension calculée en régime permanent, conducteurs à leur température de service.
- H2 (valeur par défaut) : cos φ = 1 car non renseigné ⇒ terme réactif nul.

**Paramètres** (référentiel NF C 15-100 / UTE C 15-105, version X)

| Clé                                              | Valeur      | Source         | Statut      |
| ------------------------------------------------ | ----------- | -------------- | ----------- |
| `elec.conductor.resistivity.cu.service`          | 0,0225 Ω·mm²/m | (article à citer) | TO_VERIFY |
| `elec.conductor.reactance.linear`                | 0,08 mΩ/m   | (article à citer) | TO_VERIFY |
| `elec.voltage_drop.limit.other.public_lv`        | 5 %         | (tableau à citer) | TO_VERIFY |

**Trace**

| Étape | Formule                                                         | Substitution                                | Résultat |
| ----- | --------------------------------------------------------------- | ------------------------------------------- | -------- |
| T1    | b = 2 (monophasé)                                               | —                                           | 2        |
| T2    | u = b·(ρ₁·L/S·cos φ + λ·L·sin φ)·I_B                             | 2 × (0,0225 × 30 / 2,5 × 1 + 0) × 10        | 5,40 V   |
| T3    | Δu = 100·u / U₀                                                  | 100 × 5,40 / 230                            | 2,348 %  |

**Vérification** : `elec.voltage-drop.limit` : 2,348 % ≤ 5 % ⇒ **PASS**.

**Avertissements** : 3 paramètres `TO_VERIFY` utilisés ; H2 appliquée par défaut.

**Statut** : `OK_WITH_WARNINGS`.

## 7. Numérique

- Double précision IEEE 754 pour les calculs physiques. `Decimal` uniquement pour l'argent.
- Topographie : les coordonnées projetées (ex. UTM, X ≈ 500 000 m, Y ≈ 1 500 000 m) sont
  centrées sur une origine locale avant les calculs différentiels, pour préserver la
  précision, puis décentrées. Cette opération est documentée dans la trace.
- Itérations : bornes et tolérances explicites, tracées ([05 §3](05-conventions.md)).

## 8. Versions et recalcul

- Le registre expose la **version courante** de chaque moteur.
- Une révision conserve sa version d'origine. Si le moteur change de version majeure,
  la révision est signalée « calculée avec v1 — version actuelle v2 ». L'utilisateur
  peut recalculer (nouvelle révision) et comparer les deux révisions côte à côte.
- On ne recalcule jamais une révision existante en place : l'historique reste fidèle à
  ce qui a été produit, validé et vérifié.

## 9. Composition

- Un moteur peut réutiliser les **fonctions de formule** d'un module partagé de son
  package (ex. `calc-elec/src/formulas/design-current.ts`), en enregistrant leurs étapes
  dans la même trace.
- L'enchaînement entre calculs distincts (bilan de puissance → circuit) passe par
  l'application et `CalculationDependency`, pas par des appels de moteur à moteur.
  Chaque calcul reste ainsi versionné et vérifiable séparément.
