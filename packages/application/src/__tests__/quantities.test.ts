import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BTP_ENGINES } from '@consulpro/calc-btp';
import { formatDecimal, type OrgRole } from '@consulpro/domain';
import { standardFileSchema } from '@consulpro/standards';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApplication, type Application } from '../index';
import type { StandardVersionDetail } from '../ports-projects';
import { InMemoryStore, userContext } from './in-memory';

/* Avant-métré, quantitatifs, prix et tableau de bord BTP, avec les moteurs BTP réels. */

const seed = standardFileSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../standards/seeds/btp/usages-metre-1.json', import.meta.url)),
      'utf8',
    ),
  ),
);

const BTP_VERSION: StandardVersionDetail = {
  id: 'v-btp',
  label: seed.version.label,
  status: 'PUBLISHED',
  sourceNotes: null,
  publishedAt: new Date('2026-01-01T00:00:00Z'),
  standard: {
    id: 's-btp',
    organizationId: null,
    code: seed.standard.code,
    title: seed.standard.title,
    publisher: null,
    discipline: 'BTP',
    nature: 'PRACTICE',
  },
  parameters: seed.parameters,
  rules: [],
};

let store: InMemoryStore;
let app: Application;

beforeEach(() => {
  store = new InMemoryStore();
  for (const engine of BTP_ENGINES) store.engines.register(engine);
  app = createApplication(store.deps());
  store.state.standardVersions = [BTP_VERSION];
});

const must = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }) => {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

const m = (value: number) => ({ value, unit: 'm' });
const FOOTING = { type: 'ISOLATED', length: m(1.2), width: m(1.2), height: m(0.4), count: 6 };
const COLUMN = { sectionA: m(0.25), sectionB: m(0.25), height: m(3) };

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
  const engineer = await member('ingenieur', 'ENGINEER');
  const technician = await member('technicien', 'TECHNICIAN');
  const collaborator = await member('collaborateur', 'COLLABORATOR');
  const outsider = await member('externe', 'ENGINEER');
  const project = must(
    await app.projects.create(engineer.ctx, {
      code: 'IMM-1',
      name: 'Immeuble',
      disciplines: ['BTP', 'ELEC'],
    }),
  );
  for (const m of [technician, collaborator]) {
    must(
      await app.projectMembers.add(engineer.ctx, project.id, {
        userId: m.user.id,
        role: m.ctx.role as 'TECHNICIAN' | 'COLLABORATOR',
      }),
    );
  }
  const study = must(
    await app.studies.create(engineer.ctx, project.id, { discipline: 'BTP', title: 'Gros œuvre' }),
  );
  const calc = async (title: string, engineId: string, inputs: Record<string, unknown>) => {
    const calculation = must(
      await app.calculations.create(engineer.ctx, project.id, study.id, { title, engineId }),
    );
    must(await app.calculations.run(engineer.ctx, project.id, calculation.id, inputs));
    return calculation;
  };
  return { owner: ownerCtx, engineer, technician, collaborator, outsider, project, study, calc };
}

type World = Awaited<ReturnType<typeof world>>;

async function structure(w: World) {
  const node = (
    parentId: string | null,
    kind: 'LOT' | 'LEVEL' | 'ELEMENT',
    code: string,
    title: string,
  ) => app.takeoff.createNode(w.technician.ctx, w.project.id, { parentId, kind, code, title });
  const lot = must(await node(null, 'LOT', '1', 'Fondations'));
  const lot2 = must(await node(null, 'LOT', '2', 'Élévation'));
  const level = must(await node(lot2.id, 'LEVEL', '2.1', 'RDC'));
  const element = must(await node(level.id, 'ELEMENT', '2.1.1', 'Poteaux RDC'));
  return { lot, lot2, level, element };
}

