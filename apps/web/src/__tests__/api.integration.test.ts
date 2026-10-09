import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditLogPageSchema,
  invitationSchema,
  memberListSchema,
  meSchema,
  organizationListSchema,
  organizationSchema,
  problemSchema,
} from '@consulpro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Harness, type Actor } from './harness';

let h: Harness;
let owner: Actor;
let orgSlug: string;

beforeAll(async () => {
  h = new Harness();
  owner = await h.signUp('owner');
  orgSlug = await h.createOrganization(owner);
});

afterAll(async () => {
  await h.close();
});

async function expectProblem(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toContain('application/problem+json');
  const body = problemSchema.parse(await response.json());
  expect(body.code).toBe(code);
  return body;
}

describe('câblage Next.js ↔ registre', () => {
  it('chaque fichier route.ts de /api/v1 pointe vers une route du registre, au bon chemin et à la bonne méthode', () => {
    const root = fileURLToPath(new URL('../app/', import.meta.url));
    const files = (readdirSync(join(root, 'api', 'v1'), { recursive: true }) as string[])
      .filter((f) => f.endsWith('route.ts'))
      .map((f) => join(root, 'api', 'v1', f));

    const wired = new Map<string, { method: string; path: string }>();
    for (const file of files) {
      const dir = relative(root, file).split(sep).slice(0, -1);
      const path = `/${dir.map((s) => s.replace(/^\[(\w+)\]$/, ':$1')).join('/')}`;
      for (const match of readFileSync(file, 'utf8').matchAll(
        /export const (GET|POST|PATCH|DELETE) = handlerFor\('([\w.]+)'\)/g,
      )) {
        wired.set(match[2] ?? '', { method: match[1] ?? '', path });
      }
    }
    expect([...wired.keys()].sort()).toEqual([...h.routes.keys()].sort());
    for (const route of h.routes.values()) {
      expect(wired.get(route.id), route.id).toEqual({ method: route.method, path: route.path });
    }
  });
});

describe('non-régression : paramètres de route', () => {
  it('route sans segment dynamique appelée avec params undefined (comportement Next.js) : pas d’erreur 500', async () => {
    const route = h.route('organizations.create');
    const request = new Request(new URL(route.path, 'http://localhost:3000'), {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        cookie: owner.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Sans paramètres', slug: `sans-params-${Date.now()}` }),
    });
    expect((await route.handle(request, undefined)).status).toBe(201);
  });
});

describe('contrats de réponse', () => {
  it('me, organisations, membres, invitations et audit respectent leurs schémas', async () => {
    meSchema.parse(await (await h.call('me.get', { actor: owner })).json());
    const orgs = organizationListSchema.parse(
      await (await h.call('organizations.list', { actor: owner })).json(),
    );
    expect(orgs.items.map((o) => o.slug)).toContain(orgSlug);

    const created = await h.call('invitations.create', {
      actor: owner,
      params: { orgSlug },
      body: { email: '  Nouveau.Membre@ConsulPro.TEST ', role: 'ENGINEER' },
    });
    expect(created.status).toBe(201);
    expect(invitationSchema.parse(await created.json()).email).toBe(
      'nouveau.membre@consulpro.test',
    );

    memberListSchema.parse(
      await (await h.call('members.list', { actor: owner, params: { orgSlug } })).json(),
    );
    const audit = auditLogPageSchema.parse(
      await (await h.call('audit.list', { actor: owner, params: { orgSlug } })).json(),
    );
    expect(audit.items.map((a) => a.action)).toEqual([
      'invitation.created',
      'organization.created',
    ]);
  });

  it('création d’organisation : 201 et DTO conforme', async () => {
    const response = await h.call('organizations.create', {
      actor: owner,
      body: { name: 'BET Kayes', slug: `bet-kayes-${Date.now()}` },
    });
    expect(response.status).toBe(201);
    expect(organizationSchema.parse(await response.json()).role).toBe('OWNER');
  });
});

