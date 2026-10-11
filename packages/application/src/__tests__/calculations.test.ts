import type { OrgRole } from '@consulpro/domain';
import type { ParameterDefinition } from '@consulpro/standards';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApplication, type Application, type OrgContext } from '../index';
import type { StandardHeader, StandardVersionDetail } from '../ports-projects';
import { InMemoryStore, userContext } from './in-memory';

let store: InMemoryStore;
let app: Application;

const header = (id: string, code: string): StandardHeader => ({
  id,
  organizationId: null,
  code,
  title: `Référentiel ${code}`,
  publisher: null,
  discipline: 'BTP',
  nature: 'PRACTICE',
});
const scalar = (key: string, value: number, unit: '%' | 'm2'): ParameterDefinition => ({
  key,
  label: `Libellé ${key}`,
  kind: 'SCALAR',
  value,
  unit,
  source: { document: 'Démonstration ConsulPro' },
  verification: 'TO_VERIFY',
});
const version = (id: string, standard: StandardHeader, params: ParameterDefinition[]) =>
  ({
    id,
    label: '1',
    status: 'PUBLISHED',
    sourceNotes: null,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    standard,
    parameters: params,
    rules: [],
  }) satisfies StandardVersionDetail;

const DEMO = 'v-demo';
const slab = {
  length: { value: 10, unit: 'm' },
  width: { value: 5, unit: 'm' },
  thickness: { value: 20, unit: 'cm' },
};

beforeEach(() => {
  store = new InMemoryStore();
  app = createApplication(store.deps());
  store.state.standardVersions = [
    version(DEMO, header('s-demo', 'DEMO'), [
      scalar('demo.waste_rate', 5, '%'),
      scalar('demo.max_area', 500, 'm2'),
    ]),
  ];
});

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

async function world() {
  const owner = store.addUser('owner@bet.test', 'Awa Owner');
  must(await app.organizations.create(userContext(owner), { name: 'BET', slug: 'bet' }));
  const ownerCtx = must(await app.organizations.resolveContext(userContext(owner), 'bet'));
  const member = async (name: string, role: OrgRole) => {
    const user = store.addUser(`${name}@bet.test`, name);
    must(await app.invitations.create(ownerCtx, { email: user.email, role }));
    const token = /invitation\/(\S+)/.exec(store.sentMail.at(-1)?.text ?? '')?.[1] ?? '';
    must(await app.invitations.accept(userContext(user), token));
    return { user, ctx: must(await app.organizations.resolveContext(userContext(user), 'bet')) };
  };
  const author = await member('auteur', 'ENGINEER');
  const checker = await member('verificateur', 'ENGINEER');
  const technician = await member('technicien', 'TECHNICIAN');
  const collaborator = await member('collaborateur', 'COLLABORATOR');
  const outsider = await member('externe', 'ENGINEER');
  const project = must(
    await app.projects.create(author.ctx, { code: 'P-1', name: 'Projet', disciplines: ['BTP'] }),
  );
  for (const m of [checker, technician, collaborator]) {
    must(
      await app.projectMembers.add(author.ctx, project.id, {
        userId: m.user.id,
        role: m.ctx.role as 'ENGINEER' | 'TECHNICIAN' | 'COLLABORATOR',
      }),
    );
  }
  const study = must(
    await app.studies.create(author.ctx, project.id, { discipline: 'BTP', title: 'Dalles R+1' }),
  );
  return { owner: ownerCtx, author, checker, technician, collaborator, outsider, project, study };
}

async function computed(w: Awaited<ReturnType<typeof world>>, engineId = 'demo.slab-volume') {
  const calc = must(
    await app.calculations.create(w.author.ctx, w.project.id, w.study.id, {
      title: engineId === 'demo.slab-volume' ? 'Dalle haute' : 'Masse',
      engineId,
    }),
  );
  return calc;
}

