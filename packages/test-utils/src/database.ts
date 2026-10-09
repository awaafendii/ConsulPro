import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../db/prisma/migrations/', import.meta.url));
const APP_ROLE_PASSWORD = 'consulpro_app_test';

export interface TestDatabase {
  /** Rôle propriétaire (superutilisateur du conteneur) : préparation et contrôles uniquement. */
  readonly adminUrl: string;
  /** Rôle applicatif restreint, soumis à la RLS : celui qu'utilise l'application. */
  readonly appUrl: string;
  stop(): Promise<void>;
}

/** Applique les migrations Prisma réelles, dans l'ordre, avec le rôle propriétaire. */
export async function applyMigrations(adminUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const dirs = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      await client.query(readFileSync(`${MIGRATIONS_DIR}${dir}/migration.sql`, 'utf8'));
    }
  } finally {
    await client.end();
  }
}

/** Démarre un PostgreSQL 17 éphémère, crée le rôle applicatif et applique les migrations. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17')
    .withDatabase('consulpro')
    .withUsername('consulpro')
    .withPassword('consulpro')
    .start();
  const adminUrl = container.getConnectionUri();

  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  await client.query(
    `CREATE ROLE consulpro_app LOGIN PASSWORD '${APP_ROLE_PASSWORD}' NOSUPERUSER NOBYPASSRLS`,
  );
  await client.end();
  await applyMigrations(adminUrl);

  const app = new URL(adminUrl);
  app.username = 'consulpro_app';
  app.password = APP_ROLE_PASSWORD;

  return {
    adminUrl,
    appUrl: app.toString(),
    stop: async () => {
      await container.stop();
    },
  };
}

/** Exécute une requête avec le rôle propriétaire (préparation de données, contrôles). */
export async function adminQuery<T extends pg.QueryResultRow>(
  adminUrl: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}