describe('erreurs RFC 9457 et validation', () => {
  it('corps invalide : 400 avec le détail par champ', async () => {
    const body = await expectProblem(
      await h.call('organizations.create', { actor: owner, body: { name: 'X', slug: 'Pas Bon' } }),
      400,
      'VALIDATION',
    );
    expect(body.errors?.map((e) => e.path)).toEqual(expect.arrayContaining(['body.name']));
  });

  it('règle du domaine : identifiant réservé → 400, identifiant pris → 409', async () => {
    await expectProblem(
      await h.call('organizations.create', { actor: owner, body: { name: 'API', slug: 'api' } }),
      400,
      'ORGANIZATION_SLUG_RESERVED',
    );
    await expectProblem(
      await h.call('organizations.create', {
        actor: owner,
        body: { name: 'Doublon', slug: orgSlug },
      }),
      409,
      'ORGANIZATION_SLUG_TAKEN',
    );
  });

  it('JSON mal formé : 400', async () => {
    await expectProblem(
      await h.call('organizations.create', { actor: owner, rawBody: '{"name":' }),
      400,
      'MALFORMED_JSON',
    );
  });

  it('identifiant mal formé dans l’URL : 404', async () => {
    await expectProblem(
      await h.call('members.update', {
        actor: owner,
        params: { orgSlug, membershipId: 'pas-un-uuid' },
        body: { role: 'VIEWER' },
        headers: { 'if-match': '"1"' },
      }),
      404,
      'NOT_FOUND',
    );
  });

  it('identifiant de requête : repris s’il est valide, remplacé sinon', async () => {
    const kept = await h.call('me.get', {
      actor: owner,
      headers: { 'x-request-id': 'req-12345678' },
    });
    expect(kept.headers.get('x-request-id')).toBe('req-12345678');
    const replaced = await h.call('me.get', {
      actor: owner,
      headers: { 'x-request-id': 'bad id <script>' },
    });
    expect(replaced.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('anti-CSRF (contrôle d’origine)', () => {
  it('requête mutante sans Origin ou d’une autre origine : 403', async () => {
    const body = { name: 'Pirate', slug: `pirate-${Date.now()}` };
    await expectProblem(
      await h.call('organizations.create', { actor: owner, body, origin: null }),
      403,
      'ORIGIN_REJECTED',
    );
    await expectProblem(
      await h.call('organizations.create', { actor: owner, body, origin: 'https://evil.example' }),
      403,
      'ORIGIN_REJECTED',
    );
  });

  it('les lectures ne sont pas concernées', async () => {
    expect((await h.call('me.get', { actor: owner, origin: null })).status).toBe(200);
  });
});

describe('verrouillage optimiste (ETag / If-Match)', () => {
  it('If-Match absent : 428 ; mal formé : 400 ; périmé : 412 ; correct : 200 + nouvel ETag', async () => {
    const member = await h.addMember(orgSlug, owner, 'TECHNICIAN');
    const target = { orgSlug, membershipId: member.membershipId };

    await expectProblem(
      await h.call('members.update', { actor: owner, params: target, body: { role: 'ENGINEER' } }),
      428,
      'PRECONDITION_REQUIRED',
    );
    await expectProblem(
      await h.call('members.update', {
        actor: owner,
        params: target,
        body: { role: 'ENGINEER' },
        headers: { 'if-match': 'v1' },
      }),
      400,
      'IF_MATCH_INVALID',
    );

    const updated = await h.call('members.update', {
      actor: owner,
      params: target,
      body: { role: 'ENGINEER' },
      headers: { 'if-match': '"1"' },
    });
    expect(updated.status).toBe(200);
    expect(updated.headers.get('etag')).toBe('"2"');

    await expectProblem(
      await h.call('members.update', {
        actor: owner,
        params: target,
        body: { role: 'VIEWER' },
        headers: { 'if-match': '"1"' },
      }),
      412,
      'VERSION_MISMATCH',
    );
    await expectProblem(
      await h.call('members.remove', {
        actor: owner,
        params: target,
        headers: { 'if-match': '"1"' },
      }),
      412,
      'VERSION_MISMATCH',
    );
    expect(
      (
        await h.call('members.remove', {
          actor: owner,
          params: target,
          headers: { 'if-match': 'W/"2"' },
        })
      ).status,
    ).toBe(204);
  });
});

describe('règles de gestion des membres via l’API', () => {
  it('le propriétaire est protégé : 422', async () => {
    const admin = await h.addMember(orgSlug, owner, 'ADMIN');
    const list = memberListSchema.parse(
      await (await h.call('members.list', { actor: owner, params: { orgSlug } })).json(),
    );
    const ownerMembership = list.items.find((m) => m.role === 'OWNER');
    await expectProblem(
      await h.call('members.update', {
        actor: admin,
        params: { orgSlug, membershipId: ownerMembership?.id ?? '' },
        body: { role: 'VIEWER' },
        headers: { 'if-match': `"${ownerMembership?.version ?? 1}"` },
      }),
      422,
      'OWNER_PROTECTED',
    );
  });

  it('invitation à une adresse déjà membre : 409', async () => {
    await expectProblem(
      await h.call('invitations.create', {
        actor: owner,
        params: { orgSlug },
        body: { email: owner.email, role: 'VIEWER' },
      }),
      409,
      'ALREADY_MEMBER',
    );
  });

  it('jeton d’invitation inconnu : 404', async () => {
    await expectProblem(
      await h.call('invitations.accept', { actor: owner, body: { token: 'x'.repeat(43) } }),
      404,
      'NOT_FOUND',
    );
  });
});
