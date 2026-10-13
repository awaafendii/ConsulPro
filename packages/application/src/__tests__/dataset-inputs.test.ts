import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ELEC_ENGINES } from '@consulpro/calc-elec';
import { standardFileSchema } from '@consulpro/standards';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApplication, type Application } from '../index';
import type { StandardVersionDetail } from '../ports-projects';
import { InMemoryStore, userContext } from './in-memory';

/* Entrées « jeu de données » : la révision courante est lue, tracée et surveillée. */

const version = (file: string, id: string): StandardVersionDetail => {
  const seed = standardFileSchema.parse(
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`../../../standards/seeds/elec/${file}`, import.meta.url)),
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
      discipline: 'ELEC',
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
  for (const engine of ELEC_ENGINES) store.engines.register(engine);
  app = createApplication(store.deps());
  store.state.standardVersions = [
    version('nfc15-100-2002.json', 'v-nfc'),
    version('ute-c15-105-2003.json', 'v-ute'),
  ];
});

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const kw = (value: number) => ({ value, unit: 'kW' });
const TREE = [
  { code: 'TGBT', type: 'BOARD' },
  { code: 'D1', parent: 'TGBT', type: 'LOAD', power: kw(2), count: 10, ku: 0.75, cosPhi: 0.9 },
  { code: 'D2', parent: 'TGBT', type: 'LOAD', power: kw(3), cosPhi: 0.8 },
];

async function world() {
  const owner = store.addUser('owner@bet.test', 'Awa');
  must(await app.organizations.create(userContext(owner), { name: 'BET', slug: 'bet' }));
  const ctx = must(await app.organizations.resolveContext(userContext(owner), 'bet'));
  const project = must(
    await app.projects.create(ctx, {
      code: 'EL-1',
      name: 'Clinique',
      disciplines: ['ELEC', 'BTP'],
    }),
  );
  const study = must(
    await app.studies.create(ctx, project.id, { discipline: 'ELEC', title: 'Bilan' }),
  );
  const dataset = must(
    await app.datasets.create(ctx, project.id, { kind: 'ELEC_BOARD_TREE', title: 'Tableaux' }),
  );
  must(await app.datasets.saveRevision(ctx, project.id, dataset.id, { rows: TREE }, 1));
  const calc = must(
    await app.calculations.create(ctx, project.id, study.id, {
      title: 'Bilan général',
      engineId: 'elec.power-balance',
    }),
  );
  const run = (tree: unknown) =>
    app.calculations.run(ctx, project.id, calc.id, {
      tree,
      system: 'TRI',
      voltage: { value: 400, unit: 'V' },
    });
  return { ctx, project, study, dataset, calc, run };
}

describe('entrée « jeu de données »', () => {
  it('lit la révision courante, la trace et calcule', async () => {
    const w = await world();
    const view = must(await w.run({ fromDataset: w.dataset.id }));
    expect(view.revision.resultStatus).toBe('OK_WITH_WARNINGS');
    expect(view.revision.rawInputs.tree).toEqual({ fromDataset: w.dataset.id });
    expect(view.datasets).toEqual([
      expect.objectContaining({
        input: 'tree',
        datasetId: w.dataset.id,
        datasetTitle: 'Tableaux',
        datasetRevisionNumber: 1,
        rowCount: 3,
        obsolete: false,
      }),
    ]);
    // 16,2 kW absorbés : ks 0,9 (2 circuits) × (15 + 3).
    expect(view.view.outputs.find((o) => o.key === 'absorbedPower')?.value).toBeCloseTo(16.2, 9);
    expect(view.view.inputs.find((i) => i.key === 'tree')?.value).toBe('3 lignes');
  });

  it('une nouvelle révision du jeu rend le calcul obsolète', async () => {
    const w = await world();
    must(await w.run({ fromDataset: w.dataset.id }));
    must(
      await app.datasets.saveRevision(
        w.ctx,
        w.project.id,
        w.dataset.id,
        { rows: [...TREE, { code: 'D3', parent: 'TGBT', type: 'LOAD', power: kw(1), cosPhi: 1 }] },
        2,
      ),
    );
    const list = must(await app.calculations.listByStudy(w.ctx, w.project.id, w.study.id));
    expect(list[0]?.obsolete).toBe(true);
    const current =
      store.state.calculations.find((c) => c.id === w.calc.id)?.currentRevisionId ?? '';
    const view = must(await app.calculations.revision(w.ctx, w.project.id, current));
    expect(view.datasets[0]?.obsolete).toBe(true);
    // Recalcul : la révision 2 du jeu est lue, le calcul n'est plus obsolète.
    must(await w.run({ fromDataset: w.dataset.id }));
    expect(
      must(await app.calculations.listByStudy(w.ctx, w.project.id, w.study.id))[0]?.obsolete,
    ).toBe(false);
  });

  it('refuse les lignes saisies directement, un jeu absent, d’un autre type ou sans révision', async () => {
    const w = await world();
    const refused = async (tree: unknown, message: RegExp) => {
      const result = await w.run(tree);
      expect(result).toMatchObject({
        ok: false,
        error: { reason: 'INPUT_DATASET_INVALID', issues: [{ path: 'tree' }] },
      });
      if (!result.ok) expect(result.error.message).toMatch(message);
    };
    await refused(TREE, /Choisissez un jeu de données/);
    await refused({ fromDataset: '00000000-0000-7000-8000-999999999999' }, /introuvable/);
    const rooms = must(
      await app.datasets.create(w.ctx, w.project.id, { kind: 'ROOMS', title: 'Pièces' }),
    );
    await refused({ fromDataset: rooms.id }, /pas du type attendu/);
    const empty = must(
      await app.datasets.create(w.ctx, w.project.id, {
        kind: 'ELEC_BOARD_TREE',
        title: 'Vide',
      }),
    );
    await refused({ fromDataset: empty.id }, /aucune révision/);
    expect(store.state.datasetLinks).toHaveLength(0);
  });
});

