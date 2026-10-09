# ADR-0001 — Monorepo pnpm + Turborepo

**Statut** : Accepté · **Date** : 2026-10-08

## Contexte

ConsulPro comprend une application web, un worker et une dizaine de bibliothèques
(moteurs de calcul, domaine, application, infrastructure, design system). Les moteurs
doivent être testables isolément et réutilisables côté serveur comme côté navigateur
(aperçu).

## Décision

Un monorepo unique avec pnpm workspaces (liens stricts, pas de dépendances fantômes)
et Turborepo (cache et orchestration des tâches `build`, `test`, `lint`, `typecheck`).

## Conséquences

- (+) Une PR peut modifier un moteur et son interface de façon atomique.
- (+) Les frontières entre couches deviennent des frontières de packages (ADR-0002).
- (+) Le cache Turborepo n'exécute que les tests des packages impactés.
- (−) Configuration initiale plus lourde qu'une application Next.js seule.

## Alternatives écartées

- **Application Next.js unique, découpée en dossiers** : les frontières de couches ne
  seraient que des conventions, ce qui contredit l'exigence de séparation stricte.
- **Nx** : plus puissant mais plus intrusif ; Turborepo suffit.
