import { unique, adminQuery } from '@consulpro/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createInfrastructure, type Infrastructure } from '../index';
import { MemoryMailer } from '../mail/smtp-mailer';
import { database } from './helpers';

const APP_URL = 'http://localhost:3000';
const PASSWORD = 'Mot-de-passe-solide-2026';

let infra: Infrastructure;
let limited: Infrastructure;
let mailer: MemoryMailer;

function post(
  target: Infrastructure,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return target.auth.handler(
    new Request(`${APP_URL}/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: APP_URL,
        'x-forwarded-for': '203.0.113.9',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

function get(target: Infrastructure, url: string, headers: Record<string, string> = {}) {
  return target.auth.handler(
    new Request(url, {
      headers: { origin: APP_URL, 'x-forwarded-for': '203.0.113.9', ...headers },
    }),
  );
}

async function auditActions(email: string): Promise<string[]> {
  const rows = await adminQuery<{ action: string }>(
    database().adminUrl,
    `SELECT a.action FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE u.email = $1 OR a.metadata->>'email' = $1
      ORDER BY a.id`,
    [email],
  );
  return rows.map((r) => r.action);
}

beforeAll(() => {
  mailer = new MemoryMailer();
  const config = {
    databaseUrl: database().appUrl,
    appUrl: APP_URL,
    authSecret: 'x'.repeat(48),
    mailer,
  };
  infra = createInfrastructure({ ...config, rateLimit: false });
  limited = createInfrastructure({ ...config, rateLimit: true });
});

afterAll(async () => {
  await infra.db.$disconnect();
  await limited.db.$disconnect();
});

describe('authentification', () => {
  it('inscription → e-mail de vérification → connexion ; chaque étape auditée', async () => {
    const email = `${unique('signup')}@consulpro.test`.toLowerCase();

    const signUp = await post(infra, '/sign-up/email', {
      email,
      password: PASSWORD,
      name: 'Fatou Diallo',
    });
    expect(signUp.status).toBe(200);

    // Connexion refusée tant que l'adresse n'est pas vérifiée.
    const early = await post(infra, '/sign-in/email', { email, password: PASSWORD });
    expect(early.status).toBe(403);

    const link = mailer.lastLinkTo(email);
    expect(link).toContain('/api/auth/verify-email?token=');
    const verified = await get(infra, link ?? '');
    expect([200, 302]).toContain(verified.status);

    const signIn = await post(infra, '/sign-in/email', { email, password: PASSWORD });
    expect(signIn.status).toBe(200);
    const cookie = signIn.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('consulpro.session_token=');
    expect(cookie.toLowerCase()).toContain('httponly');

    const session = await get(infra, `${APP_URL}/api/auth/get-session`, {
      cookie: cookie.split(';')[0] ?? '',
    });
    expect(await session.json()).toMatchObject({ user: { email, emailVerified: true } });

    expect(await auditActions(email)).toEqual(
      expect.arrayContaining([
        'auth.sign_up',
        'auth.email_verified',
        'auth.sign_in',
        'auth.sign_in_failed',
      ]),
    );
  });

  it('mot de passe trop court refusé (12 caractères minimum)', async () => {
    const response = await post(infra, '/sign-up/email', {
      email: `${unique('short')}@consulpro.test`,
      password: 'court',
      name: 'X',
    });
    expect(response.status).toBe(400);
  });

  it('échec de connexion audité, sans le mot de passe', async () => {
    const email = `${unique('wrong')}@consulpro.test`.toLowerCase();
    const response = await post(infra, '/sign-in/email', {
      email,
      password: 'mauvais-mot-de-passe',
    });
    expect(response.status).toBe(401);
    expect(await auditActions(email)).toEqual(['auth.sign_in_failed']);
    const rows = await adminQuery<{ metadata: unknown }>(
      database().adminUrl,
      `SELECT metadata FROM audit_logs WHERE metadata->>'email' = $1`,
      [email],
    );
    expect(JSON.stringify(rows)).not.toContain('mauvais-mot-de-passe');
  });

  it('réinitialisation du mot de passe : lien envoyé, demande auditée', async () => {
    const email = `${unique('reset')}@consulpro.test`.toLowerCase();
    await post(infra, '/sign-up/email', { email, password: PASSWORD, name: 'Reset' });
    const response = await post(infra, '/request-password-reset', {
      email,
      redirectTo: `${APP_URL}/reinitialiser`,
    });
    expect(response.status).toBe(200);
    expect(mailer.sent.at(-1)).toMatchObject({
      to: email,
      subject: expect.stringContaining('Réinitialisation') as unknown,
    });
    expect(await auditActions(email)).toContain('auth.password_reset_requested');
  });

  it('les endpoints non utilisés sont désactivés', async () => {
    const response = await post(infra, '/delete-user', {});
    expect(response.status).toBe(404);
  });
});

describe('limitation de débit (authentification)', () => {
  it('au-delà de 5 tentatives de connexion en 15 minutes : 429', async () => {
    const email = `${unique('brute')}@consulpro.test`;
    const ip = { 'x-forwarded-for': '192.0.2.77' };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await post(limited, '/sign-in/email', { email, password: 'x'.repeat(12) }, ip)).status,
      );
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