describe('études', () => {
  it('création, liste, modification ; métier actif et permission requis', async () => {
    const w = await world();
    expect(w.study).toMatchObject({
      title: 'Dalles R+1',
      calculationCount: 0,
      createdByName: 'auteur',
    });
    expect(
      await app.studies.create(w.collaborator.ctx, w.project.id, {
        discipline: 'BTP',
        title: 'X1',
      }),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });
    expect(
      await app.studies.create(w.technician.ctx, w.project.id, {
        discipline: 'ELEC',
        title: 'Bilan',
      }),
    ).toMatchObject({ ok: false, error: { reason: 'STUDY_DISCIPLINE_INACTIVE' } });
    expect(must(await app.studies.list(w.collaborator.ctx, w.project.id))).toHaveLength(1);
    expect(await app.studies.get(w.outsider.ctx, w.project.id, w.study.id)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.studies.get(w.author.ctx, w.project.id, 'absente')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    const update = (version: number, title = 'Dalles R+2') =>
      app.studies.update(w.author.ctx, w.project.id, w.study.id, { title }, version);
    expect(await update(9)).toMatchObject({ ok: false, error: { kind: 'PRECONDITION_FAILED' } });
    expect(await update(1, 'x')).toMatchObject({
      ok: false,
      error: { reason: 'STUDY_TITLE_INVALID' },
    });
    expect(await update(1)).toMatchObject({ ok: true, value: { title: 'Dalles R+2', version: 2 } });
    expect(
      await app.studies.update(w.author.ctx, w.project.id, 'absente', { title: 'Xyz' }, 1),
    ).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });
  });
});

