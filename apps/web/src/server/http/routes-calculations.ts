import { ok } from '@consulpro/calc-core';
import {
  calculationBodySchema,
  datasetBodySchema,
  datasetRevisionBodySchema,
  notificationQuerySchema,
  preferencesBodySchema,
  runBodySchema,
  searchQuerySchema,
  studyBodySchema,
  transferOwnershipBodySchema,
  updateStudyBodySchema,
  validateBodySchema,
  verifyBodySchema,
} from '@consulpro/contracts';
import { z } from 'zod';

import {
  calculationDto,
  datasetDto,
  datasetKindDto,
  datasetRevisionDto,
  engineDto,
  linkableOutputDto,
  notificationDto,
  revisionDto,
  revisionSummaryDto,
  studyDto,
} from './presenters';
import { orgRoute, projectRoute, userRoute, type RouteDefinition, type ServerDeps } from './route';

const ORG = '/api/v1/organizations/:orgSlug';
const PROJECT = `${ORG}/projects/:projectId`;

const project = z.object({ projectId: z.uuid() });
const study = project.extend({ studyId: z.uuid() });
const calculation = project.extend({ calculationId: z.uuid() });
const revision = project.extend({ revisionId: z.uuid() });
const dataset = project.extend({ datasetId: z.uuid() });

