# Décisions d'architecture (ADR)

Format : contexte → décision → conséquences → alternatives écartées.
Statuts : `Proposé` → `Accepté` | `Rejeté` | `Remplacé par ADR-XXXX`.

| ADR                                                   | Titre                                                      | Statut  |
| ----------------------------------------------------- | ---------------------------------------------------------- | ------- |
| [0001](0001-monorepo-pnpm-turborepo.md)               | Monorepo pnpm + Turborepo                                  | Accepté |
| [0002](0002-couches-imposees-par-packages.md)         | Couches imposées par les packages                          | Accepté |
| [0003](0003-api-rest-dans-nextjs.md)                  | API REST `/api/v1` dans Next.js, contrats Zod              | Accepté |
| [0004](0004-moteurs-de-calcul-purs.md)                | Moteurs de calcul purs, autorité serveur                   | Accepté |
| [0005](0005-referentiels-versionnes-immuables.md)     | Référentiels versionnés immuables, snapshot des paramètres | Accepté |
| [0006](0006-isolation-multi-organisation.md)          | Isolation multi-organisation                               | Accepté |
| [0007](0007-revisions-de-calcul-immuables.md)         | Révisions de calcul immuables                              | Accepté |
| [0008](0008-jobs-asynchrones-postgresql.md)           | Jobs asynchrones sur PostgreSQL (pg-boss)                  | Accepté |
| [0009](0009-authentification.md)                      | Authentification (Better Auth)                             | Accepté |
| [0010](0010-stockage-fichiers.md)                     | Stockage de fichiers compatible S3                         | Accepté |