describe('avant-métré', () => {
  it('structure lot → niveau → ouvrage, ordre naturel, contrôles', async () => {
    const w = await world();
    const { lot, lot2, level, element } = await structure(w);
    const view = must(await app.takeoff.get(w.collaborator.ctx, w.project.id));
    expect(view.nodes.map((n) => `${n.code}:${String(n.depth)}`)).toEqual([
      '1:0',
      '2:0',
      '2.1:1',
      '2.1.1:2',
    ]);
    const create = (input: Parameters<typeof app.takeoff.createNode>[2], ctx = w.technician.ctx) =>
      app.takeoff.createNode(ctx, w.project.id, input);
    expect(
      await create({ parentId: null, kind: 'LEVEL', code: '9', title: 'Niveau' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'TAKEOFF_NESTING_INVALID' },
    });
    expect(
      await create({ parentId: element.id, kind: 'ELEMENT', code: 'x', title: 'Sous-ouvrage' }),
    ).toMatchObject({ ok: false, error: { reason: 'TAKEOFF_NESTING_INVALID' } });
    expect(
      await create({ parentId: 'absent', kind: 'LEVEL', code: '9', title: 'Niveau' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'TAKEOFF_PARENT_NOT_FOUND' },
    });
    expect(
      await create({ parentId: null, kind: 'LOT', code: '1', title: 'Doublon' }),
    ).toMatchObject({
      ok: false,
      error: { kind: 'CONFLICT', reason: 'TAKEOFF_CODE_TAKEN' },
    });
    // Même code autorisé sous un autre parent.
    expect(
      (await create({ parentId: lot.id, kind: 'ELEMENT', code: '2.1', title: 'Semelles' })).ok,
    ).toBe(true);
    expect(await create({ parentId: null, kind: 'LOT', code: 'a b', title: 'Lot' })).toMatchObject({
      ok: false,
      error: { reason: 'TAKEOFF_CODE_INVALID' },
    });
    expect(await create({ parentId: null, kind: 'LOT', code: '3', title: 'x' })).toMatchObject({
      ok: false,
      error: { reason: 'TAKEOFF_TITLE_INVALID' },
    });
    expect(
      await create({ parentId: null, kind: 'LOT', code: '3', title: 'Lot 3' }, w.collaborator.ctx),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });
    expect(await app.takeoff.get(w.outsider.ctx, w.project.id)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });

    // Modification : version attendue, code unique parmi les frères.
    const update = (version: number, input: { code?: string; title?: string }) =>
      app.takeoff.updateNode(w.technician.ctx, w.project.id, lot2.id, input, version);
    expect(await update(5, { title: 'Superstructure' })).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(await update(1, { code: '1' })).toMatchObject({
      ok: false,
      error: { reason: 'TAKEOFF_CODE_TAKEN' },
    });
    expect(await update(1, { title: 'Superstructure' })).toMatchObject({
      ok: true,
      value: { title: 'Superstructure', code: '2', version: 2 },
    });

    // Suppression : seulement d'un nœud vide.
    expect(await app.takeoff.deleteNode(w.technician.ctx, w.project.id, level.id, 1)).toMatchObject(
      {
        ok: false,
        error: { kind: 'CONFLICT', reason: 'TAKEOFF_NODE_NOT_EMPTY' },
      },
    );
    expect(
      await app.takeoff.deleteNode(w.technician.ctx, w.project.id, element.id, 9),
    ).toMatchObject({ ok: false, error: { kind: 'PRECONDITION_FAILED' } });
    expect((await app.takeoff.deleteNode(w.technician.ctx, w.project.id, element.id, 1)).ok).toBe(
      true,
    );
    expect(
      await app.takeoff.deleteNode(w.technician.ctx, w.project.id, element.id, 1),
    ).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });
  });

  it('métier BTP requis', async () => {
    const w = await world();
    const elecOnly = must(
      await app.projects.create(w.engineer.ctx, {
        code: 'EL-1',
        name: 'Élec',
        disciplines: ['ELEC'],
      }),
    );
    expect(
      await app.takeoff.createNode(w.engineer.ctx, elecOnly.id, {
        parentId: null,
        kind: 'LOT',
        code: '1',
        title: 'Lot',
      }),
    ).toMatchObject({ ok: false, error: { reason: 'BTP_DISCIPLINE_INACTIVE' } });
  });

  it('rattachement des calculs BTP : rattacher, déplacer, détacher', async () => {
    const w = await world();
    const { lot, element } = await structure(w);
    const footing = await w.calc('Semelles S1', 'btp.footings', FOOTING);
    const assign = (nodeId: string | null, calculationId = footing.id) =>
      app.takeoff.assign(w.technician.ctx, w.project.id, calculationId, nodeId);
    expect((await assign(lot.id)).ok).toBe(true);
    let view = must(await app.takeoff.get(w.technician.ctx, w.project.id));
    expect(view.calculations).toMatchObject([
      { id: footing.id, nodeId: lot.id, studyTitle: 'Gros œuvre', obsolete: false },
    ]);
    expect((await assign(element.id)).ok).toBe(true);
    view = must(await app.takeoff.get(w.technician.ctx, w.project.id));
    expect(view.calculations[0]?.nodeId).toBe(element.id);
    expect((await assign(null)).ok).toBe(true);
    expect((await assign(null)).ok).toBe(true); // idempotent
    view = must(await app.takeoff.get(w.technician.ctx, w.project.id));
    expect(view.calculations[0]?.nodeId).toBeNull();
    expect(await assign('absent')).toMatchObject({
      ok: false,
      error: { reason: 'TAKEOFF_NODE_NOT_FOUND' },
    });
    expect(await assign(lot.id, 'absent')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    // Un calcul d'une étude Électricité ne se rattache pas (aucun moteur Électricité n'est
    // encore livré : l'étude et le calcul sont posés directement dans le magasin).
    store.state.studies.push({
      ...store.state.studies.find((x) => x.id === w.study.id)!,
      id: 'etude-elec',
      discipline: 'ELEC',
      title: 'Bilan de puissance',
    });
    const elecCalc = {
      ...store.state.calculations.find((c) => c.id === footing.id)!,
      id: 'calcul-elec',
      studyId: 'etude-elec',
    };
    store.state.calculations.push(elecCalc);
    expect(await assign(lot.id, elecCalc.id)).toMatchObject({
      ok: false,
      error: { reason: 'TAKEOFF_CALCULATION_NOT_BTP' },
    });
    expect(
      await app.takeoff.assign(w.collaborator.ctx, w.project.id, footing.id, lot.id),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });
  });
});

async function boqWorld() {
  const w = await world();
  const nodes = await structure(w);
  const footing = await w.calc('Semelles S1', 'btp.footings', FOOTING);
  const column = await w.calc('Poteaux P1', 'btp.columns', COLUMN);
  must(await app.takeoff.assign(w.technician.ctx, w.project.id, footing.id, nodes.lot.id));
  must(await app.takeoff.assign(w.technician.ctx, w.project.id, column.id, nodes.element.id));
  const boq = must(await app.boqs.create(w.technician.ctx, w.project.id, { title: 'DQE APD' }));
  return { ...w, nodes, footing, column, boq };
}

