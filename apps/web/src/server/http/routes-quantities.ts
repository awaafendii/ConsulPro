import { ok } from '@consulpro/calc-core';
import {
  applyPricesBodySchema,
  boqBodySchema,
  boqItemBodySchema,
  priceItemBodySchema,
  priceLibraryBodySchema,
  takeoffAssignmentBodySchema,
  takeoffNodeBodySchema,
  updateBoqBodySchema,
  updateBoqItemBodySchema,
  updatePriceItemBodySchema,
  updatePriceLibraryBodySchema,
  updateTakeoffNodeBodySchema,
} from '@consulpro/contracts';
import { z } from 'zod';

import {
  boqDto,
  boqItemDto,
  boqSummaryDto,
  btpDashboardDto,
  materialRowDto,
  priceItemDto,
  priceLibraryDetailDto,
  priceLibraryDto,
  takeoffDto,
  takeoffNodeDto,
} from './presenters-quantities';
import { orgRoute, projectRoute, type RouteDefinition, type ServerDeps } from './route';

const ORG = '/api/v1/organizations/:orgSlug';
const PROJECT = `${ORG}/projects/:projectId`;

const project = z.object({ projectId: z.uuid() });
const node = project.extend({ nodeId: z.uuid() });
const assignment = project.extend({ calculationId: z.uuid() });
const boq = project.extend({ boqId: z.uuid() });
const boqItem = boq.extend({ itemId: z.uuid() });
const library = z.object({ libraryId: z.uuid() });
const priceItem = library.extend({ itemId: z.uuid() });

