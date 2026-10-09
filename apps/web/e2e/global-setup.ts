/**
 * Préparation E2E : un propriétaire (inscription réelle + vérification par e-mail via
 * Mailpit) et son organisation. Les compteurs de limitation de débit de l'environnement
 * de DÉVELOPPEMENT sont remis à zéro, pour que les exécutions successives restent possibles.
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { request } from '@playwright/test';
import pg from 'pg';

import { BASE_URL, lastLinkTo, PASSWORD, type Fixture } from './support';

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ?? 'postgresql://consulpro:consulpro@localhost:5434/consulpro';

async function resetDevRateLimits(): Promise<void> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query('DELETE FROM rate_limits');
  } finally {
    await client.end();
  }
}

// Playwright exige un export par défaut pour le globalSetup.
// eslint-disable-next-line no-restricted-syntax
export default async function globalSetup(): Promise<void> {
  await resetDevRateLimits();
  const stamp = Date.now().toString(36);
  const fixture: Fixture = {
    ownerEmail: `awa.diop.${stamp}@bet-sahel.test`,
    ownerName: 'Awa Diop',
    orgSlug: `bet-sahel-${stamp}`,
    orgName: 'BET Sahel Ingénierie',
  };

  const api = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  });
  const signUp = await api.post('/api/auth/sign-up/email', {
    data: {
      email: fixture.ownerEmail,
      password: PASSWORD,
      name: fixture.ownerName,
      callbackURL: '/organisations',
    },
  });
  if (!signUp.ok())
    throw new Error(`Inscription impossible : ${signUp.status()} ${await signUp.text()}`);
  // La vérification connecte automatiquement l'utilisateur (cookie de session).
  const verify = await api.get(await lastLinkTo(fixture.ownerEmail, 'Confirmez'));
  if (verify.status() >= 400) throw new Error(`Vérification impossible : ${verify.status()}`);
  const org = await api.post('/api/v1/organizations', {
    data: { name: fixture.orgName, slug: fixture.orgSlug },
  });
  if (org.status() !== 201)
    throw new Error(`Organisation non créée : ${org.status()} ${await org.text()}`);

  mkdirSync('e2e/.auth', { recursive: true });
  await api.storageState({ path: 'e2e/.auth/owner.json' });
  writeFileSync('e2e/.auth/fixture.json', JSON.stringify(fixture, null, 2));
  await api.dispose();
}