describe('calculs : exécution et révisions immuables', () => {
  it('moteurs du métier ; création contrôlée', async () => {
    const w = await world();
    expect(
      must(await app.calculations.engines(w.author.ctx, w.project.id)).map((e) => e.id),
    ).toEqual(['demo.slab-mass', 'demo.slab-volume']);
    const create = (input: { title: string; engineId: string }, ctx: OrgContext = w.author.ctx) =>
      app.calculations.create(ctx, w.project.id, w.study.id, input);
    expect(await create({ title: 'X1', engineId: 'elec.inconnu' })).toMatchObject({
      ok: false,
      error: { reason: 'ENGINE_UNAVAILABLE' },
    });
    expect(await create({ title: 'x', engineId: 'demo.slab-volume' })).toMatchObject({
      ok: false,
      error: { reason: 'CALCULATION_TITLE_INVALID' },
    });
    expect(
      await create({ title: 'Dalle', engineId: 'demo.slab-volume' }, w.collaborator.ctx),
    ).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(
      await app.calculations.create(w.author.ctx, w.project.id, 'absente', {
        title: 'Dalle',
        engineId: 'demo.slab-volume',
      }),
    ).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });
    const calc = must(await create({ title: 'Dalle', engineId: 'demo.slab-volume' }));
    expect(calc).toMatchObject({ engineAvailable: true, current: null, obsolete: false });
    expect(
      must(await app.studies.get(w.author.ctx, w.project.id, w.study.id)).calculationCount,
    ).toBe(1);
  });

  it('calcul côté serveur : paramètres figés, empreinte, vue, trace, audit', async () => {
    const w = await world();
    const calc = await computed(w);
    const view = must(await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab));
    expect(view.revision).toMatchObject({
      number: 1,
      resultStatus: 'OK_WITH_WARNINGS',
      workflowStatus: 'COMPUTED',
      engineVersion: '1.0.0',
      standards: [{ standardVersionId: DEMO, code: 'DEMO', version: '1' }],
    });
    expect(view.revision.parameterSnapshotHash).toMatch(/^h\d+:/);
    expect(view.isCurrent).toBe(true);
    expect(view.can).toEqual({ validate: true, verify: false });
    expect(view.view.inputs).toEqual([
      { key: 'length', label: 'Longueur', value: 10, unit: 'm', defaulted: false },
      { key: 'width', label: 'Largeur', value: 5, unit: 'm', defaulted: false },
      { key: 'thickness', label: 'Épaisseur', value: 20, unit: 'cm', defaulted: false },
    ]);
    expect(view.view.outputs.map((o) => [o.key, o.precision])).toEqual([
      ['area', 2],
      ['volume', 3],
      ['volumeWithWaste', 3],
    ]);
    expect(view.view.parameters[0]).toMatchObject({
      key: 'demo.max_area',
      label: 'Surface maximale (démonstration)',
      unit: 'm2',
      verification: 'TO_VERIFY',
    });
    expect(view.view.units).toMatchObject({ m2: 'm²', m3: 'm³', cm: 'cm' });
    expect(view.view.engine.title).toMatch(/^Démonstration/);
    expect(store.state.audit.map((a) => a.action)).toContain('calculation.revision_created');
    expect(store.state.activity.map((a) => a.type)).toContain('calculation.computed');

    const again = must(await app.calculations.run(w.technician.ctx, w.project.id, calc.id, slab));
    expect(again.revision.number).toBe(2);
    // Mêmes paramètres : même empreinte.
    expect(again.revision.parameterSnapshotHash).toBe(view.revision.parameterSnapshotHash);
    expect(
      must(await app.calculations.revisions(w.collaborator.ctx, w.project.id, calc.id)).map(
        (r) => r.number,
      ),
    ).toEqual([2, 1]);
    expect(
      must(await app.calculations.get(w.author.ctx, w.project.id, calc.id)).current?.number,
    ).toBe(2);
  });

  it('entrées refusées ou paramètres manquants : aucune révision, détail par champ', async () => {
    const w = await world();
    const calc = await computed(w);
    const invalid = await app.calculations.run(w.author.ctx, w.project.id, calc.id, {
      ...slab,
      thickness: { value: 9, unit: 'm' },
    });
    expect(invalid).toMatchObject({
      ok: false,
      error: {
        kind: 'VALIDATION',
        reason: 'CALCULATION_INPUT_INVALID',
        issues: [{ path: 'thickness.value' }],
      },
    });
    must(await app.library.setProjectStandards(w.author.ctx, w.project.id, 'BTP', []));
    const missing = await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab);
    expect(missing).toMatchObject({
      ok: false,
      error: {
        issues: [{ path: 'parameters.demo.waste_rate' }, { path: 'parameters.demo.max_area' }],
      },
    });
    expect(store.state.revisions).toHaveLength(0);
  });

  it('référentiels retenus ambigus : calcul refusé ; surcharge de projet appliquée et signalée', async () => {
    const w = await world();
    const calc = await computed(w);
    must(
      await app.library.createProjectOverride(w.author.ctx, w.project.id, {
        standardVersionId: DEMO,
        key: 'demo.waste_rate',
        value: { kind: 'SCALAR', value: 8, unit: '%' },
        justification: 'Chantier exigu',
      }),
    );
    const view = must(await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab));
    expect(view.view.parameters.find((p) => p.key === 'demo.waste_rate')).toMatchObject({
      value: 8,
      override: { referenceValue: 5, scope: 'PROJECT', justification: 'Chantier exigu' },
    });
    expect(view.view.warnings.map((w) => w.code)).toContain('PARAMETER_OVERRIDDEN');

    store.state.standardVersions.push(
      version('v-dup', header('s-dup', 'DUP'), [scalar('demo.waste_rate', 6, '%')]),
    );
    must(await app.library.setProjectStandards(w.author.ctx, w.project.id, 'BTP', [DEMO, 'v-dup']));
    expect(await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab)).toMatchObject({
      ok: false,
      error: { reason: 'PARAMETERS_UNRESOLVABLE', issues: [{ code: 'PARAMETER_AMBIGUOUS' }] },
    });
  });

  it('moteur indisponible sur le serveur : calcul affiché mais non exécutable', async () => {
    const w = await world();
    const calc = await computed(w);
    store.state.calculations = store.state.calculations.map((c) =>
      c.id === calc.id ? { ...c, engineId: 'elec.voltage-drop' } : c,
    );
    expect(must(await app.calculations.get(w.author.ctx, w.project.id, calc.id))).toMatchObject({
      engineAvailable: false,
      engineTitle: 'elec.voltage-drop',
    });
    expect(await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab)).toMatchObject({
      ok: false,
      error: { reason: 'ENGINE_UNAVAILABLE' },
    });
    expect(await app.calculations.run(w.author.ctx, w.project.id, 'absent', slab)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });
});

