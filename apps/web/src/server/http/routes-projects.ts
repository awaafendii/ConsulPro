import { ok } from '@consulpro/calc-core';
import {
  activityQuerySchema,
  addProjectMemberBodySchema,
  disciplineSchema,
  overrideBodySchema,
  projectBodySchema,
  projectListQuerySchema,
  setProjectStandardsBodySchema,
  updateOverrideBodySchema,
  updateProjectMemberBodySchema,
} from '@consulpro/contracts';
import { z } from 'zod';

import {
  activityDto,
  overrideList,
  unitsOf,
  effectiveParameterDto,
  overrideDto,
  projectDto,
  projectMemberDto,
  standardSummaryDto,
  standardVersionDetailDto,
} from './presenters';
import {
  orgRoute,
  platformRoute,
  projectRoute,
  type RouteDefinition,
  type ServerDeps,
} from './route';

const ORG = '/api/v1/organizations/:orgSlug';
const PROJECT = `${ORG}/projects/:projectId`;

const projectParams = z.object({ projectId: z.uuid() });
const projectMemberParams = projectParams.extend({ memberId: z.uuid() });
const projectOverrideParams = projectParams.extend({ overrideId: z.uuid() });

/** Routes des projets (Phase 3) et de la bibliothèque de référentiels. */
export function createProjectRoutes(deps: ServerDeps): RouteDefinition[] {
  const { app } = deps;

  return [
    // --- Projets ---------------------------------------------------------------------------
    orgRoute(deps, 'project.read', {
      id: 'projects.list',
      method: 'GET',
      path: `${ORG}/projects`,
      query: projectListQuerySchema,
      async run({ ctx, query }) {
        const result = await app.projects.list(ctx, query.status);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(projectDto) } })
          : result;
      },
    }),

    orgRoute(deps, 'project.create', {
      id: 'projects.create',
      method: 'POST',
      path: `${ORG}/projects`,
      body: projectBodySchema,
      async run({ ctx, body }) {
        const result = await app.projects.create(ctx, body);
        return result.ok
          ? ok({ status: 201, body: projectDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'projects.get',
      method: 'GET',
      path: PROJECT,
      params: projectParams,
      async run({ ctx, params }) {
        const result = await app.projects.get(ctx, params.projectId);
        return result.ok
          ? ok({ status: 200, body: projectDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.update', {
      id: 'projects.update',
      method: 'PATCH',
      path: PROJECT,
      params: projectParams,
      body: projectBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.projects.update(ctx, params.projectId, body, version);
        return result.ok
          ? ok({ status: 200, body: projectDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.archive', {
      id: 'projects.archive',
      method: 'POST',
      path: `${PROJECT}/archive`,
      params: projectParams,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.projects.archive(ctx, params.projectId, version);
        return result.ok
          ? ok({ status: 200, body: result.value, etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.archive', {
      id: 'projects.unarchive',
      method: 'POST',
      path: `${PROJECT}/unarchive`,
      params: projectParams,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.projects.unarchive(ctx, params.projectId, version);
        return result.ok
          ? ok({ status: 200, body: result.value, etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'projects.activity',
      method: 'GET',
      path: `${PROJECT}/activity`,
      params: projectParams,
      query: activityQuerySchema,
      async run({ ctx, params, query }) {
        const result = await app.projects.activity(ctx, params.projectId, {
          cursor: query.cursor,
          limit: query.limit,
        });
        return result.ok
          ? ok({
              status: 200,
              body: {
                items: result.value.items.map(activityDto),
                nextCursor: result.value.nextCursor,
              },
            })
          : result;
      },
    }),

    // --- Membres d'un projet ---------------------------------------------------------------
    projectRoute(deps, 'project.read', {
      id: 'projectMembers.list',
      method: 'GET',
      path: `${PROJECT}/members`,
      params: projectParams,
      async run({ ctx, params }) {
        const result = await app.projectMembers.list(ctx, params.projectId);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(projectMemberDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'project.member.manage', {
      id: 'projectMembers.add',
      method: 'POST',
      path: `${PROJECT}/members`,
      params: projectParams,
      body: addProjectMemberBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.projectMembers.add(ctx, params.projectId, body);
        return result.ok
          ? ok({
              status: 201,
              body: { id: result.value.id, version: result.value.version },
              etag: result.value.version,
            })
          : result;
      },
    }),

    projectRoute(deps, 'project.member.manage', {
      id: 'projectMembers.update',
      method: 'PATCH',
      path: `${PROJECT}/members/:memberId`,
      params: projectMemberParams,
      body: updateProjectMemberBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.projectMembers.changeRole(
          ctx,
          params.projectId,
          params.memberId,
          body.role,
          version,
        );
        return result.ok
          ? ok({ status: 200, body: result.value, etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.member.manage', {
      id: 'projectMembers.remove',
      method: 'DELETE',
      path: `${PROJECT}/members/:memberId`,
      params: projectMemberParams,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.projectMembers.remove(
          ctx,
          params.projectId,
          params.memberId,
          version,
        );
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    // --- Référentiels d'un projet ----------------------------------------------------------
    projectRoute(deps, 'project.read', {
      id: 'projectStandards.list',
      method: 'GET',
      path: `${PROJECT}/standards`,
      params: projectParams,
      async run({ ctx, params }) {
        const result = await app.library.projectStandards(ctx, params.projectId);
        return result.ok
          ? ok({
              status: 200,
              body: {
                items: result.value.items.map((i) => ({
                  discipline: i.discipline,
                  versions: [...i.versions],
                })),
              },
            })
          : result;
      },
    }),

    projectRoute(deps, 'project.update', {
      id: 'projectStandards.set',
      method: 'PUT',
      path: `${PROJECT}/standards/:discipline`,
      params: projectParams.extend({ discipline: disciplineSchema }),
      body: setProjectStandardsBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.library.setProjectStandards(
          ctx,
          params.projectId,
          params.discipline,
          body.standardVersionIds,
        );
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'projectStandards.parameters',
      method: 'GET',
      path: `${PROJECT}/standard-versions/:versionId/parameters`,
      params: projectParams.extend({ versionId: z.uuid() }),
      async run({ ctx, params }) {
        const result = await app.library.effectiveParameters(
          ctx,
          params.projectId,
          params.versionId,
        );
        return result.ok
          ? ok({
              status: 200,
              body: {
                items: result.value.map(effectiveParameterDto),
                units: unitsOf(result.value.flatMap((p) => [p.value, p.referenceValue])),
              },
            })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'projectOverrides.list',
      method: 'GET',
      path: `${PROJECT}/overrides`,
      params: projectParams,
      async run({ ctx, params }) {
        const result = await app.library.listProjectOverrides(ctx, params.projectId);
        return result.ok ? ok({ status: 200, body: overrideList(result.value) }) : result;
      },
    }),

    projectRoute(deps, 'project.parameter.override', {
      id: 'projectOverrides.create',
      method: 'POST',
      path: `${PROJECT}/overrides`,
      params: projectParams,
      body: overrideBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.library.createProjectOverride(ctx, params.projectId, body);
        return result.ok
          ? ok({ status: 201, body: overrideDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.parameter.override', {
      id: 'projectOverrides.update',
      method: 'PATCH',
      path: `${PROJECT}/overrides/:overrideId`,
      params: projectOverrideParams,
      body: updateOverrideBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.library.updateProjectOverride(
          ctx,
          params.projectId,
          params.overrideId,
          body,
          version,
        );
        return result.ok
          ? ok({ status: 200, body: overrideDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.parameter.override', {
      id: 'projectOverrides.remove',
      method: 'DELETE',
      path: `${PROJECT}/overrides/:overrideId`,
      params: projectOverrideParams,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.library.deleteProjectOverride(
          ctx,
          params.projectId,
          params.overrideId,
          version,
        );
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    // --- Bibliothèque de l'organisation ----------------------------------------------------
    orgRoute(deps, 'library.read', {
      id: 'library.standards',
      method: 'GET',
      path: `${ORG}/library/standards`,
      async run({ ctx }) {
        const result = await app.library.listStandards(ctx);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(standardSummaryDto) } })
          : result;
      },
    }),

    orgRoute(deps, 'library.read', {
      id: 'library.version',
      method: 'GET',
      path: `${ORG}/library/versions/:versionId`,
      params: z.object({ versionId: z.uuid() }),
      async run({ ctx, params }) {
        const result = await app.library.getVersion(ctx, params.versionId);
        return result.ok
          ? ok({ status: 200, body: standardVersionDetailDto(result.value) })
          : result;
      },
    }),

    orgRoute(deps, 'library.read', {
      id: 'orgOverrides.list',
      method: 'GET',
      path: `${ORG}/library/overrides`,
      async run({ ctx }) {
        const result = await app.library.listOrgOverrides(ctx);
        return result.ok ? ok({ status: 200, body: overrideList(result.value) }) : result;
      },
    }),

    orgRoute(deps, 'library.org.manage', {
      id: 'orgOverrides.create',
      method: 'POST',
      path: `${ORG}/library/overrides`,
      body: overrideBodySchema,
      async run({ ctx, body }) {
        const result = await app.library.createOrgOverride(ctx, body);
        return result.ok
          ? ok({ status: 201, body: overrideDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    orgRoute(deps, 'library.org.manage', {
      id: 'orgOverrides.update',
      method: 'PATCH',
      path: `${ORG}/library/overrides/:overrideId`,
      params: z.object({ overrideId: z.uuid() }),
      body: updateOverrideBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.library.updateOrgOverride(ctx, params.overrideId, body, version);
        return result.ok
          ? ok({ status: 200, body: overrideDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    orgRoute(deps, 'library.org.manage', {
      id: 'orgOverrides.remove',
      method: 'DELETE',
      path: `${ORG}/library/overrides/:overrideId`,
      params: z.object({ overrideId: z.uuid() }),
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.library.deleteOrgOverride(ctx, params.overrideId, version);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    // --- Plateforme : référentiels système -------------------------------------------------
    platformRoute(deps, {
      id: 'platform.standardVersions.publish',
      method: 'POST',
      path: '/api/v1/platform/standard-versions/:versionId/publish',
      params: z.object({ versionId: z.uuid() }),
      async run({ ctx, params }) {
        const result = await app.library.setSystemVersionStatus(ctx, params.versionId, 'PUBLISHED');
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    platformRoute(deps, {
      id: 'platform.standardVersions.deprecate',
      method: 'POST',
      path: '/api/v1/platform/standard-versions/:versionId/deprecate',
      params: z.object({ versionId: z.uuid() }),
      async run({ ctx, params }) {
        const result = await app.library.setSystemVersionStatus(
          ctx,
          params.versionId,
          'DEPRECATED',
        );
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),
  ];
}
