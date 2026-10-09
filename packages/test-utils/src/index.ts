export { adminQuery, applyMigrations, startTestDatabase, type TestDatabase } from './database';
export { setupTestDatabase } from './global-setup';

let counter = 0;

/** Suffixe unique par appel : les tests partagent une base, jamais des données. */
export function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${process.pid.toString(36)}-${Date.now().toString(36)}-${counter.toString(36)}`;
}
