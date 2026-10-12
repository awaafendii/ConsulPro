/**
 * Contrat HTTP de l'avant-métré, des quantitatifs et des prix (Phase 4) : réponses validées
 * par les schémas de @consulpro/contracts, ETag / If-Match, erreurs RFC 9457.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  applyPricesResultSchema,
  boqItemSchema,
  boqListSchema,
  boqSchema,
  boqSyncResultSchema,
  btpDashboardSchema,
  materialListSchema,
  priceLibraryDetailSchema,
  priceLibraryListSchema,
  priceLibrarySchema,
  problemSchema,
  takeoffNodeSchema,
  takeoffSchema,
} from '@consulpro/contracts';
import { createDatabase, type Database } from '@consulpro/db';
import { loadStandard, setPlatformAdmin } from '@consulpro/infrastructure';
import { unique } from '@consulpro/test-utils';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { Harness, type Actor } from './harness';

const BTP: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../packages/standards/seeds/btp/usages-metre-1.json', import.meta.url),
    ),
    'utf8',
  ),
);

let h: Harness;
let adminDb: Database;
let owner: Actor;
let orgSlug: string;
let projectId: string;

const m = (value: number) => ({ value, unit: 'm' });

async function json(response: Response, status: number): Promise<unknown> {
  expect(response.status, await response.clone().text()).toBe(status);
  return response.json();
}

async function expectProblem(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('content-type')).toContain('application/problem+json');
  expect(problemSchema.parse(await response.json()).code).toBe(code);
}

beforeAll(async () => {
  h = new Harness();
  adminDb = createDatabase(inject('database').adminUrl, { max: 2 });
  const platform = await h.signUp('plateforme-btp');
  const granted = await setPlatformAdmin(adminDb, platform.email, true);
  if (!granted.ok) throw new Error(granted.error);
  const loaded = await loadStandard(
    adminDb,
    { ...(BTP as object), version: { label: unique('api') } },
    { publishAs: platform.email },
  );
  if (!loaded.ok) throw new Error(loaded.error);
  owner = await h.signUp('owner-btp');
  orgSlug = await h.createOrganization(owner);
  projectId = await h.createProject(orgSlug, owner);
});

afterAll(async () => {
  await adminDb.$disconnect();
  await h.close();
});

describe('quantitatifs : contrat HTTP', () => {
  it('avant-métré → quantitatif → prix → mise à jour, décimales en chaînes exactes', async () => {
    const params = { orgSlug, projectId };
    const call = (id: string, options: Parameters<Harness['call']>[1] = {}) =>
      h.call(id, { actor: owner, ...options, params: { ...params, ...options.params } });

    // Avant-métré : un lot, un calcul de semelles rattaché.
    const lotResponse = await call('takeoffNodes.create', {
      body: { parentId: null, kind: 'LOT', code: '1', title: 'Fondations' },
    });
    expect(lotResponse.headers.get('etag')).toBe('"1"');
    const lot = takeoffNodeSchema.parse(await json(lotResponse, 201));
    const studyId = (
      (await json(
        await call('studies.create', { body: { discipline: 'BTP', title: 'Fondations' } }),
        201,
      )) as { id: string }
    ).id;
    const calculationId = (
      (await json(
        await call('calculations.create', {
          params: { studyId },
          body: { title: 'Semelles S1', engineId: 'btp.footings' },
        }),
        201,
      )) as { id: string }
    ).id;
    await json(
      await call('calculations.run', {
        params: { calculationId },
        body: {
          inputs: { type: 'ISOLATED', length: m(1.2), width: m(1.2), height: m(0.4), count: 6 },
        },
      }),
      201,
    );
    const assigned = await call('takeoff.assign', {
      params: { calculationId },
      body: { nodeId: lot.id },
    });
    expect(assigned.status).toBe(204);
    const takeoff = takeoffSchema.parse(await json(await call('takeoff.get'), 200));
    expect(takeoff.calculations).toMatchObject([{ id: calculationId, nodeId: lot.id }]);

    // Quantitatif créé et rempli depuis l'avant-métré.
    const created = boqSchema.parse(
      await json(await call('boqs.create', { body: { title: 'DQE fondations' } }), 201),
    );
    expect(created.currency).toBe('XOF');
    const concrete = created.items.find((i) => i.workKey === 'btp.footings.concrete')!;
    expect(concrete).toMatchObject({
      quantity: '3.456',
      effectiveQuantity: '3.456',
      unitPrice: null,
      amount: null,
      source: { revisionNumber: 1, superseded: false, engineVerified: false },
    });
    expect(created.total).toEqual({
      amount: '0',
      lines: created.items.length,
      unpriced: created.items.length,
    });
    const list = boqListSchema.parse(await json(await call('boqs.list'), 200));
    expect(list.items).toHaveLength(1);

    // Bibliothèque de prix (organisation) et application.
    const library = priceLibrarySchema.parse(
      await json(
        await h.call('priceLibraries.create', {
          actor: owner,
          params: { orgSlug },
          body: { name: 'Prix Dakar', currency: 'XOF', validFrom: '2026-01-01' },
        }),
        201,
      ),
    );
    await json(
      await h.call('priceItems.create', {
        actor: owner,
        params: { orgSlug, libraryId: library.id },
        body: {
          code: 'GO-01',
          designation: 'Béton armé en fondation',
          unit: 'm3',
          price: '65000',
          workKey: 'btp.footings.concrete',
        },
      }),
      201,
    );
    const detail = priceLibraryDetailSchema.parse(
      await json(
        await h.call('priceLibraries.get', {
          actor: owner,
          params: { orgSlug, libraryId: library.id },
        }),
        200,
      ),
    );
    expect(detail.items).toHaveLength(1);
    expect(detail.works.some((w) => w.workKey === 'btp.footings.concrete')).toBe(true);
    priceLibraryListSchema.parse(
      await json(await h.call('priceLibraries.list', { actor: owner, params: { orgSlug } }), 200),
    );
    const applied = applyPricesResultSchema.parse(
      await json(
        await call('boqs.applyPrices', {
          params: { boqId: created.id },
          body: { libraryId: library.id },
        }),
        200,
      ),
    );
    expect(applied.applied).toBe(1);
    expect(applied.boq.items.find((i) => i.id === concrete.id)).toMatchObject({
      unitPrice: '65000',
      amount: '224640',
    });
    expect(applied.boq.total.amount).toBe('224640');

    // Ligne saisie, puis quantité retenue justifiée (If-Match obligatoire).
    const manual = boqItemSchema.parse(
      await json(
        await call('boqItems.create', {
          params: { boqId: created.id },
          body: {
            nodeId: lot.id,
            designation: 'Installation de chantier',
            unit: 'ff',
            quantity: '1',
            unitPrice: '1500000.5',
          },
        }),
        201,
      ),
    );
    expect(manual).toMatchObject({ origin: 'MANUAL', amount: '1500000' }); // XOF : 1 500 000,5 → pair
    await expectProblem(
      await call('boqItems.update', {
        params: { boqId: created.id, itemId: concrete.id },
        body: { override: { quantity: '3.5', justification: 'Relevé' } },
      }),
      428,
      'PRECONDITION_REQUIRED',
    );
    const priced = applied.boq.items.find((i) => i.id === concrete.id)!;
    const overridden = boqItemSchema.parse(
      await json(
        await call('boqItems.update', {
          params: { boqId: created.id, itemId: concrete.id },
          body: { override: { quantity: '3.5', justification: 'Relevé contradictoire' } },
          headers: { 'if-match': `"${String(priced.version)}"` },
        }),
        200,
      ),
    );
    expect(overridden).toMatchObject({
      quantity: '3.456',
      overrideQuantity: '3.5',
      effectiveQuantity: '3.5',
      amount: '227500',
    });
    await expectProblem(
      await call('boqItems.update', {
        params: { boqId: created.id, itemId: concrete.id },
        body: { quantity: '9' },
        headers: { 'if-match': `"${String(overridden.version)}"` },
      }),
      400,
      'BOQ_COMPUTED_READONLY',
    );
    await expectProblem(
      await call('boqItems.create', {
        params: { boqId: created.id },
        body: { nodeId: lot.id, designation: 'Ligne', unit: 'ff', quantity: '1,5' },
      }),
      400,
      'VALIDATION',
    );

    // Recalcul : écart signalé, puis mise à jour.
    await json(
      await call('calculations.run', {
        params: { calculationId },
        body: {
          inputs: { type: 'ISOLATED', length: m(1.2), width: m(1.2), height: m(0.4), count: 8 },
        },
      }),
      201,
    );
    const stale = boqSchema.parse(
      await json(await call('boqs.get', { params: { boqId: created.id } }), 200),
    );
    expect(stale.pending.update).toBeGreaterThan(0);
    const syncResponse = await call('boqs.sync', { params: { boqId: created.id } });
    const synced = boqSyncResultSchema.parse(await json(syncResponse, 200));
    expect(syncResponse.headers.get('etag')).toBe(`"${String(synced.boq.version)}"`);
    expect(synced.boq.pending).toEqual({ add: 0, update: 0, remove: 0 });
    expect(synced.boq.items.find((i) => i.id === concrete.id)).toMatchObject({
      quantity: '4.608',
      overrideQuantity: '3.5',
      source: { revisionNumber: 2 },
    });

    const materials = materialListSchema.parse(
      await json(await call('boqs.materials', { params: { boqId: created.id } }), 200),
    );
    expect(materials.items.find((r) => r.key === 'cement')).toMatchObject({
      unitDisplay: 'kg',
      additive: true,
    });

    // Tableau de bord BTP de l'organisation.
    const dashboard = btpDashboardSchema.parse(
      await json(await h.call('btp.dashboard', { actor: owner, params: { orgSlug } }), 200),
    );
    expect(dashboard.projects.find((p) => p.project.id === projectId)?.boqs[0]?.lots[0]?.code).toBe(
      '1',
    );

    // Suppressions : nœud non vide refusé ; quantitatif supprimé (If-Match).
    await expectProblem(
      await call('takeoffNodes.remove', {
        params: { nodeId: lot.id },
        headers: { 'if-match': '"1"' },
      }),
      409,
      'TAKEOFF_NODE_NOT_EMPTY',
    );
    await expectProblem(
      await call('boqs.remove', { params: { boqId: created.id }, headers: { 'if-match': '"1"' } }),
      412,
      'VERSION_MISMATCH',
    );
    const removed = await call('boqs.remove', {
      params: { boqId: created.id },
      headers: { 'if-match': `"${String(synced.boq.version)}"` },
    });
    expect(removed.status).toBe(204);
    await expectProblem(
      await call('boqs.get', { params: { boqId: created.id } }),
      404,
      'NOT_FOUND',
    );
  });

  it('devises différentes : refus explicite, sans conversion', async () => {
    const params = { orgSlug, projectId };
    const boq = boqSchema.parse(
      await json(
        await h.call('boqs.create', {
          actor: owner,
          params,
          body: { title: 'DQE euros', currency: 'EUR' },
        }),
        201,
      ),
    );
    const library = priceLibrarySchema.parse(
      await json(
        await h.call('priceLibraries.create', {
          actor: owner,
          params: { orgSlug },
          body: { name: unique('XOF'), currency: 'XOF' },
        }),
        201,
      ),
    );
    await expectProblem(
      await h.call('boqs.applyPrices', {
        actor: owner,
        params: { ...params, boqId: boq.id },
        body: { libraryId: library.id },
      }),
      422,
      'PRICE_CURRENCY_MISMATCH',
    );
  });
});
