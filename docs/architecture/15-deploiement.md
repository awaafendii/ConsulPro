# 15 — Déploiement (Vercel + PostgreSQL managé)

Cible : l'application `apps/web` (Next.js, sortie `standalone`) sur **Vercel**, avec une base
**PostgreSQL managée** (Neon ou Supabase). Les fichiers de support sont `apps/web/vercel.json` et
`apps/web/.env.production.example`.

> Principe de sécurité (12-securite-rbac.md) : l'application se connecte avec le rôle **restreint**
> `consulpro_app` soumis à la RLS ; les **migrations** s'exécutent à part avec le rôle **propriétaire**.
> L'application ne doit jamais disposer du rôle propriétaire.

## 0. Prérequis (avant toute mise en ligne)

- La CI est verte : `pnpm typecheck`, `pnpm lint`, `pnpm depcruise`, `pnpm test`,
  **`pnpm test:integration`** (Docker) et **`pnpm --filter @consulpro/web test:e2e`** (après `pnpm build`).
  Règle du projet : pas de mise en production sur une phase non stabilisée.
- Un compte Vercel, un hébergeur Postgres, un fournisseur SMTP et un nom de domaine.

## 1. Provisionner PostgreSQL

Créer une base `consulpro`. Récupérer **deux** chaînes de connexion :

- **URL directe** (non poolée) — pour les migrations (rôle propriétaire).
- **URL poolée** — pour le runtime serverless : Neon active le pooler (hôte `…-pooler`), Supabase
  expose pgBouncer sur le port **6543**. Exiger `sslmode=require`.

## 2. Rôle applicatif restreint + RLS

Les politiques RLS sont créées par les migrations. Créer le rôle applicatif (NI superutilisateur,
NI `BYPASSRLS`), équivalent production de `docker/postgres/init/01-app-role.sql` :

```sql
CREATE ROLE consulpro_app LOGIN PASSWORD '<MOT_DE_PASSE_FORT>' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE consulpro TO consulpro_app;
GRANT USAGE ON SCHEMA public TO consulpro_app;
-- Droits sur les objets créés par les migrations (à exécuter APRÈS l'étape 3, en tant que propriétaire) :
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO consulpro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO consulpro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO consulpro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO consulpro_app;
```

> Les tables immuables (révisions, avis, liens de données…) révoquent `UPDATE`/`DELETE` au rôle
> applicatif via leurs migrations : ne pas réaccorder ces droits à la main.

## 3. Migrations (rôle propriétaire, hors Vercel)

Depuis un poste ou la CI, avec l'URL **directe** du propriétaire :

```bash
DATABASE_ADMIN_URL="postgresql://consulpro:<pass>@<hote-direct>:5432/consulpro?sslmode=require" \
  pnpm db:deploy
```

(`db:deploy` = `prisma migrate deploy`. `prisma.config.ts` lit `DATABASE_ADMIN_URL`.)

## 4. Référentiels publiés

Désigner un administrateur de plateforme puis publier les référentiels (en tant que propriétaire,
`DATABASE_ADMIN_URL` défini). Le compte doit exister (inscription préalable via l'application).

```bash
pnpm platform:grant-admin <email-admin>
pnpm standards:load packages/standards/seeds/elec/nfc15-100-2002.json      --publish-as <email-admin>
pnpm standards:load packages/standards/seeds/elec/ute-c15-105-2003.json    --publish-as <email-admin>
pnpm standards:load packages/standards/seeds/plumbing/nf-dtu-60.11-2013.json --publish-as <email-admin>
pnpm standards:load packages/standards/seeds/plumbing/nf-dtu-64.1-2013.json  --publish-as <email-admin>
pnpm standards:load packages/standards/seeds/plumbing/tubes-en-1.json        --publish-as <email-admin>
pnpm standards:load packages/standards/seeds/btp/usages-metre-1.json         --publish-as <email-admin>
pnpm standards:load packages/standards/seeds/topo/topo-tolerances.json       --publish-as <email-admin>
```

> Ne PAS publier `demo/demo-1.json` en production (moteurs de démonstration, sans valeur technique).

## 5. Projet Vercel

1. Importer le dépôt dans Vercel. Régler le **Root Directory** sur `apps/web` (c'est là que `next`
   est déclaré : à la racine du dépôt, Vercel échoue avec « No Next.js version detected ») et la
   version de **Node.js** sur 24.x. Le `apps/web/vercel.json` fourni définit `installCommand` et
   `buildCommand` (Turborepo depuis la racine du dépôt, ce qui déclenche `prisma generate`).
2. **Variables d'environnement** (Production et Preview) : reprendre `apps/web/.env.production.example`.
   - `DATABASE_URL` = URL **poolée** du rôle `consulpro_app`.
   - `APP_URL` = domaine public https (voir étape 6).
   - `BETTER_AUTH_SECRET`, `APP_ENV=production`, `APP_TIME_ZONE`.
   - `SMTP_*` / `MAIL_FROM` : **optionnels**. Sans eux, aucun e-mail n'est envoyé et l'inscription
     donne un accès immédiat (pas de vérification). Les définir (toutes) active la vérification
     par e-mail et la réinitialisation de mot de passe.
   - NE PAS définir `DATABASE_ADMIN_URL` ni `CONSULPRO_DEMO_ENGINES`.
3. Lancer le déploiement.

> Les migrations ne s'exécutent PAS sur Vercel (le runtime n'a que le rôle restreint). Toujours via
> l'étape 3. Le build Vercel ne se connecte pas à la base (pages dynamiques + `prisma generate` hors-ligne).

## 6. Domaine

Ajouter le domaine dans Vercel, configurer le DNS, puis fixer `APP_URL` sur ce domaine (en https) :
il sert aux liens des e-mails et au **contrôle d'origine** des routes API
(`apps/web/src/server/http/route.ts` rejette une origine ≠ `APP_URL`). Redéployer après modification.

## 7. Première organisation

Ouvrir `https://<domaine>/inscription`, créer le compte propriétaire (vérification par e-mail via le
SMTP configuré), puis créer l'organisation. Pour l'administration de plateforme, utiliser l'étape 4.

## 8. Vérifications post-déploiement

- `GET /connexion` répond 200 ; une route protégée redirige (307) vers `/connexion`.
- Inscription → accès immédiat (sans SMTP) ou e-mail de vérification reçu (avec SMTP) → connexion.
- Création d'un projet, d'un calcul, d'une révision : la RLS n'empêche aucune opération légitime
  (sinon, revoir les droits de l'étape 2).

## Limites connues

- **CSP** complète par nonces prévue en Phase 10 (`next.config.ts` pose déjà `frame-ancestors 'none'`).
- **Stockage de fichiers** (imports/rapports) : voir ADR 0010 ; prévoir un stockage objet avant
  d'activer ces fonctions en production.
- Serverless + Prisma : toujours utiliser l'URL **poolée** pour `DATABASE_URL`.