/** Avant-métré, quantitatifs, bibliothèques de prix et tableau de bord BTP (Phase 4). */
export function createQuantityRoutes(deps: ServerDeps): RouteDefinition[] {
  const { app } = deps;

  return [
    // --- Avant-métré -----------------------------------------------------------------------
    projectRoute(deps, 'project.read', {
      id: 'takeoff.get',
      method: 'GET',
      path: `${PROJECT}/takeoff`,
      params: project,
      async run({ ctx, params }) {
        const result = await app.takeoff.get(ctx, params.projectId);
        return result.ok ? ok({ status: 200, body: takeoffDto(result.value) }) : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'takeoffNodes.create',
      method: 'POST',
      path: `${PROJECT}/takeoff/nodes`,
      params: project,
      body: takeoffNodeBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.takeoff.createNode(ctx, params.projectId, body);
        return result.ok
          ? ok({ status: 201, body: takeoffNodeDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'takeoffNodes.update',
      method: 'PATCH',
      path: `${PROJECT}/takeoff/nodes/:nodeId`,
      params: node,
      body: updateTakeoffNodeBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.takeoff.updateNode(
          ctx,
          params.projectId,
          params.nodeId,
          body,
          version,
        );
        return result.ok
          ? ok({ status: 200, body: takeoffNodeDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'takeoffNodes.remove',
      method: 'DELETE',
      path: `${PROJECT}/takeoff/nodes/:nodeId`,
      params: node,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.takeoff.deleteNode(ctx, params.projectId, params.nodeId, version);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'takeoff.assign',
      method: 'PUT',
      path: `${PROJECT}/takeoff/assignments/:calculationId`,
      params: assignment,
      body: takeoffAssignmentBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.takeoff.assign(
          ctx,
          params.projectId,
          params.calculationId,
          body.nodeId,
        );
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    // --- Quantitatifs ----------------------------------------------------------------------
    projectRoute(deps, 'project.read', {
      id: 'boqs.list',
      method: 'GET',
      path: `${PROJECT}/boqs`,
      params: project,
      async run({ ctx, params }) {
        const result = await app.boqs.list(ctx, params.projectId);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(boqSummaryDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'boqs.create',
      method: 'POST',
      path: `${PROJECT}/boqs`,
      params: project,
      body: boqBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.boqs.create(ctx, params.projectId, body);
        return result.ok
          ? ok({ status: 201, body: boqDto(result.value), etag: result.value.boq.version })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'boqs.get',
      method: 'GET',
      path: `${PROJECT}/boqs/:boqId`,
      params: boq,
      async run({ ctx, params }) {
        const result = await app.boqs.get(ctx, params.projectId, params.boqId);
        return result.ok
          ? ok({ status: 200, body: boqDto(result.value), etag: result.value.boq.version })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'boqs.update',
      method: 'PATCH',
      path: `${PROJECT}/boqs/:boqId`,
      params: boq,
      body: updateBoqBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.boqs.update(ctx, params.projectId, params.boqId, body, version);
        return result.ok
          ? ok({ status: 200, body: boqDto(result.value), etag: result.value.boq.version })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'boqs.remove',
      method: 'DELETE',
      path: `${PROJECT}/boqs/:boqId`,
      params: boq,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.boqs.remove(ctx, params.projectId, params.boqId, version);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'boqs.sync',
      method: 'POST',
      path: `${PROJECT}/boqs/:boqId/sync`,
      params: boq,
      async run({ ctx, params }) {
        const result = await app.boqs.sync(ctx, params.projectId, params.boqId);
        return result.ok
          ? ok({
              status: 200,
              body: {
                boq: boqDto(result.value.view),
                added: result.value.added,
                updated: result.value.updated,
                removed: result.value.removed,
              },
              etag: result.value.view.boq.version,
            })
          : result;
      },
    }),

    projectRoute(deps, 'project.read', {
      id: 'boqs.materials',
      method: 'GET',
      path: `${PROJECT}/boqs/:boqId/materials`,
      params: boq,
      async run({ ctx, params }) {
        const result = await app.boqs.materials(ctx, params.projectId, params.boqId);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(materialRowDto) } })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'boqs.applyPrices',
      method: 'POST',
      path: `${PROJECT}/boqs/:boqId/prices`,
      params: boq,
      body: applyPricesBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.boqs.applyPrices(ctx, params.projectId, params.boqId, body);
        return result.ok
          ? ok({
              status: 200,
              body: {
                boq: boqDto(result.value.view),
                applied: result.value.applied,
                unmatched: result.value.unmatched,
                kept: result.value.kept,
              },
              etag: result.value.view.boq.version,
            })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'boqItems.create',
      method: 'POST',
      path: `${PROJECT}/boqs/:boqId/items`,
      params: boq,
      body: boqItemBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.boqs.addItem(ctx, params.projectId, params.boqId, body);
        return result.ok
          ? ok({
              status: 201,
              body: boqItemDto(result.value),
              etag: result.value.version,
            })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'boqItems.update',
      method: 'PATCH',
      path: `${PROJECT}/boqs/:boqId/items/:itemId`,
      params: boqItem,
      body: updateBoqItemBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.boqs.updateItem(
          ctx,
          params.projectId,
          params.boqId,
          params.itemId,
          body,
          version,
        );
        return result.ok
          ? ok({
              status: 200,
              body: boqItemDto(result.value),
              etag: result.value.version,
            })
          : result;
      },
    }),

    projectRoute(deps, 'boq.manage', {
      id: 'boqItems.remove',
      method: 'DELETE',
      path: `${PROJECT}/boqs/:boqId/items/:itemId`,
      params: boqItem,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.boqs.deleteItem(
          ctx,
          params.projectId,
          params.boqId,
          params.itemId,
          version,
        );
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    // --- Bibliothèques de prix (organisation) ----------------------------------------------
    orgRoute(deps, 'library.read', {
      id: 'priceLibraries.list',
      method: 'GET',
      path: `${ORG}/price-libraries`,
      async run({ ctx }) {
        const result = await app.prices.list(ctx);
        return result.ok
          ? ok({ status: 200, body: { items: result.value.map(priceLibraryDto) } })
          : result;
      },
    }),

    orgRoute(deps, 'price.manage', {
      id: 'priceLibraries.create',
      method: 'POST',
      path: `${ORG}/price-libraries`,
      body: priceLibraryBodySchema,
      async run({ ctx, body }) {
        const result = await app.prices.create(ctx, body);
        return result.ok
          ? ok({ status: 201, body: priceLibraryDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    orgRoute(deps, 'library.read', {
      id: 'priceLibraries.get',
      method: 'GET',
      path: `${ORG}/price-libraries/:libraryId`,
      params: library,
      async run({ ctx, params }) {
        const result = await app.prices.get(ctx, params.libraryId);
        return result.ok
          ? ok({
              status: 200,
              body: priceLibraryDetailDto(result.value, result.value.works),
              etag: result.value.library.version,
            })
          : result;
      },
    }),

    orgRoute(deps, 'price.manage', {
      id: 'priceLibraries.update',
      method: 'PATCH',
      path: `${ORG}/price-libraries/:libraryId`,
      params: library,
      body: updatePriceLibraryBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.prices.update(ctx, params.libraryId, body, version);
        return result.ok
          ? ok({ status: 200, body: priceLibraryDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    orgRoute(deps, 'price.manage', {
      id: 'priceLibraries.remove',
      method: 'DELETE',
      path: `${ORG}/price-libraries/:libraryId`,
      params: library,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.prices.remove(ctx, params.libraryId, version);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    orgRoute(deps, 'price.manage', {
      id: 'priceItems.create',
      method: 'POST',
      path: `${ORG}/price-libraries/:libraryId/items`,
      params: library,
      body: priceItemBodySchema,
      async run({ ctx, params, body }) {
        const result = await app.prices.addItem(ctx, params.libraryId, body);
        return result.ok
          ? ok({ status: 201, body: priceItemDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    orgRoute(deps, 'price.manage', {
      id: 'priceItems.update',
      method: 'PATCH',
      path: `${ORG}/price-libraries/:libraryId/items/:itemId`,
      params: priceItem,
      body: updatePriceItemBodySchema,
      ifMatch: true,
      async run({ ctx, params, body, version }) {
        const result = await app.prices.updateItem(
          ctx,
          params.libraryId,
          params.itemId,
          body,
          version,
        );
        return result.ok
          ? ok({ status: 200, body: priceItemDto(result.value), etag: result.value.version })
          : result;
      },
    }),

    orgRoute(deps, 'price.manage', {
      id: 'priceItems.remove',
      method: 'DELETE',
      path: `${ORG}/price-libraries/:libraryId/items/:itemId`,
      params: priceItem,
      ifMatch: true,
      async run({ ctx, params, version }) {
        const result = await app.prices.removeItem(ctx, params.libraryId, params.itemId, version);
        return result.ok ? ok({ status: 204 }) : result;
      },
    }),

    // --- Tableau de bord BTP ---------------------------------------------------------------
    orgRoute(deps, 'project.read', {
      id: 'btp.dashboard',
      method: 'GET',
      path: `${ORG}/btp/dashboard`,
      async run({ ctx }) {
        const result = await app.btpDashboard.get(ctx);
        return result.ok ? ok({ status: 200, body: btpDashboardDto(result.value) }) : result;
      },
    }),
  ];
}
