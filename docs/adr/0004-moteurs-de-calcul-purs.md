# ADR-0004 — Moteurs de calcul purs, autorité serveur

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

Les calculs doivent être déterministes, traçables, testables isolément, et ne jamais
exister uniquement dans le frontend.

## Décision

- Moteurs en TypeScript pur (`calc-core`, `calc-*`), dont la seule dépendance est `zod`.
- Pipeline commun : validation → calcul → vérification → résultat → avertissements →
  hypothèses ([10](../architecture/10-moteur-de-calcul.md)).
- Le résultat persisté est **toujours** calculé côté serveur. Le navigateur peut
  exécuter le même package pour un aperçu instantané, marqué « aperçu non enregistré ».
- Versionnement semver par moteur. Une révision conserve la version qui l'a produite.

## Conséquences

- (+) Tests unitaires rapides sur des cas de référence, sans infrastructure.
- (+) Même code pour l'aperçu et pour le calcul officiel : aucune divergence possible.
- (−) Discipline nécessaire (règles ESLint, revue) pour garder les moteurs purs.

## Alternatives écartées

- **Formules en base (langage de règles)** : moins testables, avec un risque de
  divergence avec le code.
- **Moteur dans un autre langage (Python)** : écosystème scientifique riche, mais deux
  piles à maintenir et aucun aperçu dans le navigateur. Non justifié pour les calculs visés.