describe('contrôle à deux niveaux', () => {
  it('l’auteur valide, un autre ingénieur vérifie ; notifications et traces', async () => {
    const w = await world();
    const calc = await computed(w);
    const rev = must(
      await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab),
    ).revision;

    // Validation : réservée à l'auteur (permission OWN).
    expect(await app.calculations.validate(w.checker.ctx, w.project.id, rev.id)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(
      await app.calculations.verify(w.checker.ctx, w.project.id, rev.id, 'APPROVED'),
    ).toMatchObject({
      ok: false,
      error: { reason: 'REVISION_NOT_VALIDATED' },
    });
    const validated = must(
      await app.calculations.validate(w.author.ctx, w.project.id, rev.id, 'RAS'),
    );
    expect(validated.revision.workflowStatus).toBe('VALIDATED');
    expect(validated.can).toEqual({ validate: false, verify: false });
    // Vérificateurs possibles notifiés : propriétaire et ingénieur membre, jamais l'auteur.
    const notified = store.state.notifications.filter((n) => n.type === 'calculation.to_verify');
    expect(
      notified.map((n) => store.state.users.find((u) => u.id === n.userId)?.name).sort(),
    ).toEqual(['Awa Owner', 'verificateur']);
    expect(notified[0]?.link).toBe(`/bet/projets/${w.project.id}/calculs/${calc.id}`);

    // L'auteur ne vérifie pas son propre calcul ; un technicien n'a pas la permission.
    expect(
      await app.calculations.verify(w.author.ctx, w.project.id, rev.id, 'APPROVED'),
    ).toMatchObject({
      ok: false,
      error: { kind: 'POLICY_VIOLATION', reason: 'VERIFIER_IS_AUTHOR' },
    });
    expect(
      await app.calculations.verify(w.technician.ctx, w.project.id, rev.id, 'APPROVED'),
    ).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    const checkerView = must(await app.calculations.revision(w.checker.ctx, w.project.id, rev.id));
    expect(checkerView.can).toEqual({ validate: false, verify: true });
    const verified = must(
      await app.calculations.verify(w.checker.ctx, w.project.id, rev.id, 'APPROVED'),
    );
    expect(verified.revision.workflowStatus).toBe('VERIFIED');
    expect(verified.reviews.map((r) => [r.type, r.reviewerName])).toEqual([
      ['VALIDATION', 'auteur'],
      ['VERIFICATION', 'verificateur'],
    ]);
    expect(store.state.notifications.at(-1)).toMatchObject({
      userId: w.author.user.id,
      type: 'calculation.verified',
    });
    expect(store.state.audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['calculation.validated', 'calculation.verified']),
    );
  });

  it('rejet motivé ; une révision remplacée ou sans résultat ne se contrôle plus', async () => {
    const w = await world();
    const calc = await computed(w);
    const first = must(
      await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab),
    ).revision;
    must(await app.calculations.validate(w.author.ctx, w.project.id, first.id));
    expect(
      await app.calculations.verify(w.checker.ctx, w.project.id, first.id, 'REJECTED', ' '),
    ).toMatchObject({
      ok: false,
      error: { reason: 'REJECTION_UNJUSTIFIED' },
    });
    const rejected = must(
      await app.calculations.verify(
        w.checker.ctx,
        w.project.id,
        first.id,
        'REJECTED',
        'Épaisseur à revoir',
      ),
    );
    expect(rejected.revision.workflowStatus).toBe('REJECTED');
    expect(store.state.notifications.at(-1)).toMatchObject({
      type: 'calculation.rejected',
      body: 'Épaisseur à revoir',
    });

    must(await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab));
    expect(await app.calculations.validate(w.author.ctx, w.project.id, first.id)).toMatchObject({
      ok: false,
      error: { reason: 'REVISION_SUPERSEDED' },
    });
    expect(await app.calculations.validate(w.author.ctx, w.project.id, 'absente')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.calculations.revision(w.author.ctx, w.project.id, 'absente')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });

  it('projet archivé : plus de calcul ni de contrôle', async () => {
    const w = await world();
    const calc = await computed(w);
    const rev = must(
      await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab),
    ).revision;
    must(await app.projects.archive(w.author.ctx, w.project.id, 1));
    expect(await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab)).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_ARCHIVED' },
    });
    expect(await app.calculations.validate(w.author.ctx, w.project.id, rev.id)).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_ARCHIVED' },
    });
    expect(must(await app.calculations.revision(w.author.ctx, w.project.id, rev.id)).can).toEqual({
      validate: false,
      verify: false,
    });
  });
});