describe('tableau de bord Électricité', () => {
  it('bilans de puissance, calculs non conformes, à vérifier et à recalculer', async () => {
    const w = await world();
    must(await w.run({ fromDataset: w.dataset.id }));
    const protection = must(
      await app.calculations.create(w.ctx, w.project.id, w.study.id, {
        title: 'Départ prises',
        engineId: 'elec.protection',
      }),
    );
    must(
      await app.calculations.run(w.ctx, w.project.id, protection.id, {
        current: { value: 30, unit: 'A' },
        iz: { value: 20, unit: 'A' },
        device: 'BREAKER',
        circuitType: 'OTHER',
      }),
    );
    must(
      await app.calculations.create(w.ctx, w.project.id, w.study.id, {
        title: 'Départ éclairage',
        engineId: 'elec.circuit',
      }),
    );
    // Un projet sans le métier Électricité n'apparaît pas.
    must(await app.projects.create(w.ctx, { code: 'BT-1', name: 'Hangar', disciplines: ['BTP'] }));

    const dashboard = must(await app.elecDashboard.get(w.ctx));
    expect(dashboard.engines).toEqual({
      total: ELEC_ENGINES.length,
      verified: 0,
      cases: ELEC_ENGINES.reduce((sum, e) => sum + (e.referenceCases?.total ?? 0), 0),
      checkedCases: 0,
    });
    expect(dashboard.projects.map((p) => p.project.code)).toEqual(['EL-1']);
    const summary = dashboard.projects[0];
    expect(summary?.calculations).toEqual({
      total: 3,
      notComputed: 1,
      verified: 0,
      toVerify: 2,
      rejected: 0,
      nonCompliant: 1,
      obsolete: 0,
    });
    expect(summary?.nonCompliant).toEqual([
      {
        calculationId: protection.id,
        title: 'Départ prises',
        engineId: 'elec.protection',
        engineTitle: ELEC_ENGINES.find((e) => e.id === 'elec.protection')?.title,
      },
    ]);
    const balance = summary?.powerBalances[0];
    expect(balance).toMatchObject({ calculationId: w.calc.id, revisionNumber: 1, obsolete: false });
    expect(balance?.absorbedPower).toBeCloseTo(16.2, 9);
    expect(balance?.apparentPower).toBeGreaterThan(16.2);
    expect(balance?.current).toBeGreaterThan(0);

    // Nouvelle révision du jeu de données : le bilan est à recalculer.
    must(await app.datasets.saveRevision(w.ctx, w.project.id, w.dataset.id, { rows: TREE }, 2));
    const after = must(await app.elecDashboard.get(w.ctx)).projects[0];
    expect(after?.calculations.obsolete).toBe(1);
    expect(after?.powerBalances[0]?.obsolete).toBe(true);
  });

  it('un membre sans accès au projet ne le voit pas', async () => {
    const w = await world();
    const user = store.addUser('externe@bet.test', 'Externe');
    must(await app.invitations.create(w.ctx, { email: user.email, role: 'ENGINEER' }));
    const token = /invitation\/(\S+)/.exec(store.sentMail.at(-1)?.text ?? '')?.[1] ?? '';
    must(await app.invitations.accept(userContext(user), token));
    const ctx = must(await app.organizations.resolveContext(userContext(user), 'bet'));
    expect(must(await app.elecDashboard.get(ctx)).projects).toEqual([]);
  });
});
