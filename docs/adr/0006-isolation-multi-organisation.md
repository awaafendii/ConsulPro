# ADR-0006 — Isolation multi-organisation

**Statut** : Accepté — RLS validée par le spike de la Phase 1 · **Date** : 2026-10-08

## Contexte

Plusieurs organisations partagent la même base. Une fuite de données entre
organisations est inacceptable.

## Décision

1. Base partagée, colonne `organization_id NOT NULL` sur toutes les tables métier.
2. Repositories qui exigent un `TenantContext` et filtrent systématiquement. Aucun accès
   Prisma hors des repositories (contrôle d'architecture en CI).
3. **Défense en profondeur** : Row-Level Security PostgreSQL alimentée par
   `set_config('app.organization_id', …, true)` dans chaque transaction, via une
   extension du client Prisma. Faisabilité et coût validés par un spike en Phase 1.
4. Tests d'isolation systématiques (IDOR), générés depuis la matrice RBAC.
5. Une ressource d'une autre organisation renvoie 404.

## Résultat du spike (Phase 1, 2026-10-08) : RLS retenue

La RLS est **en place** et testée sur PostgreSQL réel. Mise en œuvre :

- Deux rôles : `consulpro` (propriétaire, migrations uniquement) et `consulpro_app`
  (application : ni superutilisateur, ni `BYPASSRLS`, vérifié par test).
- Chaque unité de travail est une transaction interactive Prisma qui commence par
  `set_config('app.organization_id' | 'app.user_id' | 'app.user_email', …, true)`.
- Fonctions `app_current_org()`, `app_current_user()`, `app_current_email()` avec `NULLIF(…, '')`
  (une variable déjà utilisée dans la session vaut `''` et non `NULL` après la transaction).
- Politiques séparées lecture / écriture : on lit ses propres adhésions dans tous les cas,
  mais on n'écrit que dans l'organisation du contexte.
- Les invitations sont lisibles hors organisation **uniquement** par l'adresse invitée
  (acceptation sans privilège particulier).
- Audit : insertion par `createMany` (pas de `RETURNING`, la ligne n'a pas à être relue).
- Les tables d'authentification (`users`, `sessions`, …) ne sont pas sous RLS : elles ne
  contiennent aucune donnée d'organisation.

Coût mesuré : une requête `set_config` par transaction ; aucun effet perceptible sur
les tests (104 tests d'intégration en moins d'une minute, conteneur compris).

## Conséquences

- (+) Deux barrières indépendantes : l'application et la base.
- (−) RLS avec Prisma impose des transactions explicites. Le surcoût sera mesuré pendant le spike.

## Alternatives écartées

- **Une base ou un schéma par organisation** : isolation forte, mais migrations et
  exploitation beaucoup plus complexes. Disproportionné au lancement.