describe('quantitatif', () => {
  it('création : lignes reprises de l’avant-métré, liées à leur révision, sans aucun prix', async () => {
    const w = await boqWorld();
    expect(w.boq.currency).toBe('XOF');
    expect(w.boq.pending).toEqual({ add: 0, update: 0, remove: 0 });
    const lines = w.boq.items.map((i) => [i.designation, i.unit, formatDecimal(i.quantity)]);
    // Semelles : 6 × 1,2 × 1,2 × 0,4 = 3,456 m³ ; propreté (débord de 5 cm) 6 × 1,3² × 0,05 = 0,507 m³.
    expect(lines).toContainEqual(['Semelles S1 — Béton armé', 'm3', '3.456']);
    expect(lines).toContainEqual(['Semelles S1 — Béton de propreté', 'm3', '0.507']);
    expect(w.boq.items.every((i) => i.origin === 'CALCULATION' && i.unitPrice === null)).toBe(true);
    expect(w.boq.items.every((i) => i.source?.revisionNumber === 1 && !i.source.superseded)).toBe(
      true,
    );
    expect(w.boq.items.every((i) => i.source?.engineVerified === false)).toBe(true);
    // Ordre du DQE : lot 1 (semelles) avant le lot 2 (poteaux).
    expect(w.boq.items[0]?.nodeId).toBe(w.nodes.lot.id);
    expect(w.boq.items.at(-1)?.nodeId).toBe(w.nodes.element.id);
    expect(w.boq.total).toMatchObject({ amount: 0n, unpriced: w.boq.items.length });
    // Sous-total du lot 2 = lignes de l'ouvrage (descendant).
    const lot2 = w.boq.nodes.find((n) => n.id === w.nodes.lot2.id);
    expect(lot2?.subtotal.lines).toBe(
      w.boq.items.filter((i) => i.nodeId === w.nodes.element.id).length,
    );
    expect(must(await app.boqs.list(w.collaborator.ctx, w.project.id))).toHaveLength(1);
    expect(store.state.activity.map((a) => a.type)).toContain('boq.created');
  });

  it('mise à jour : nouvelle révision, rattachement et détachement ; prix conservés', async () => {
    const w = await boqWorld();
    const concrete = w.boq.items.find((i) => i.designation === 'Semelles S1 — Béton armé')!;
    must(
      await app.boqs.updateItem(
        w.technician.ctx,
        w.project.id,
        w.boq.boq.id,
        concrete.id,
        { unitPrice: '65000' },
        concrete.version,
      ),
    );
    // Nouvelle révision : 8 semelles au lieu de 6.
    must(
      await app.calculations.run(w.engineer.ctx, w.project.id, w.footing.id, {
        ...FOOTING,
        count: 8,
      }),
    );
    let view = must(await app.boqs.get(w.technician.ctx, w.project.id, w.boq.boq.id));
    expect(view.pending.update).toBeGreaterThan(0);
    expect(view.items.find((i) => i.id === concrete.id)?.source?.superseded).toBe(true);
    const synced = must(await app.boqs.sync(w.technician.ctx, w.project.id, w.boq.boq.id));
    expect(synced.updated).toBeGreaterThan(0);
    expect(synced.view.pending).toEqual({ add: 0, update: 0, remove: 0 });
    const updated = synced.view.items.find((i) => i.id === concrete.id)!;
    expect(formatDecimal(updated.quantity)).toBe('4.608'); // 8 × 0,576
    expect(updated.source).toMatchObject({ revisionNumber: 2, superseded: false });
    expect(formatDecimal(updated.unitPrice!)).toBe('65000');
    expect(formatDecimal(updated.amount!)).toBe('299520'); // 4,608 × 65 000

    // Détacher les poteaux : leurs lignes disparaissent à la mise à jour.
    must(await app.takeoff.assign(w.technician.ctx, w.project.id, w.column.id, null));
    view = must(await app.boqs.get(w.technician.ctx, w.project.id, w.boq.boq.id));
    expect(view.pending.remove).toBeGreaterThan(0);
    const removed = must(await app.boqs.sync(w.technician.ctx, w.project.id, w.boq.boq.id));
    expect(removed.view.items.some((i) => i.calculationId === w.column.id)).toBe(false);
    // Le nœud n'est plus utilisé : il peut être supprimé.
    const element = must(await app.takeoff.get(w.technician.ctx, w.project.id)).nodes.find(
      (n) => n.id === w.nodes.element.id,
    )!;
    expect(
      (await app.takeoff.deleteNode(w.technician.ctx, w.project.id, element.id, element.version))
        .ok,
    ).toBe(true);
    // Mise à jour sans écart : aucune activité supplémentaire.
    const before = store.state.activity.filter((a) => a.type === 'boq.synced').length;
    const noop = must(await app.boqs.sync(w.technician.ctx, w.project.id, w.boq.boq.id));
    expect(noop).toMatchObject({ added: 0, updated: 0, removed: 0 });
    expect(store.state.activity.filter((a) => a.type === 'boq.synced')).toHaveLength(before);
  });

  it('un calcul sans résultat ne produit aucune ligne ; un nœud portant des lignes ne se supprime pas', async () => {
    const w = await boqWorld();
    expect(
      await app.takeoff.deleteNode(w.technician.ctx, w.project.id, w.nodes.lot.id, 1),
    ).toMatchObject({ ok: false, error: { reason: 'TAKEOFF_NODE_NOT_EMPTY' } });
    const empty = must(
      await app.calculations.create(w.engineer.ctx, w.project.id, w.study.id, {
        title: 'Longrines (à calculer)',
        engineId: 'btp.ground-beams',
      }),
    );
    must(await app.takeoff.assign(w.technician.ctx, w.project.id, empty.id, w.nodes.lot.id));
    const view = must(await app.boqs.get(w.technician.ctx, w.project.id, w.boq.boq.id));
    expect(view.pending).toEqual({ add: 0, update: 0, remove: 0 });
  });

  it('quantité retenue : justifiée, journalisée, affichée à côté de la quantité calculée', async () => {
    const w = await boqWorld();
    const item = w.boq.items.find((i) => i.designation === 'Semelles S1 — Béton armé')!;
    const update = (input: Parameters<typeof app.boqs.updateItem>[4], version = item.version) =>
      app.boqs.updateItem(w.technician.ctx, w.project.id, w.boq.boq.id, item.id, input, version);
    expect(await update({ override: { quantity: '3.5', justification: 'x' } })).toMatchObject({
      ok: false,
      error: { reason: 'BOQ_OVERRIDE_JUSTIFICATION_REQUIRED' },
    });
    expect(await update({ quantity: '3.5' })).toMatchObject({
      ok: false,
      error: { reason: 'BOQ_COMPUTED_READONLY' },
    });
    const overridden = must(
      await update({
        override: { quantity: '3.5', justification: 'Relevé contradictoire sur site' },
      }),
    );
    expect(formatDecimal(overridden.quantity)).toBe('3.456');
    expect(formatDecimal(overridden.overrideQuantity!)).toBe('3.5');
    expect(
      store.state.audit.find((a) => a.action === 'boq.quantity_overridden')?.metadata,
    ).toMatchObject({
      computed: '3.456',
      retained: '3.5',
      justification: 'Relevé contradictoire sur site',
    });
    // La quantité retenue survit à une mise à jour et prime pour le montant.
    must(await update({ unitPrice: '1000' }, overridden.version));
    must(
      await app.calculations.run(w.engineer.ctx, w.project.id, w.footing.id, {
        ...FOOTING,
        count: 7,
      }),
    );
    const synced = must(await app.boqs.sync(w.technician.ctx, w.project.id, w.boq.boq.id));
    const line = synced.view.items.find((i) => i.id === item.id)!;
    expect(formatDecimal(line.quantity)).toBe('4.032');
    expect(formatDecimal(line.overrideQuantity!)).toBe('3.5');
    expect(formatDecimal(line.amount!)).toBe('3500');
    // Retrait de la quantité retenue.
    const cleared = must(await update({ override: null }, line.version));
    expect(cleared.overrideQuantity).toBeNull();
    expect(cleared.overrideJustification).toBeNull();
    expect(await update({ override: null }, 99)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
  });

  it('lignes saisies : ajout, modification, suppression ; une ligne calculée ne se supprime pas', async () => {
    const w = await boqWorld();
    const boqId = w.boq.boq.id;
    const add = (input: Partial<Parameters<typeof app.boqs.addItem>[3]> = {}) =>
      app.boqs.addItem(w.technician.ctx, w.project.id, boqId, {
        nodeId: w.nodes.lot.id,
        designation: 'Installation de chantier',
        unit: 'ff',
        quantity: '1',
        unitPrice: '1500000',
        ...input,
      });
    expect(await add({ quantity: '0' })).toMatchObject({
      ok: false,
      error: { reason: 'BOQ_QUANTITY_INVALID' },
    });
    expect(await add({ designation: 'x' })).toMatchObject({
      ok: false,
      error: { reason: 'BOQ_DESIGNATION_INVALID' },
    });
    expect(await add({ unitPrice: '-3' })).toMatchObject({
      ok: false,
      error: { reason: 'BOQ_PRICE_INVALID' },
    });
    expect(await add({ nodeId: 'absent' })).toMatchObject({
      ok: false,
      error: { reason: 'TAKEOFF_NODE_NOT_FOUND' },
    });
    const manual = must(await add());
    expect(manual).toMatchObject({ origin: 'MANUAL', unit: 'ff', calculationId: null });
    let view = must(await app.boqs.get(w.technician.ctx, w.project.id, boqId));
    expect(formatDecimal(view.total.amount)).toBe('1500000');
    expect(view.total.unpriced).toBe(view.items.length - 1);
    // Une ligne saisie se corrige directement.
    expect(
      await app.boqs.updateItem(
        w.technician.ctx,
        w.project.id,
        boqId,
        manual.id,
        { override: { quantity: '2', justification: 'Essai' } },
        1,
      ),
    ).toMatchObject({ ok: false, error: { reason: 'BOQ_OVERRIDE_MANUAL' } });
    const edited = must(
      await app.boqs.updateItem(
        w.technician.ctx,
        w.project.id,
        boqId,
        manual.id,
        {
          designation: 'Installation et repli de chantier',
          quantity: '2',
          unit: 'ens',
          unitPrice: null,
        },
        1,
      ),
    );
    expect(edited).toMatchObject({
      designation: 'Installation et repli de chantier',
      unit: 'ens',
      unitPrice: null,
      version: 2,
    });
    view = must(await app.boqs.get(w.technician.ctx, w.project.id, boqId));
    expect(view.total.amount).toBe(0n);
    // Suppression.
    const computed = view.items.find((i) => i.origin === 'CALCULATION')!;
    expect(
      await app.boqs.deleteItem(
        w.technician.ctx,
        w.project.id,
        boqId,
        computed.id,
        computed.version,
      ),
    ).toMatchObject({
      ok: false,
      error: { reason: 'BOQ_COMPUTED_DELETE' },
    });
    expect(
      await app.boqs.deleteItem(w.technician.ctx, w.project.id, boqId, manual.id, 1),
    ).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(
      (await app.boqs.deleteItem(w.technician.ctx, w.project.id, boqId, manual.id, 2)).ok,
    ).toBe(true);
    expect(
      await app.boqs.deleteItem(w.technician.ctx, w.project.id, boqId, manual.id, 2),
    ).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    // Les synchronisations ne touchent pas aux lignes saisies.
    const kept = must(await add({ designation: 'Essais de laboratoire' }));
    must(await app.boqs.sync(w.technician.ctx, w.project.id, boqId));
    expect(
      must(await app.boqs.get(w.technician.ctx, w.project.id, boqId)).items.some(
        (i) => i.id === kept.id,
      ),
    ).toBe(true);
  });

  it('devise, titre, suppression, permissions et projet archivé', async () => {
    const w = await boqWorld();
    const boqId = w.boq.boq.id;
    const version = () => store.state.boqs.find((b) => b.id === boqId)!.version;
    expect(
      await app.boqs.update(w.technician.ctx, w.project.id, boqId, { currency: 'ABC' }, version()),
    ).toMatchObject({
      ok: false,
      error: { reason: 'CURRENCY_INVALID' },
    });
    expect(
      must(
        await app.boqs.update(
          w.technician.ctx,
          w.project.id,
          boqId,
          { title: 'DQE APD v2', currency: 'EUR' },
          version(),
        ),
      ).boq,
    ).toMatchObject({ title: 'DQE APD v2', currency: 'EUR' });
    const item = store.state.boqItems.find((i) => i.boqId === boqId)!;
    must(
      await app.boqs.updateItem(
        w.technician.ctx,
        w.project.id,
        boqId,
        item.id,
        { unitPrice: '10.5' },
        item.version,
      ),
    );
    expect(
      await app.boqs.update(w.technician.ctx, w.project.id, boqId, { currency: 'XOF' }, version()),
    ).toMatchObject({
      ok: false,
      error: { kind: 'CONFLICT', reason: 'BOQ_CURRENCY_LOCKED' },
    });
    expect(
      await app.boqs.update(w.technician.ctx, w.project.id, boqId, { title: 'X' }, 999),
    ).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(await app.boqs.create(w.technician.ctx, w.project.id, { title: 'x' })).toMatchObject({
      ok: false,
      error: { reason: 'BOQ_TITLE_INVALID' },
    });
    expect(
      await app.boqs.create(w.technician.ctx, w.project.id, { title: 'DQE', currency: 'ABC' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'CURRENCY_INVALID' },
    });
    // Lecture pour tout membre du projet ; écriture pour boq.manage.
    expect((await app.boqs.get(w.collaborator.ctx, w.project.id, boqId)).ok).toBe(true);
    expect((await app.boqs.materials(w.collaborator.ctx, w.project.id, boqId)).ok).toBe(true);
    expect(await app.boqs.sync(w.collaborator.ctx, w.project.id, boqId)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(await app.boqs.get(w.outsider.ctx, w.project.id, boqId)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.boqs.get(w.technician.ctx, w.project.id, 'absent')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    // Projet archivé : lecture seule.
    const project = store.state.projects.find((p) => p.id === w.project.id)!;
    must(await app.projects.archive(w.engineer.ctx, w.project.id, project.version));
    expect(await app.boqs.sync(w.technician.ctx, w.project.id, boqId)).toMatchObject({ ok: false });
    expect((await app.boqs.get(w.technician.ctx, w.project.id, boqId)).ok).toBe(true);
    const archived = store.state.projects.find((p) => p.id === w.project.id)!;
    must(await app.projects.unarchive(w.engineer.ctx, w.project.id, archived.version));
    // Suppression : version attendue, journalisée.
    expect(await app.boqs.remove(w.technician.ctx, w.project.id, boqId, 999)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect((await app.boqs.remove(w.technician.ctx, w.project.id, boqId, version())).ok).toBe(true);
    expect(store.state.boqItems.some((i) => i.boqId === boqId)).toBe(false);
    expect(store.state.audit.some((a) => a.action === 'boq.deleted')).toBe(true);
  });

  it('décomposition en matériaux : ciment cumulé entre calculs, avec le détail des contributeurs', async () => {
    const w = await boqWorld();
    const rows = must(await app.boqs.materials(w.technician.ctx, w.project.id, w.boq.boq.id));
    const cement = rows.find((r) => r.key === 'cement')!;
    expect(cement.additive).toBe(true);
    expect(cement.contributions.map((c) => c.calculationTitle)).toEqual([
      'Poteaux P1',
      'Semelles S1',
    ]);
    expect(cement.total).toBeCloseTo(
      cement.contributions.reduce((sum, c) => sum + c.value, 0),
      9,
    );
    expect(rows.some((r) => r.key === 'steelOrdered' && r.additive)).toBe(true);
  });
});

describe('bibliothèques de prix', () => {
  it('création, articles liés aux ouvrages, application à un quantitatif', async () => {
    const w = await boqWorld();
    const boqId = w.boq.boq.id;
    const library = must(
      await app.prices.create(w.engineer.ctx, {
        name: 'Prix Dakar 2026',
        currency: 'XOF',
        validFrom: '2026-01-01',
      }),
    );
    expect(library).toMatchObject({ itemCount: 0, validFrom: '2026-01-01' });
    expect(
      await app.prices.create(w.engineer.ctx, { name: 'Prix Dakar 2026', currency: 'XOF' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_LIBRARY_NAME_TAKEN' },
    });
    expect(
      await app.prices.create(w.technician.ctx, { name: 'Autre', currency: 'XOF' }),
    ).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(
      await app.prices.create(w.engineer.ctx, { name: 'Autre', currency: 'ABC' }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'CURRENCY_INVALID' },
    });
    const works = app.prices.works();
    expect(works).toContainEqual(
      expect.objectContaining({
        workKey: 'btp.footings.concrete',
        unit: 'm3',
        engineTitle: expect.any(String) as string,
      }),
    );
    expect(works.some((wk) => wk.workKey === 'btp.footings.cement')).toBe(false); // matériau
    const add = (input: Partial<Parameters<typeof app.prices.addItem>[2]>) =>
      app.prices.addItem(w.engineer.ctx, library.id, {
        code: 'GO-01',
        designation: 'Béton armé en fondation',
        unit: 'm3',
        price: '65000',
        workKey: 'btp.footings.concrete',
        ...input,
      });
    expect(await add({ workKey: 'btp.inconnu.x' })).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_WORK_UNKNOWN' },
    });
    expect(await add({ unit: 'm2' })).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_UNIT_MISMATCH' },
    });
    expect(await add({ price: 'abc' })).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_INVALID' },
    });
    expect(await add({ code: '' })).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_CODE_INVALID' },
    });
    const concrete = must(await add({}));
    expect(await add({ workKey: null })).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_CODE_TAKEN' },
    });
    expect(await add({ code: 'GO-02' })).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_WORK_TAKEN' },
    });
    must(
      await add({
        code: 'GO-02',
        designation: 'Béton de propreté',
        price: '45000',
        workKey: 'btp.footings.leanConcrete',
      }),
    );
    must(
      await add({
        code: 'DIV-01',
        designation: 'Essais',
        unit: 'ff',
        price: '250000',
        workKey: null,
      }),
    );
    expect(must(await app.prices.get(w.technician.ctx, library.id)).items).toHaveLength(3);

    // Une ligne déjà chiffrée garde son prix (sans remplacement).
    const lean = w.boq.items.find((i) => i.workKey === 'btp.footings.leanConcrete')!;
    must(
      await app.boqs.updateItem(
        w.technician.ctx,
        w.project.id,
        boqId,
        lean.id,
        { unitPrice: '40000' },
        lean.version,
      ),
    );
    const applied = must(
      await app.boqs.applyPrices(w.technician.ctx, w.project.id, boqId, {
        libraryId: library.id,
        overwrite: false,
      }),
    );
    expect(applied).toMatchObject({ applied: 1, kept: 1 });
    expect(applied.unmatched).toBe(w.boq.items.length - 2);
    const priced = applied.view.items.find((i) => i.workKey === 'btp.footings.concrete')!;
    expect(priced).toMatchObject({ priceItemId: concrete.id });
    expect(formatDecimal(priced.amount!)).toBe('224640'); // 3,456 × 65 000
    const replaced = must(
      await app.boqs.applyPrices(w.technician.ctx, w.project.id, boqId, {
        libraryId: library.id,
        overwrite: true,
      }),
    );
    expect(replaced.applied).toBe(2);
    expect(formatDecimal(replaced.view.items.find((i) => i.id === lean.id)!.unitPrice!)).toBe(
      '45000',
    );

    // Devise différente : refus explicite (aucune conversion).
    const euros = must(
      await app.prices.create(w.engineer.ctx, { name: 'Prix Europe', currency: 'EUR' }),
    );
    expect(
      await app.boqs.applyPrices(w.technician.ctx, w.project.id, boqId, {
        libraryId: euros.id,
        overwrite: false,
      }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_CURRENCY_MISMATCH' },
    });
    expect(
      await app.boqs.applyPrices(w.technician.ctx, w.project.id, boqId, {
        libraryId: 'absente',
        overwrite: false,
      }),
    ).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_LIBRARY_NOT_FOUND' },
    });

    // Modification d'un article ; devise verrouillée par les articles.
    const updatedItem = must(
      await app.prices.updateItem(w.engineer.ctx, library.id, concrete.id, { price: '66000.5' }, 1),
    );
    expect(formatDecimal(updatedItem.price)).toBe('66000.5');
    expect(
      await app.prices.updateItem(w.engineer.ctx, library.id, concrete.id, { price: '1' }, 1),
    ).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(
      await app.prices.updateItem(w.engineer.ctx, library.id, concrete.id, { code: 'GO-02' }, 2),
    ).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_CODE_TAKEN' },
    });
    expect(
      await app.prices.update(w.engineer.ctx, library.id, { currency: 'EUR' }, 1),
    ).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_CURRENCY_LOCKED' },
    });
    expect(
      await app.prices.update(w.engineer.ctx, library.id, { name: 'Prix Europe' }, 1),
    ).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_LIBRARY_NAME_TAKEN' },
    });
    const renamed = must(
      await app.prices.update(
        w.engineer.ctx,
        library.id,
        { name: 'Prix Dakar 2026 (révisés)', validFrom: null },
        1,
      ),
    );
    expect(renamed).toMatchObject({ version: 2, validFrom: null });

    // Suppression : les prix reportés restent sur les lignes, sans lien.
    expect(await app.prices.removeItem(w.engineer.ctx, library.id, concrete.id, 1)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect((await app.prices.remove(w.engineer.ctx, library.id, renamed.version)).ok).toBe(true);
    const view = must(await app.boqs.get(w.technician.ctx, w.project.id, boqId));
    const line = view.items.find((i) => i.id === priced.id)!;
    expect(line.priceItemId).toBeNull();
    expect(formatDecimal(line.unitPrice!)).toBe('65000');
    expect(await app.prices.get(w.engineer.ctx, library.id)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(
      store.state.audit.filter((a) => a.action.startsWith('price_library.')).length,
    ).toBeGreaterThan(3);
    expect(must(await app.prices.list(w.collaborator.ctx)).map((l) => l.name)).toEqual([
      'Prix Europe',
    ]);
  });

  it('suppression d’un article : la ligne garde son prix', async () => {
    const w = await boqWorld();
    const library = must(
      await app.prices.create(w.engineer.ctx, { name: 'Prix', currency: 'XOF' }),
    );
    const item = must(
      await app.prices.addItem(w.engineer.ctx, library.id, {
        code: 'P1',
        designation: 'Béton armé en élévation',
        unit: 'm3',
        price: '80000',
        workKey: 'btp.columns.concrete',
      }),
    );
    must(
      await app.boqs.applyPrices(w.technician.ctx, w.project.id, w.boq.boq.id, {
        libraryId: library.id,
        overwrite: false,
      }),
    );
    expect((await app.prices.removeItem(w.engineer.ctx, library.id, item.id, 1)).ok).toBe(true);
    const line = must(await app.boqs.get(w.technician.ctx, w.project.id, w.boq.boq.id)).items.find(
      (i) => i.workKey === 'btp.columns.concrete',
    )!;
    expect(line.priceItemId).toBeNull();
    expect(formatDecimal(line.unitPrice!)).toBe('80000');
    expect(
      await app.prices.addItem(w.engineer.ctx, 'absente', {
        code: 'X',
        designation: 'Article',
        unit: 'u',
        price: '1',
      }),
    ).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });
});

