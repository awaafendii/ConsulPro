/**
 * Matrice de permissions de l'API, GÉNÉRÉE depuis la matrice RBAC du domaine
 * (06-strategie-de-tests.md §4). Toute route du registre doit y figurer.
 */
import { can, ORG_ROLES, type OrgRole } from '@consulpro/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Harness, type Actor, type CallOptions } from './harness';

/** Statut attendu quand l'accès est accordé. */
const SUCCESS: Readonly<Record<string, number>> = {
  'members.list': 200,
  'members.update': 200,
  'members.remove': 204,
  'invitations.list': 200,
  'invitations.create': 201,
  'invitations.revoke': 204,
  'audit.list': 200,
  'me.get': 200,
  'organizations.list': 200,
  'organizations.create': 201,
  'invitations.accept': 200,
};

let h: Harness;
let orgSlug: string;
let owner: Actor;
const members = new Map<OrgRole, Actor>();
let stranger: Actor;
let outsider: Actor;

/** Construit une requête valide pour une route d'organisation (données fraîches à chaque appel). */
const orgRequests: Readonly<Record<string, () => Promise<CallOptions>>> = {
  'members.list': () => Promise.resolve({}),
  'members.update': async () => {
    const target = await h.addMember(orgSlug, owner, 'VIEWER');
    return {
      params: { membershipId: target.membershipId },
      body: { role: 'VIEWER' },
      headers: { 'if-match': '"1"' },
    };
  },
  'members.remove': async () => {
    const target = await h.addMember(orgSlug, owner, 'VIEWER');
    return { params: { membershipId: target.membershipId }, headers: { 'if-match': '"1"' } };
  },
  'invitations.list': () => Promise.resolve({}),
  'invitations.create': () =>
    Promise.resolve({
      body: { email: `invite-${String(Math.random()).slice(2)}@consulpro.test`, role: 'VIEWER' },
    }),
  'invitations.revoke': async () => ({ params: { invitationId: await h.invite(orgSlug, owner) } }),
  'audit.list': () => Promise.resolve({}),
};

/** Requête valide pour une route « utilisateur authentifié », pour un acteur donné. */
const userRequests: Readonly<Record<string, (actor: Actor) => Promise<CallOptions>>> = {
  'me.get': () => Promise.resolve({}),
  'organizations.list': () => Promise.resolve({}),
  'organizations.create': () => {
    const slug = 'cree-' + String(Math.random()).slice(2, 14);
    return Promise.resolve({ body: { name: `Org ${slug}`, slug } });
  },
  'invitations.accept': async (actor) => {
    const other = await h.signUp('inviteur');
    const slug = await h.createOrganization(other);
    await h.call('invitations.create', {
      actor: other,
      params: { orgSlug: slug },
      body: { email: actor.email, role: 'VIEWER' },
    });
    const token = /invitation\/(\S+)/.exec(h.mailer.sent.at(-1)?.text ?? '')?.[1] ?? '';
    return { body: { token } };
  },
};

beforeAll(async () => {
  h = new Harness();
  owner = await h.signUp('owner');
  orgSlug = await h.createOrganization(owner);
  members.set('OWNER', owner);
  for (const role of ORG_ROLES.filter((r) => r !== 'OWNER')) {
    members.set(role, await h.addMember(orgSlug, owner, role));
  }
  stranger = await h.signUp('stranger');
  outsider = await h.signUp('outsider');
  await h.createOrganization(outsider);
});

afterAll(async () => {
  await h.close();
});

describe('couverture de la matrice', () => {
  it('chaque route du registre a un générateur de requête et un statut de succès', () => {
    for (const route of h.routes.values()) {
      const builder =
        route.access.kind === 'organization' ? orgRequests[route.id] : userRequests[route.id];
      expect(builder, `route ${route.id} absente de la matrice de tests`).toBeDefined();
      expect(SUCCESS[route.id], `statut de succès manquant pour ${route.id}`).toBeDefined();
    }
  });
});

describe('routes d’organisation : rôle × permission', () => {
  const orgRouteIds = Object.keys(orgRequests);

  for (const id of orgRouteIds) {
    describe(id, () => {
      for (const role of ORG_ROLES) {
        it(role, async () => {
          const route = h.route(id);
          if (route.access.kind !== 'organization')
            throw new Error('route d’organisation attendue');
          const request = await orgRequests[id]!();
          const response = await h.call(id, {
            ...request,
            actor: members.get(role)!,
            params: { orgSlug, ...request.params },
          });
          const expected = can(role, route.access.permission) ? SUCCESS[id] : 403;
          expect(response.status, await response.clone().text()).toBe(expected);
        });
      }

      it('non-membre de l’organisation : 404 (existence non révélée)', async () => {
        const request = await orgRequests[id]!();
        const response = await h.call(id, {
          ...request,
          actor: stranger,
          params: { orgSlug, ...request.params },
        });
        expect(response.status).toBe(404);
      });

      it('membre d’une autre organisation : 404', async () => {
        const request = await orgRequests[id]!();
        const response = await h.call(id, {
          ...request,
          actor: outsider,
          params: { orgSlug, ...request.params },
        });
        expect(response.status).toBe(404);
      });

      it('non authentifié : 401', async () => {
        const request = await orgRequests[id]!();
        const response = await h.call(id, {
          ...request,
          actor: null,
          params: { orgSlug, ...request.params },
        });
        expect(response.status).toBe(401);
      });
    });
  }
});

describe('routes utilisateur', () => {
  for (const id of Object.keys(userRequests)) {
    it(`${id} : authentifié → succès, anonyme → 401`, async () => {
      const actor = await h.signUp('user-route');
      const request = await userRequests[id]!(actor);
      expect((await h.call(id, { ...request, actor })).status).toBe(SUCCESS[id]);
      expect((await h.call(id, { ...(await userRequests[id]!(actor)), actor: null })).status).toBe(
        401,
      );
    });
  }
});