describe('dépendances et comparaison', () => {
  it('entrée reprise d’un autre calcul ; obsolescence quand la source est recalculée', async () => {
    const w = await world();
    const volume = await computed(w);
    const first = must(
      await app.calculations.run(w.author.ctx, w.project.id, volume.id, slab),
    ).revision;
    const mass = await computed(w, 'demo.slab-mass');

    const linkable = must(
      await app.calculations.linkableOutputs(w.author.ctx, w.project.id, mass.id),
    );
    expect(linkable.map((o) => [o.output, o.unit])).toEqual([
      ['area', 'm2'],
      ['volume', 'm3'],
      ['volumeWithWaste', 'm3'],
    ]);
    expect(
      must(await app.calculations.linkableOutputs(w.author.ctx, w.project.id, volume.id)),
    ).toEqual([]);

    const link = { fromCalculation: volume.id, output: 'volumeWithWaste' };
    const density = { value: 2400, unit: 'kg/m3' };
    const view = must(
      await app.calculations.run(w.author.ctx, w.project.id, mass.id, { volume: link, density }),
    );
    expect(view.view.outputs[0]?.value).toBeCloseTo(25200, 6);
    expect(view.revision.rawInputs.volume).toEqual(link);
    expect(view.dependencies).toMatchObject([
      {
        input: 'volume',
        sourceCalculationTitle: 'Dalle haute',
        sourceRevisionNumber: 1,
        obsolete: false,
      },
    ]);

    const errors: [Record<string, unknown>, string][] = [
      [{ volume: { fromCalculation: mass.id, output: 'mass' }, density }, 'propre sortie'],
      [{ volume: { fromCalculation: volume.id, output: 'inconnue' }, density }, 'absente'],
      [
        {
          volume: { fromCalculation: '00000000-0000-7000-8000-000000000999', output: 'volume' },
          density,
        },
        'n’existe pas',
      ],
    ];
    for (const [inputs, message] of errors) {
      const result = await app.calculations.run(w.author.ctx, w.project.id, mass.id, inputs);
      expect(result).toMatchObject({ ok: false, error: { reason: 'INPUT_LINK_INVALID' } });
      expect(!result.ok && result.error.message).toContain(message);
    }

    // Recalcul de la source : le calcul aval est signalé obsolète.
    const second = must(
      await app.calculations.run(w.author.ctx, w.project.id, volume.id, {
        ...slab,
        length: { value: 12, unit: 'm' },
      }),
    ).revision;
    const list = must(await app.calculations.listByStudy(w.author.ctx, w.project.id, w.study.id));
    expect(list.find((c) => c.id === mass.id)?.obsolete).toBe(true);
    expect(
      must(await app.calculations.revision(w.author.ctx, w.project.id, view.revision.id))
        .dependencies[0]?.obsolete,
    ).toBe(true);

    const comparison = must(
      await app.calculations.compare(w.author.ctx, w.project.id, first.id, second.id),
    );
    expect(comparison.differences.map((d) => `${d.section}:${d.path}`)).toEqual([
      'inputs:length.value',
      'outputs:area',
      'outputs:volume',
      'outputs:volumeWithWaste',
      'checks:demo.max-area.measured',
    ]);
    expect(
      await app.calculations.compare(w.author.ctx, w.project.id, first.id, view.revision.id),
    ).toMatchObject({
      ok: false,
      error: { reason: 'REVISIONS_UNRELATED' },
    });
    expect(
      await app.calculations.compare(w.author.ctx, w.project.id, first.id, 'absente'),
    ).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.calculations.listByStudy(w.author.ctx, w.project.id, 'absente')).toMatchObject(
      {
        ok: false,
        error: { kind: 'NOT_FOUND' },
      },
    );
    expect(await app.calculations.revisions(w.author.ctx, w.project.id, 'absent')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });
});

