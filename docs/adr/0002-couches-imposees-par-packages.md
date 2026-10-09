# ADR-0002 — Couches imposées par les packages

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

Le cahier des charges impose la séparation UI → Application Services → Domain →
Calculation Engines → Infrastructure, et interdit les formules métier dans les
composants React.

## Décision

- Chaque couche est un ou plusieurs packages : `apps/web` (UI), `application`, `domain`,
  `calc-core` + `calc-*`, `infrastructure` + `db`.
- L'infrastructure implémente des **ports** (interfaces) déclarés par `application`
  (inversion de dépendance). L'application ne connaît ni Prisma, ni S3, ni Next.js.
- `dependency-cruiser` vérifie en CI les règles d'import
  ([04 §2](../architecture/04-dependances.md)).
- Une règle ESLint interdit les API non déterministes dans les moteurs.

## Conséquences

- (+) Une violation de couche fait échouer la CI : elle n'est pas laissée à la seule relecture.
- (+) `application` et les moteurs sont testables sans base ni serveur HTTP.
- (−) Un peu de code de câblage dans les racines de composition (`apps/web/src/server`, `apps/worker`).
