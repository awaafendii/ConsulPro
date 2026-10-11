import { ok } from '@consulpro/calc-core';
import {
  acceptInvitationBodySchema,
  auditLogQuerySchema,
  createInvitationBodySchema,
  createOrganizationBodySchema,
  updateMemberRoleBodySchema,
} from '@consulpro/contracts';
import { z } from 'zod';

import {
  auditLogDto,
  invitationDto,
  memberDto,
  organizationDto,
  organizationRefDto,
} from './presenters';
import { orgRoute, userRoute, type RouteDefinition, type ServerDeps } from './route';
import { createCalculationRoutes } from './routes-calculations';
import { createProjectRoutes } from './routes-projects';

const ORG = '/api/v1/organizations/:orgSlug';

/**
 * Registre des routes de l'API v1. Chaque fichier `route.ts` de Next.js
 * pointe vers une entrée de ce registre (vérifié par test).
 */
export function createRoutes(deps: ServerDeps): RouteDefinition[] {
  const { app } = deps;

  return [
    userRoute(deps, {
      id: 'me.get',
      method: 'GET',
      path: '/api/v1/me',
      run: ({ ctx }) =>
        Promise.resolve(
          ok({
            status: 200 as const,
            body: {
              id: ctx.actor.userId,
              email: ctx.actor.email,
              name: ctx.actor.name,
              emailVerified: ctx.actor.emailVerified,
            },
          }),
        ),
    }),

    userRoute(deps, {
      id: 'organizations.list',
      method: 'GET',
      path: '/api/v1/organizations',
      async run({ ctx }) {
        const result = await app.organizations.listMine(ctx);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(organizationDto) } })
          : result;
      },
    }),

    userRoute(deps, {
      id: 'organizations.create',
      method: 'POST',
      path: '/api/v1/organizations',
      body: createOrganizationBodySchema,
      async run({ ctx, body }) {
        const result = await app.organizations.create(ctx, body);
        return result.ok ? ok({ status: 201, body: organizationDto(result.value) }) : result;
      },
    }),

    orgRoute(deps, 'org.read', {
      id: 'members.list',
      method: 'GET',
      path: `${ORG}/members`,
      async run({ ctx }) {
        const result = await app.members.list(ctx);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(memberDto) } })
          : result;
      },
    }),

    orgRoute(deps, 'org.member.manage', {
      id: 'members.update',
      method: 'PATCH',
      path: `${ORG}/members/:membershipId`,
      params: z.object({ membershipId: z.uuid() }),
      body: updateMemberRoleBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.members.changeRole(ctx, params.membershipId, body.role, version);
        return result.ok
          ? ok({ status: 200, body: result.value, etag: result.value.version })
          : result;
      },
    }),

    orgRoute(deps, 'org.member.manage', {
      id: 'members.remove',
      method: 'DELETE',
      path: `${ORG}/members/:membershipId`,
      params: z.object({ membershipId: z.uuid() }),
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.members.remove(ctx, params.membershipId, version);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    orgRoute(deps, 'org.member.manage', {
      id: 'invitations.list',
      method: 'GET',
      path: `${ORG}/invitations`,
      async run({ ctx }) {
        const result = await app.invitations.list(ctx);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(invitationDto) } })
          : result;
      },
    }),

    orgRoute(deps, 'org.member.manage', {
      id: 'invitations.create',
      method: 'POST',
      path: `${ORG}/invitations`,
      body: createInvitationBodySchema,
      async run({ ctx, body }) {
        const result = await app.invitations.create(ctx, body);
        return result.ok ? ok({ status: 201, body: invitationDto(result.value) }) : result;
      },
    }),

    orgRoute(deps, 'org.member.manage', {
      id: 'invitations.revoke',
      method: 'POST',
      path: `${ORG}/invitations/:invitationId/revoke`,
      params: z.object({ invitationId: z.uuid() }),
      async run({ ctx, params }) {
        const result = await app.invitations.revoke(ctx, params.invitationId);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    userRoute(deps, {
      id: 'invitations.accept',
      method: 'POST',
      path: '/api/v1/invitations/accept',
      body: acceptInvitationBodySchema,
      async run({ ctx, body }) {
        const result = await app.invitations.accept(ctx, body.token);
        return result.ok
          ? ok({ status: 200, body: { organization: organizationRefDto(result.value) } })
          : result;
      },
    }),

    orgRoute(deps, 'audit.read', {
      id: 'audit.list',
      method: 'GET',
      path: `${ORG}/audit-logs`,
      query: auditLogQuerySchema,
      async run({ ctx, query }) {
        const result = await app.audit.list(ctx, { cursor: query.cursor, limit: query.limit });
        return result.ok
          ? ok({
              status: 200,
              body: {
                items: result.value.items.map(auditLogDto),
                nextCursor: result.value.nextCursor,
              },
            })
          : result;
      },
    }),

    ...createProjectRoutes(deps),
    ...createCalculationRoutes(deps),
  ];
}
