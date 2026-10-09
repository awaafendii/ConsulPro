import { readFileSync } from 'node:fs';

import type { Fixture } from './support';

/** Données créées par global-setup (propriétaire et organisation). */
export function fixture(): Fixture {
  return JSON.parse(readFileSync('e2e/.auth/fixture.json', 'utf8')) as Fixture;
}

export const anonymous = { storageState: { cookies: [], origins: [] } };