describe('données de projet', () => {
  it('types du métier, révisions immuables validées ligne par ligne', async () => {
    const w = await world();
    expect(must(await app.datasets.kinds(w.author.ctx, w.project.id)).map((k) => k.id)).toEqual([
      'ROOMS',
    ]);
    expect(
      await app.datasets.create(w.author.ctx, w.project.id, { kind: 'X', title: 'Pièces' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'DATASET_KIND_UNKNOWN' },
    });
    expect(
      await app.datasets.create(w.author.ctx, w.project.id, { kind: 'ROOMS', title: 'x' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'DATASET_TITLE_INVALID' },
    });
    const dataset = must(
      await app.datasets.create(w.collaborator.ctx, w.project.id, {
        kind: 'ROOMS',
        title: 'Pièces R+1',
      }),
    );
    const save = (rows: Record<string, unknown>[], version: number) =>
      app.datasets.saveRevision(
        w.technician.ctx,
        w.project.id,
        dataset.id,
        { rows, note: ' Relevé ' },
        version,
      );
    expect(await save([{ name: '', area: { value: 10, unit: 'm2' } }], 1)).toMatchObject({
      ok: false,
      error: { reason: 'DATASET_ROWS_INVALID', issues: [{ path: 'rows.1.name' }] },
    });
    expect(await save([], 3)).toMatchObject({ ok: false, error: { kind: 'PRECONDITION_FAILED' } });
    const first = must(await save([{ name: 'Séjour', area: { value: 24, unit: 'm2' } }], 1));
    expect(first).toMatchObject({
      number: 1,
      rowCount: 1,
      note: 'Relevé',
      authorName: 'technicien',
    });
    must(await save([{ name: 'Séjour', area: { value: 25, unit: 'm2' } }], 2));

    const current = must(await app.datasets.revision(w.author.ctx, w.project.id, dataset.id));
    expect(current.revision?.number).toBe(2);
    expect(
      must(await app.datasets.revision(w.author.ctx, w.project.id, dataset.id, first.id)).revision
        ?.rows,
    ).toEqual([{ name: 'Séjour', level: null, area: { value: 24, unit: 'm2' }, height: null }]);
    expect(
      await app.datasets.revision(w.author.ctx, w.project.id, dataset.id, 'absente'),
    ).toMatchObject({ ok: false });
    expect(
      must(await app.datasets.revisions(w.author.ctx, w.project.id, dataset.id)).map(
        (r) => r.number,
      ),
    ).toEqual([2, 1]);
    expect(must(await app.datasets.list(w.author.ctx, w.project.id))[0]?.current?.number).toBe(2);
    expect(
      await app.datasets.saveRevision(w.outsider.ctx, w.project.id, dataset.id, { rows: [] }, 3),
    ).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.datasets.revisions(w.author.ctx, w.project.id, 'absent')).toMatchObject({
      ok: false,
    });
    expect(await app.datasets.revision(w.author.ctx, w.project.id, 'absent')).toMatchObject({
      ok: false,
    });
  });

  it('type d’un métier non activé refusé', async () => {
    const w = await world();
    const elec = must(
      await app.projects.create(w.author.ctx, {
        code: 'P-ELEC',
        name: 'Élec',
        disciplines: ['ELEC'],
      }),
    );
    expect(must(await app.datasets.kinds(w.author.ctx, elec.id))).toEqual([]);
    expect(
      await app.datasets.create(w.author.ctx, elec.id, { kind: 'ROOMS', title: 'Pièces' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'DATASET_DISCIPLINE_INACTIVE' },
    });
  });
});

