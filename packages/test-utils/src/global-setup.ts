import type {} from 'vitest';

import { startTestDatabase } from './database';

declare module 'vitest' {
  export interface ProvidedContext {
    database: { adminUrl: string; appUrl: string };
  }
}

interface ProvideTarget {
  provide(key: 'database', value: { adminUrl: string; appUrl: string }): void;
}

/**
 * `globalSetup` Vitest : une base éphémère pour toute l'exécution, partagée par les
 * fichiers de test (chaque test crée ses propres organisations et utilisateurs).
 */
export async function setupTestDatabase(project: ProvideTarget): Promise<() => Promise<void>> {
  const database = await startTestDatabase();
  project.provide('database', { adminUrl: database.adminUrl, appUrl: database.appUrl });
  return () => database.stop();
}