/** Études, calculs, révisions et contrôle ; données de projet ; compte (Phase 3). */
export function createCalculationRoutes(deps: ServerDeps): RouteDefinition[] {
  const { app } = deps;

  return [
    // --- Études ----------------------------------------------------------------------------
    projectRoute(deps, 'project.read', {
      id: 'studies.list',
      method: 'GET',
      path: `${PROJECT}/studies`,
      params: project,
      async run({ ctx, params }) {
        const result = await app.studies.list(ctx, params.projectId);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(studyDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'study.manage', {
      id: 'studies.create',
      method: 'POST',
      path: `${PROJECT}/studies`,
      params: project,
      body: studyBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.studies.create(ctx, params.projectId, body);
        return result.ok
          ? ok({ status: 201, body: studyDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'studies.get',
      method: 'GET',
      path: `${PROJECT}/studies/:studyId`,
      params: study,
      async run({ ctx, params }) {
        const result = await app.studies.get(ctx, params.projectId, params.studyId);
        return result.ok
          ? ok({ status: 200, body: studyDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'study.manage', {
      id: 'studies.update',
      method: 'PATCH',
      path: `${PROJECT}/studies/:studyId`,
      params: study,
      body: updateStudyBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.studies.update(
          ctx,
          params.projectId,
          params.studyId,
          body,
          version,
        );
        return result.ok
          ? ok({ status: 200, body: studyDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    // --- Calculs ---------------------------------------------------------------------------
    projectRoute(deps, 'project.read', {
      id: 'engines.list',
      method: 'GET',
      path: `${PROJECT}/engines`,
      params: project,
      async run({ ctx, params }) {
        const result = await app.calculations.engines(ctx, params.projectId);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(engineDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'calculations.list',
      method: 'GET',
      path: `${PROJECT}/studies/:studyId/calculations`,
      params: study,
      async run({ ctx, params }) {
        const result = await app.calculations.listByStudy(ctx, params.projectId, params.studyId);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(calculationDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'calculation.run', {
      id: 'calculations.create',
      method: 'POST',
      path: `${PROJECT}/studies/:studyId/calculations`,
      params: study,
      body: calculationBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.calculations.create(ctx, params.projectId, params.studyId, body);
        return result.ok
          ? ok({ status: 201, body: calculationDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'calculations.get',
      method: 'GET',
      path: `${PROJECT}/calculations/:calculationId`,
      params: calculation,
      async run({ ctx, params }) {
        const result = await app.calculations.get(ctx, params.projectId, params.calculationId);
        return result.ok ? ok({ status: 200, body: calculationDto(result.value) }) : result;
      },
    }),

    projectRoute(deps, 'calculation.run', {
      id: 'calculations.run',
      method: 'POST',
      path: `${PROJECT}/calculations/:calculationId/runs`,
      params: calculation,
      body: runBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.calculations.run(
          ctx,
          params.projectId,
          params.calculationId,
          body.inputs,
        );
        return result.ok ? ok({ status: 201, body: revisionDto(result.value) }) : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'calculations.revisions',
      method: 'GET',
      path: `${PROJECT}/calculations/:calculationId/revisions`,
      params: calculation,
      async run({ ctx, params }) {
        const result = await app.calculations.revisions(
          ctx,
          params.projectId,
          params.calculationId,
        );
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(revisionSummaryDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'calculations.linkableOutputs',
      method: 'GET',
      path: `${PROJECT}/calculations/:calculationId/linkable-outputs`,
      params: calculation,
      async run({ ctx, params }) {
        const result = await app.calculations.linkableOutputs(
          ctx,
          params.projectId,
          params.calculationId,
        );
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(linkableOutputDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'revisions.get',
      method: 'GET',
      path: `${PROJECT}/revisions/:revisionId`,
      params: revision,
      async run({ ctx, params }) {
        const result = await app.calculations.revision(ctx, params.projectId, params.revisionId);
        return result.ok ? ok({ status: 200, body: revisionDto(result.value) }) : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'revisions.compare',
      method: 'GET',
      path: `${PROJECT}/revisions/:revisionId/compare`,
      params: revision,
      query: z.object({ with: z.uuid() }),
      async run({ ctx, params, query }) {
        const result = await app.calculations.compare(
          ctx,
          params.projectId,
          query.with,
          params.revisionId,
        );
        return result.ok
          ? ok({
              status: 200,
              body: {
                before: revisionSummaryDto(result.value.before),
                after: revisionSummaryDto(result.value.after),
                differences: result.value.differences,
              },
            })
          : result;
      },
    }),

    projectRoute(deps, 'calculation.validate', {
      id: 'revisions.validate',
      method: 'POST',
      path: `${PROJECT}/revisions/:revisionId/validate`,
      params: revision,
      body: validateBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.calculations.validate(
          ctx,
          params.projectId,
          params.revisionId,
          body.comment,
        );
        return result.ok ? ok({ status: 200, body: revisionDto(result.value) }) : result;
      },
    }),

    projectRoute(deps, 'calculation.verify', {
      id: 'revisions.verify',
      method: 'POST',
      path: `${PROJECT}/revisions/:revisionId/verify`,
      params: revision,
      body: verifyBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.calculations.verify(
          ctx,
          params.projectId,
          params.revisionId,
          body.decision,
          body.comment,
        );
        return result.ok ? ok({ status: 200, body: revisionDto(result.value) }) : result;
      },
    }),

    // --- Données de projet -----------------------------------------------------------------
    projectRoute(deps, 'project.read', {
      id: 'datasets.kinds',
      method: 'GET',
      path: `${PROJECT}/dataset-kinds`,
      params: project,
      async run({ ctx, params }) {
        const result = await app.datasets.kinds(ctx, params.projectId);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(datasetKindDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'datasets.list',
      method: 'GET',
      path: `${PROJECT}/datasets`,
      params: project,
      async run({ ctx, params }) {
        const result = await app.datasets.list(ctx, params.projectId);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(datasetDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'dataset.write', {
      id: 'datasets.create',
      method: 'POST',
      path: `${PROJECT}/datasets`,
      params: project,
      body: datasetBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.datasets.create(ctx, params.projectId, body);
        return result.ok
          ? ok({
              status: 201,
              body: datasetDto({ ...result.value, current: null }),
              etag: result.value.version,
            })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'datasets.get',
      method: 'GET',
      path: `${PROJECT}/datasets/:datasetId`,
      params: dataset,
      query: z.object({ revision: z.uuid().optional() }),
      async run({ ctx, params, query }) {
        const result = await app.datasets.revision(
          ctx,
          params.projectId,
          params.datasetId,
          query.revision,
        );
        return result.ok
          ? ok({
              status: 200,
              body: {
                dataset: datasetDto({ ...result.value.dataset, current: null }),
                revision: result.value.revision ? datasetRevisionDto(result.value.revision) : null,
              },
              etag: result.value.dataset.version,
            })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'datasets.revisions',
      method: 'GET',
      path: `${PROJECT}/datasets/:datasetId/revisions`,
      params: dataset,
      async run({ ctx, params }) {
        const result = await app.datasets.revisions(ctx, params.projectId, params.datasetId);
        return result.ok
          ? ok({
              status: 200,
              body: {
                items: result.value.map((r) => ({
                  id: r.id,
                  number: r.number,
                  rowCount: r.rowCount,
                  note: r.note,
                  authorName: r.authorName,
                  createdAt: r.createdAt.toISOString(),
                })),
              },
            })
          : result;
      },
    }),

    projectRoute(deps, 'dataset.write', {
      id: 'datasets.saveRevision',
      method: 'POST',
      path: `${PROJECT}/datasets/:datasetId/revisions`,
      params: dataset,
      body: datasetRevisionBodySchema,
      ifMatch: true,
      // Jusqu'à 5 000 lignes (DATASET_KINDS.maxRows).
      maxBodyBytes: 2_000_000,
      async run({ ctx, params, body, version }) {
        const result = await app.datasets.saveRevision(
          ctx,
          params.projectId,
          params.datasetId,
          body,
          version,
        );
        return result.ok
          ? ok({ status: 201, body: datasetRevisionDto(result.value), etag: version + 1 })
          : result;
      },
    }),

    // --- Recherche et propriété de l'organisation ------------------------------------------
    orgRoute(deps, 'project.read', {
      id: 'search',
      method: 'GET',
      path: `${ORG}/search`,
      query: searchQuerySchema,
      async run({ ctx, query }) {
        const result = await app.account.search(ctx, query.q);
        return result.ok
          ? ok({
              status: 200,
              body: {
                items: result.value.map((h) => ({
                  type: h.type,
                  id: h.id,
                  title: h.title,
                  subtitle: h.subtitle,
                  href: h.href,
                })),
              },
            })
          : result;
      },
    }),

    orgRoute(deps, 'org.transfer', {
      id: 'organization.transfer',
      method: 'POST',
      path: `${ORG}/ownership-transfer`,
      body: transferOwnershipBodySchema,
      async run({ ctx, body }) {
        const result = await app.account.transferOwnership(ctx, body.membershipId);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    // --- Compte : notifications et préférences ---------------------------------------------
    userRoute(deps, {
      id: 'notifications.list',
      method: 'GET',
      path: '/api/v1/me/notifications',
      query: notificationQuerySchema,
      async run({ ctx, query }) {
        const result = await app.account.notifications(ctx, {
          cursor: query.cursor,
          limit: query.limit,
          unreadOnly: query.unread === 'true',
        });
        return result.ok
          ? ok({
              status: 200,
              body: {
                items: result.value.items.map(notificationDto),
                nextCursor: result.value.nextCursor,
                unreadCount: result.value.unreadCount,
              },
            })
          : result;
      },
    }),

    userRoute(deps, {
      id: 'notifications.read',
      method: 'POST',
      path: '/api/v1/me/notifications/read',
      body: z.object({ ids: z.array(z.uuid()).max(100).optional() }),
      async run({ ctx, body }) {
        const result = await app.account.markRead(ctx, body.ids ?? null);
        return result.ok ? ok({ status: 200, body: result.value }) : result;
      },
    }),

    userRoute(deps, {
      id: 'preferences.get',
      method: 'GET',
      path: '/api/v1/me/preferences',
      async run({ ctx }) {
        const result = await app.account.preferences(ctx);
        return result.ok ? ok({ status: 200, body: result.value }) : result;
      },
    }),

    userRoute(deps, {
      id: 'preferences.update',
      method: 'PUT',
      path: '/api/v1/me/preferences',
      body: preferencesBodySchema,
      async run({ ctx, body }) {
        const result = await app.account.setTimeZone(ctx, body.timeZone);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),
  ];
}