describe('compte, notifications, recherche, transfert de propriété', () => {
  it('préférences et fuseau horaire validé', async () => {
    const w = await world();
    const ctx = userContext(w.author.user);
    expect(must(await app.account.preferences(ctx))).toEqual({
      timeZone: null,
      effectiveTimeZone: 'Africa/Abidjan',
      twoFactorEnabled: false,
    });
    expect(await app.account.setTimeZone(ctx, 'Mars/Olympus')).toMatchObject({
      ok: false,
      error: { reason: 'TIME_ZONE_INVALID' },
    });
    must(await app.account.setTimeZone(ctx, 'Africa/Dakar'));
    expect(must(await app.account.preferences(ctx)).effectiveTimeZone).toBe('Africa/Dakar');
    expect(
      await app.account.preferences(userContext({ id: 'x', email: 'x@x', name: 'x' })),
    ).toMatchObject({ ok: false });
  });

  it('centre de notifications : liste, non lues, marquage', async () => {
    const w = await world();
    const calc = await computed(w);
    const rev = must(
      await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab),
    ).revision;
    must(await app.calculations.validate(w.author.ctx, w.project.id, rev.id));
    const ctx = userContext(w.checker.user);
    const page = must(await app.account.notifications(ctx, { limit: 10, unreadOnly: true }));
    expect(page).toMatchObject({ unreadCount: 1, nextCursor: null });
    const id = page.items[0]?.id ?? '';
    expect(must(await app.account.markRead(ctx, [id]))).toEqual({ updated: 1 });
    expect(
      must(await app.account.notifications(ctx, { limit: 10, unreadOnly: true })).items,
    ).toEqual([]);
    expect(must(await app.account.markRead(ctx, null))).toEqual({ updated: 0 });
    must(await app.calculations.run(w.author.ctx, w.project.id, calc.id, slab));
    expect(
      must(await app.account.notifications(ctx, { limit: 0, unreadOnly: false })),
    ).toMatchObject({
      items: [],
      nextCursor: null,
    });
  });

  it('recherche sans accents, limitée aux projets accessibles', async () => {
    const w = await world();
    await computed(w);
    const hits = must(await app.account.search(w.author.ctx, 'dalle'));
    expect(hits.map((h) => [h.type, h.href.split('/').slice(3, 5).join('/')])).toEqual([
      ['study', `${w.project.id}/etudes`],
      ['calculation', `${w.project.id}/calculs`],
    ]);
    expect(must(await app.account.search(w.author.ctx, 'PROJET')).map((h) => h.type)).toEqual([
      'project',
    ]);
    expect(must(await app.account.search(w.outsider.ctx, 'dalle'))).toEqual([]);
    expect(must(await app.account.search(w.owner, 'dalle'))).toHaveLength(2);
  });

  it('transfert de propriété : réservé au propriétaire, vers un autre membre', async () => {
    const w = await world();
    const membership = store.state.memberships.find((m) => m.userId === w.checker.user.id);
    if (!membership) throw new Error();
    expect(await app.account.transferOwnership(w.author.ctx, membership.id)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(await app.account.transferOwnership(w.owner, w.owner.membershipId)).toMatchObject({
      ok: false,
      error: { reason: 'SELF_TRANSFER' },
    });
    expect(await app.account.transferOwnership(w.owner, 'absente')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    must(await app.account.transferOwnership(w.owner, membership.id));
    const roles = Object.fromEntries(store.state.memberships.map((m) => [m.userId, m.role]));
    expect(roles[w.checker.user.id]).toBe('OWNER');
    expect(roles[w.owner.actor.userId]).toBe('ADMIN');
    expect(store.state.audit.at(-1)?.action).toBe('organization.ownership_transferred');
    expect(store.state.notifications.at(-1)).toMatchObject({ userId: w.checker.user.id });
  });
});
