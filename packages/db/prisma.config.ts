import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// Les migrations s'exécutent avec le rôle PROPRIÉTAIRE (DATABASE_ADMIN_URL),
// l'application avec le rôle restreint soumis à la RLS (DATABASE_URL).
if (existsSync('.env')) process.loadEnvFile('.env');

// Prisma exige un export par défaut pour ce fichier.
// eslint-disable-next-line no-restricted-syntax
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_ADMIN_URL ?? '' },
});
