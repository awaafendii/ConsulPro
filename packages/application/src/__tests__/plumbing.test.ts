import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PLUMBING_ENGINES } from '@consulpro/calc-plumbing';
import { standardFileSchema } from '@consulpro/standards';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApplication, type Application } from '../index';
import type { StandardVersionDetail } from '../ports-projects';
import { InMemoryStore, userContext } from './in-memory';

/*
 * Plomberie (Phase 6) de bout en bout : réseau d'alimentation lu dans un jeu de données,
 * calcul rattaché à l'avant-métré, DQE ventilé par diamètre (décision Q9), présentation agrégée,
 * prix par diamètre, tableau de bord.
 */

const version = (file: string, id: string): StandardVersionDetail => {
  const seed = standardFileSchema.parse(
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../../standards/seeds/plumbing/${file}`, import.meta.url)),
        'utf8',
      ),
    ),
  );
  return {
    id,
    label: seed.version.label,
    status: 'PUBLISHED',
    sourceNotes: null,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    standard: {
      id: `s-${id}`,
      organizationId: null,
      code: seed.standard.code,
      title: seed.standard.title,
      publisher: null,
      discipline: 'PLUMBING',
      nature: seed.standard.nature,
    },
    parameters: seed.parameters,
    rules: seed.rules.map((r) => ({ ...r, clause: r.clause ?? null })),
  };
};

let store: InMemoryStore;
let app: Application;

beforeEach(() => {
  store = new InMemoryStore();
  for (const engine of PLUMBING_ENGINES) store.engines.register(engine);
  app = createApplication(store.deps());
  store.state.standardVersions = [
    version('nf-dtu-60.11-2013.json', 'v-6011'),
    version('nf-dtu-64.1-2013.json', 'v-641'),
    version('tubes-en-1.json', 'v-tubes'),
    version('usages-plomberie-1.json', 'v-usages'),
  ];
});

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const m = (value: number) => ({ value, unit: 'm' });
const NETWORK = [
  { code: 'A', parent: null, length: m(12), elevation: m(0), location: 'BASEMENT' },
  {
    code: 'B',
    parent: 'A',
    length: m(4),
    elevation: m(0.5),
    location: 'FLOOR',
    fixture: 'SINK',
    count: 1,
  },
  { code: 'C', parent: 'A', length: m(6), elevation: m(3), location: 'FLOOR' },
  {
    code: 'D',
    parent: 'C',
    length: m(3),
    elevation: m(3.5),
    location: 'FLOOR',
    fixture: 'SHOWER',
    count: 1,
  },
  {
    code: 'E',
    parent: 'C',
    length: m(4),
    elevation: m(3.5),
    location: 'FLOOR',
    fixture: 'WASHBASIN',
    count: 2,
  },
];

async function world() {
  const owner = store.addUser('owner@bet.test', 'Awa');
  must(await app.organizations.create(userContext(owner), { name: 'BET', slug: 'bet' }));
  const ctx = must(await app.organizations.resolveContext(userContext(owner), 'bet'));
  const project = must(
    await app.projects.create(ctx, {
      code: 'PL-1',
      name: 'Dispensaire',
      disciplines: ['PLUMBING'],
    }),
  );
  const study = must(
    await app.studies.create(ctx, project.id, { discipline: 'PLUMBING', title: 'Alimentation' }),
  );
  const network = must(
    await app.datasets.create(ctx, project.id, { kind: 'PLUMBING_NETWORK', title: 'Réseau EF' }),
  );
  must(await app.datasets.saveRevision(ctx, project.id, network.id, { rows: NETWORK }, 1));
  const calc = must(
    await app.calculations.create(ctx, project.id, study.id, {
      title: 'Réseau eau froide',
      engineId: 'plumbing.supply-network',
    }),
  );
  must(
    await app.calculations.run(ctx, project.id, calc.id, {
      network: { fromDataset: network.id },
      material: 'PPR_PN20',
      upstreamPressure: { value: 250, unit: 'kPa' },
      temperature: { value: 25, unit: 'degC' },
    }),
  );
  return { ctx, project, study, network, calc };
}

describe('réseau de plomberie → avant-métré → DQE ventilé', () => {
  it('une ligne par diamètre, liée à la révision ; présentation agrégée par matériau', async () => {
    const w = await world();
    const lot = must(
      await app.takeoff.createNode(w.ctx, w.project.id, {
        parentId: null,
        kind: 'LOT',
        code: '5',
        title: 'Plomberie',
      }),
    );
    must(await app.takeoff.assign(w.ctx, w.project.id, w.calc.id, lot.id));
    const boq = must(await app.boqs.create(w.ctx, w.project.id, { title: 'DQE plomberie' }));
    const pipes = boq.items.filter((i) => i.outputKey === 'pipes');
    expect(pipes.length).toBeGreaterThanOrEqual(2);
    for (const item of pipes) {
      expect(item.workKey).toMatch(/^plumbing\.supply-network\.pipes:PPR_PN20-\d+$/);
      expect(item.designation).toMatch(/^Réseau eau froide — Tube PPR PN20 Ø\d+$/);
      expect(item.groupDesignation).toBe('Réseau eau froide — Tube PPR PN20');
      expect(item.unit).toBe('m');
    }
    // 29 m de tubes au total, quelle que soit la ventilation.
    const total = pipes.reduce((sum, i) => sum + Number(i.quantity) / 10_000, 0);
    expect(total).toBeCloseTo(29, 9);
    expect(boq.groups).toEqual([
      expect.objectContaining({
        designation: 'Réseau eau froide — Tube PPR PN20',
        lines: pipes.length,
        quantity: 290_000n,
      }),
    ]);

    // Présentation agrégée : paramètre du quantitatif, sous If-Match.
    const aggregated = must(
      await app.boqs.update(
        w.ctx,
        w.project.id,
        boq.boq.id,
        { presentation: 'AGGREGATED' },
        boq.boq.version,
      ),
    );
    expect(aggregated.boq.presentation).toBe('AGGREGATED');
    expect(
      await app.boqs.update(
        w.ctx,
        w.project.id,
        boq.boq.id,
        { presentation: 'SUMMARY' },
        aggregated.boq.version,
      ),
    ).toMatchObject({ ok: false, error: { reason: 'BOQ_PRESENTATION_INVALID' } });

    // Prix par diamètre : la variante présente au DQE est proposée par la bibliothèque.
    const library = must(
      await app.prices.create(w.ctx, { name: 'Prix Conakry', currency: 'XOF', validFrom: null }),
    );
    const works = must(await app.prices.get(w.ctx, library.id)).works;
    const first = pipes[0];
    if (!first?.workKey) throw new Error('ligne sans ouvrage');
    const variant = works.find((wk) => wk.workKey === first.workKey);
    expect(variant).toMatchObject({ engineId: 'plumbing.supply-network', unit: 'm' });
    expect(variant?.outputLabel).toMatch(/^Linéaire de tubes — Tube PPR PN20 Ø\d+$/);
    must(
      await app.prices.addItem(w.ctx, library.id, {
        code: 'PL-01',
        designation: 'Tube PPR posé',
        unit: 'm',
        price: '4500',
        workKey: first.workKey,
      }),
    );
    expect(
      await app.prices.addItem(w.ctx, library.id, {
        code: 'PL-02',
        designation: 'Tube inconnu',
        unit: 'm',
        price: '1',
        workKey: 'plumbing.supply-network.pipes:PPR_PN20-999',
      }),
    ).toMatchObject({ ok: false, error: { reason: 'PRICE_WORK_UNKNOWN' } });
    const priced = must(
      await app.boqs.applyPrices(w.ctx, w.project.id, boq.boq.id, {
        libraryId: library.id,
        overwrite: false,
      }),
    );
    expect(priced.applied).toBe(1);
    const view = must(await app.boqs.get(w.ctx, w.project.id, boq.boq.id));
    expect(view.groups[0]).toMatchObject({ unpriced: pipes.length - 1 });
    expect(view.groups[0]?.amount).not.toBeNull();
  });

  it('une révision du réseau met à jour les linéaires du DQE', async () => {
    const w = await world();
    const lot = must(
      await app.takeoff.createNode(w.ctx, w.project.id, {
        parentId: null,
        kind: 'LOT',
        code: '5',
        title: 'Plomberie',
      }),
    );
    must(await app.takeoff.assign(w.ctx, w.project.id, w.calc.id, lot.id));
    const boq = must(await app.boqs.create(w.ctx, w.project.id, { title: 'DQE' }));
    must(
      await app.datasets.saveRevision(
        w.ctx,
        w.project.id,
        w.network.id,
        {
          rows: [
            ...NETWORK,
            {
              code: 'F',
              parent: 'C',
              length: m(7),
              elevation: m(3.5),
              location: 'FLOOR',
              fixture: 'WC_CISTERN',
              count: 1,
            },
          ],
        },
        2,
      ),
    );
    must(
      await app.calculations.run(w.ctx, w.project.id, w.calc.id, {
        network: { fromDataset: w.network.id },
        material: 'PPR_PN20',
        upstreamPressure: { value: 250, unit: 'kPa' },
        temperature: { value: 25, unit: 'degC' },
      }),
    );
    const synced = must(await app.boqs.sync(w.ctx, w.project.id, boq.boq.id));
    const total = synced.view.items
      .filter((i) => i.outputKey === 'pipes')
      .reduce((sum, i) => sum + Number(i.quantity) / 10_000, 0);
    expect(total).toBeCloseTo(36, 9);
  });
});

describe('tableau de bord Plomberie', () => {
  it('débits de pointe et pression au point le plus défavorisé, calculs à vérifier', async () => {
    const w = await world();
    const flows = must(
      await app.calculations.create(w.ctx, w.project.id, w.study.id, {
        title: 'Débits du bloc',
        engineId: 'plumbing.flow-rates',
      }),
    );
    must(await app.calculations.run(w.ctx, w.project.id, flows.id, { washbasin: 2, wcCistern: 2 }));
    const dashboard = must(await app.plumbingDashboard.get(w.ctx));
    expect(dashboard.engines.total).toBe(PLUMBING_ENGINES.length);
    expect(dashboard.engines.checkedCases).toBe(0);
    const project = dashboard.projects[0];
    expect(project?.calculations).toMatchObject({ total: 2, toVerify: 2, notComputed: 0 });
    const network = project?.flows.find((f) => f.engineId === 'plumbing.supply-network');
    expect(network?.fixtureCount).toBe(4);
    expect(network?.minPressure).toBeGreaterThan(0);
    const group = project?.flows.find((f) => f.engineId === 'plumbing.flow-rates');
    expect(group?.probableFlow).toBeCloseTo((0.8 / Math.sqrt(3)) * 0.64, 9);
    expect(group?.minPressure).toBeNull();
  });
});

describe('inventaire des appareils sanitaires', () => {
  it('le calcul des débits lit l’inventaire du projet et en garde la trace', async () => {
    const w = await world();
    const inventory = must(
      await app.datasets.create(w.ctx, w.project.id, {
        kind: 'SANITARY_FIXTURES',
        title: 'Appareils',
      }),
    );
    must(
      await app.datasets.saveRevision(
        w.ctx,
        w.project.id,
        inventory.id,
        {
          rows: [
            { level: 'RDC', room: 'Sanitaires', fixture: 'WASHBASIN', count: 3 },
            { level: 'RDC', room: 'Sanitaires', fixture: 'WC_CISTERN', count: 3 },
          ],
        },
        1,
      ),
    );
    const calc = must(
      await app.calculations.create(w.ctx, w.project.id, w.study.id, {
        title: 'Débits RDC',
        engineId: 'plumbing.flow-rates',
      }),
    );
    const view = must(
      await app.calculations.run(w.ctx, w.project.id, calc.id, {
        inventory: { fromDataset: inventory.id },
      }),
    );
    expect(view.datasets).toEqual([
      expect.objectContaining({ input: 'inventory', rowCount: 2, obsolete: false }),
    ]);
    expect(view.view.outputs.find((o) => o.key === 'fixtures:WASHBASIN')).toMatchObject({
      label: 'Appareils sanitaires — Lavabo',
      value: 3,
    });
  });
});