describe('tableau de bord BTP', () => {
  it('avancement, totaux par lot et alertes des projets accessibles', async () => {
    const w = await boqWorld();
    const unassigned = await w.calc('Poutres R+1', 'btp.beams', {
      width: m(0.2),
      dropHeight: m(0.4),
      length: m(5),
    });
    expect(unassigned).toBeDefined();
    const dashboard = must(await app.btpDashboard.get(w.technician.ctx));
    expect(dashboard.truncated).toBe(false);
    expect(dashboard.engines.total).toBe(BTP_ENGINES.length);
    expect(dashboard.engines.verified).toBe(0);
    expect(dashboard.engines.cases).toBeGreaterThan(0);
    expect(dashboard.projects).toHaveLength(1);
    const [summary] = dashboard.projects;
    expect(summary?.project.code).toBe('IMM-1');
    expect(summary?.calculations).toMatchObject({
      total: 3,
      assigned: 2,
      computed: 3,
      verified: 0,
    });
    expect(summary?.calculations.withWarnings).toBe(3); // paramètres « à vérifier »
    expect(summary?.takeoff).toEqual({ lots: 2, nodes: 4 });
    expect(summary?.boqs[0]).toMatchObject({ title: 'DQE APD', currency: 'XOF', outdated: false });
    expect(summary?.boqs[0]?.lots.map((l) => l.code)).toEqual(['1', '2']);
    // Un collaborateur sans projet BTP accessible : tableau vide ; un externe : aucun projet.
    expect(must(await app.btpDashboard.get(w.outsider.ctx)).projects).toEqual([]);
  });
});

