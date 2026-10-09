# ADR-0007 — Révisions de calcul immuables

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

Chaque calcul doit être versionné et conserver auteur, date, entrées, sorties,
paramètres, hypothèses, référentiel et version.

## Décision

- `Calculation` (calcul logique) → `CalculationRevision` (instantané immuable, numéroté).
- Chaque exécution crée une nouvelle révision. Aucune révision n'est modifiée ni supprimée.
- La validation et la vérification sont des enregistrements `CalculationReview`
  (append-only). Le statut de workflow en est dénormalisé par un trigger contrôlé.
- Les dépendances entre calculs (`CalculationDependency`) signalent l'obsolescence en aval.

## Conséquences

- (+) Historique fidèle et opposable ; comparaison de révisions.
- (+) Les rapports référencent des révisions exactes : ils sont reproductibles.
- (−) Plus de lignes en base. Une purge éventuelle relèverait d'une politique de
  rétention explicite, jamais d'un mécanisme automatique.