describe('cas d’erreur', () => {
  it('quantitatif absent, ligne absente, saisies invalides', async () => {
    const w = await boqWorld();
    const ctx = w.technician.ctx;
    const pid = w.project.id;
    const missing = 'absent';
    for (const call of [
      app.boqs.update(ctx, pid, missing, { title: 'Titre' }, 1),
      app.boqs.remove(ctx, pid, missing, 1),
      app.boqs.sync(ctx, pid, missing),
      app.boqs.addItem(ctx, pid, missing, {
        nodeId: w.nodes.lot.id,
        designation: 'Ligne',
        unit: 'u',
        quantity: '1',
      }),
      app.boqs.updateItem(ctx, pid, missing, missing, { unitPrice: '1' }, 1),
      app.boqs.deleteItem(ctx, pid, missing, missing, 1),
      app.boqs.applyPrices(ctx, pid, missing, { libraryId: missing, overwrite: false }),
      app.boqs.materials(ctx, pid, missing),
    ]) {
      expect(await call).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });
    }
    const boqId = w.boq.boq.id;
    expect(
      await app.boqs.updateItem(ctx, pid, boqId, missing, { unitPrice: '1' }, 1),
    ).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });
    const version = () => store.state.boqs.find((b) => b.id === boqId)!.version;
    expect(await app.boqs.update(ctx, pid, boqId, { title: 'x' }, version())).toMatchObject({
      ok: false,
      error: { reason: 'BOQ_TITLE_INVALID' },
    });
    // Même devise : aucun contrôle de prix.
    expect((await app.boqs.update(ctx, pid, boqId, { currency: 'XOF' }, version())).ok).toBe(true);
    const computed = store.state.boqItems.find((i) => i.boqId === boqId)!;
    expect(
      await app.boqs.updateItem(
        ctx,
        pid,
        boqId,
        computed.id,
        { unitPrice: '1,5' },
        computed.version,
      ),
    ).toMatchObject({ ok: false, error: { reason: 'BOQ_PRICE_INVALID' } });
    expect(
      await app.boqs.updateItem(
        ctx,
        pid,
        boqId,
        computed.id,
        { override: { quantity: 'x', justification: 'Relevé' } },
        computed.version,
      ),
    ).toMatchObject({ ok: false, error: { reason: 'BOQ_OVERRIDE_INVALID' } });
    // Ligne saisie sans prix, puis corrections invalides.
    const manual = must(
      await app.boqs.addItem(ctx, pid, boqId, {
        nodeId: w.nodes.lot.id,
        designation: 'Essais',
        unit: 'ff',
        quantity: '1',
        unitPrice: null,
      }),
    );
    expect(manual.unitPrice).toBeNull();
    expect(
      await app.boqs.updateItem(ctx, pid, boqId, manual.id, { designation: 'x' }, 1),
    ).toMatchObject({ ok: false, error: { reason: 'BOQ_DESIGNATION_INVALID' } });
    expect(
      await app.boqs.updateItem(ctx, pid, boqId, manual.id, { quantity: '0' }, 1),
    ).toMatchObject({ ok: false, error: { reason: 'BOQ_QUANTITY_INVALID' } });
    // Deux lignes saisies de même désignation : ordre de création.
    store.now = new Date('2026-10-08T09:00:00.000Z');
    const twin = must(
      await app.boqs.addItem(ctx, pid, boqId, {
        nodeId: w.nodes.lot.id,
        designation: 'Essais',
        unit: 'ff',
        quantity: '2',
      }),
    );
    const ids = must(await app.boqs.get(ctx, pid, boqId)).items.map((i) => i.id);
    expect(ids.indexOf(manual.id)).toBeLessThan(ids.indexOf(twin.id));
    // Devise explicite à la création.
    expect(
      must(await app.boqs.create(ctx, pid, { title: 'DQE en euros', currency: 'EUR' })).currency,
    ).toBe('EUR');
    // Devise inconnue en base : incohérence interne, jamais présentée comme un résultat.
    store.state.boqs = store.state.boqs.map((b) =>
      b.id === boqId ? { ...b, currency: 'ABC' } : b,
    );
    await expect(app.boqs.get(ctx, pid, boqId)).rejects.toThrow('Devise inconnue');
  });

  it('limites de l’avant-métré et nœuds absents', async () => {
    const w = await world();
    const { lot } = await structure(w);
    const ctx = w.technician.ctx;
    expect(
      await app.takeoff.updateNode(ctx, w.project.id, 'absent', { title: 'Titre' }, 1),
    ).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });
    expect(
      await app.takeoff.updateNode(ctx, w.project.id, lot.id, { code: 'a b' }, 1),
    ).toMatchObject({ ok: false, error: { reason: 'TAKEOFF_CODE_INVALID' } });
    expect(
      await app.takeoff.updateNode(ctx, w.project.id, lot.id, { title: 'x' }, 1),
    ).toMatchObject({ ok: false, error: { reason: 'TAKEOFF_TITLE_INVALID' } });
    for (let i = 0; i < 500; i += 1) {
      store.state.takeoffNodes.push({ ...lot, id: `n-${String(i)}`, code: `X${String(i)}` });
    }
    expect(
      await app.takeoff.createNode(ctx, w.project.id, {
        parentId: null,
        kind: 'LOT',
        code: 'Z',
        title: 'Lot Z',
      }),
    ).toMatchObject({ ok: false, error: { reason: 'TAKEOFF_TOO_MANY_NODES' } });
  });

  it('bibliothèques : absentes, versions dépassées, saisies invalides', async () => {
    const w = await world();
    const ctx = w.engineer.ctx;
    expect(await app.prices.create(ctx, { name: 'x', currency: 'XOF' })).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_LIBRARY_NAME_INVALID' },
    });
    const library = must(await app.prices.create(ctx, { name: 'Prix 2026', currency: 'XOF' }));
    expect(await app.prices.update(ctx, 'absente', { name: 'Prix' }, 1)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.prices.update(ctx, library.id, { name: 'Prix' }, 9)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(await app.prices.update(ctx, library.id, { name: 'x' }, 1)).toMatchObject({
      ok: false,
      error: { reason: 'PRICE_LIBRARY_NAME_INVALID' },
    });
    expect(await app.prices.update(ctx, library.id, { currency: 'ABC' }, 1)).toMatchObject({
      ok: false,
      error: { reason: 'CURRENCY_INVALID' },
    });
    // Bibliothèque vide : sa devise peut changer.
    expect(must(await app.prices.update(ctx, library.id, { currency: 'EUR' }, 1)).currency).toBe(
      'EUR',
    );
    expect(await app.prices.remove(ctx, 'absente', 1)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.prices.remove(ctx, library.id, 1)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(
      await app.prices.addItem(ctx, library.id, {
        code: 'A',
        designation: 'x',
        unit: 'u',
        price: '1',
      }),
    ).toMatchObject({ ok: false, error: { reason: 'BOQ_DESIGNATION_INVALID' } });
    const item = must(
      await app.prices.addItem(ctx, library.id, {
        code: 'A',
        designation: 'Article',
        unit: 'u',
        price: '1',
      }),
    );
    expect(await app.prices.updateItem(ctx, library.id, 'absent', { price: '2' }, 1)).toMatchObject(
      { ok: false, error: { kind: 'NOT_FOUND' } },
    );
    expect(await app.prices.updateItem(ctx, library.id, item.id, { price: '-2' }, 1)).toMatchObject(
      { ok: false, error: { reason: 'PRICE_INVALID' } },
    );
    expect(
      must(
        await app.prices.updateItem(
          ctx,
          library.id,
          item.id,
          { workKey: null, designation: 'Article modifié' },
          1,
        ),
      ),
    ).toMatchObject({ designation: 'Article modifié', workKey: null });
    expect(await app.prices.removeItem(ctx, library.id, 'absent', 1)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.prices.get(ctx, 'absente')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });

  it('tableau de bord du propriétaire : tous les projets BTP de l’organisation', async () => {
    const w = await boqWorld();
    must(
      await app.projects.create(w.engineer.ctx, {
        code: 'EL-9',
        name: 'Électricité seule',
        disciplines: ['ELEC'],
      }),
    );
    const dashboard = must(await app.btpDashboard.get(w.owner));
    expect(dashboard.projects.map((p) => p.project.code)).toEqual(['IMM-1']);
  });
});
