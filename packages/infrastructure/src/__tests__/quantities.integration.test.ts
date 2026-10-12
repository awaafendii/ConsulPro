import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApplication, type Application, type OrgContext } from '@consulpro/application';
import { createDatabase, type Database } from '@consulpro/db';
import { formatDecimal, type OrgRole } from '@consulpro/domain';
import { adminQuery, unique } from '@consulpro/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEngineRegistry } from '../index';
import { MemoryMailer } from '../mail/smtp-mailer';
import { createUnitOfWork } from '../persistence/unit-of-work';
import { loadStandard, setPlatformAdmin } from '../standards/load-standard';
import { sha256Hasher, systemClock, tokenService, uuidV7Generator } from '../system/services';
import { createUser, ctxOf, database, type TestUser } from './helpers';

/*
 * Avant-métré, quantitatifs et prix sur PostgreSQL : dépôts Prisma (décimales exactes,
 * verrou), puis garde-fous de la base (contrôles, déclencheurs, RLS, projet archivé).
 */

const BTP: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../standards/seeds/btp/usages-metre-1.json', import.meta.url)),
    'utf8',
  ),
);

let db: Database;
let adminDb: Database;
let app: Application;
let owner: OrgContext;
let stranger: OrgContext;
const people: Record<string, { user: TestUser; ctx: OrgContext }> = {};
let projectId: string;
let studyId: string;

const must = <T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } | string },
) => {
  if (!result.ok) {
    throw new Error(typeof result.error === 'string' ? result.error : result.error.message);
  }
  return result.value;
};
const as = (name: string) => {
  const p = people[name];
  if (!p) throw new Error(name);
  return p.ctx;
};
const m = (value: number) => ({ value, unit: 'm' });
const FOOTING = { type: 'ISOLATED', length: m(1.2), width: m(1.2), height: m(0.4), count: 6 };

/** Transaction brute avec un contexte RLS donné, SANS les contrôles applicatifs. */
async function raw<T>(
  who: OrgContext,
  fn: (tx: Parameters<Parameters<Database['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.organization_id', ${who.organization.id}, true),
                              set_config('app.user_id', ${who.actor.userId}, true),
                              set_config('app.user_email', ${who.actor.email}, true)`;
    return fn(tx);
  });
}

async function join(prefix: string, role: OrgRole) {
  const user = await createUser(prefix);
  await adminQuery(
    database().adminUrl,
    `INSERT INTO memberships (id, organization_id, user_id, role, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now())`,
    [owner.organization.id, user.id, role],
  );
  people[prefix] = {
    user,
    ctx: must(await app.organizations.resolveContext(ctxOf(user), owner.organization.slug)),
  };
}

async function organization(prefix: string) {
  const founder = await createUser(prefix);
  const slug = unique(prefix);
  must(await app.organizations.create(ctxOf(founder), { name: `BET ${slug}`, slug }));
  return must(await app.organizations.resolveContext(ctxOf(founder), slug));
}

async function computedFooting(title: string, inputs: Record<string, unknown> = FOOTING) {
  const calc = must(
    await app.calculations.create(as('ingenieur'), projectId, studyId, {
      title,
      engineId: 'btp.footings',
    }),
  );
  must(await app.calculations.run(as('ingenieur'), projectId, calc.id, inputs));
  return calc;
}

beforeAll(async () => {
  db = createDatabase(database().appUrl, { max: 4 });
  adminDb = createDatabase(database().adminUrl, { max: 2 });
  app = createApplication({
    uow: createUnitOfWork(db),
    mailer: new MemoryMailer(),
    tokens: tokenService,
    clock: systemClock,
    ids: uuidV7Generator,
    hasher: sha256Hasher,
    engines: createEngineRegistry({ demoEngines: false }),
    defaultTimeZone: 'Africa/Abidjan',
    appUrl: 'http://localhost:3000',
  });
  // Référentiel BTP publié avant la création du projet : retenu par défaut.
  const platform = await createUser('plateforme-q');
  must(await setPlatformAdmin(adminDb, platform.email, true));
  const loaded = await loadStandard(
    adminDb,
    { ...(BTP as object), version: { label: unique('q') } },
    { publishAs: platform.email },
  );
  must(loaded);

  owner = await organization('orgq');
  stranger = await organization('autreq');
  await join('ingenieur', 'ENGINEER');
  await join('technicien', 'TECHNICIAN');
  await join('lecteur', 'VIEWER');
  const project = must(
    await app.projects.create(as('ingenieur'), {
      code: unique('Q')
        .replaceAll(/[^A-Za-z0-9]/g, '')
        .slice(-16)
        .toUpperCase(),
      name: 'Immeuble — quantitatifs',
      disciplines: ['BTP'],
    }),
  );
  projectId = project.id;
  for (const [name, role] of [
    ['technicien', 'TECHNICIAN'],
    ['lecteur', 'VIEWER'],
  ] as const) {
    must(
      await app.projectMembers.add(as('ingenieur'), projectId, {
        userId: people[name]!.user.id,
        role,
      }),
    );
  }
  studyId = must(
    await app.studies.create(as('ingenieur'), projectId, {
      discipline: 'BTP',
      title: 'Fondations',
    }),
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
  await adminDb.$disconnect();
});

describe('parcours complet sur PostgreSQL', () => {
  it('avant-métré → quantitatif → prix → recalcul → mise à jour, en décimales exactes', async () => {
    const tech = as('technicien');
    const lot = must(
      await app.takeoff.createNode(tech, projectId, {
        parentId: null,
        kind: 'LOT',
        code: '1',
        title: 'Fondations',
      }),
    );
    const footing = await computedFooting('Semelles S1');
    must(await app.takeoff.assign(tech, projectId, footing.id, lot.id));
    // Déplacement puis retour : l'auteur du rattachement suit l'utilisateur courant (RLS).
    must(await app.takeoff.assign(as('ingenieur'), projectId, footing.id, lot.id));

    const created = must(await app.boqs.create(tech, projectId, { title: 'DQE fondations' }));
    const concrete = created.items.find((i) => i.workKey === 'btp.footings.concrete')!;
    expect(formatDecimal(concrete.quantity)).toBe('3.456');
    expect(concrete.source).toMatchObject({ revisionNumber: 1, superseded: false });
    expect(created.boq.syncedAt).not.toBeNull();

    // Bibliothèque de prix : prix à 4 décimales, conservé exactement.
    const library = must(
      await app.prices.create(owner, {
        name: unique('Prix'),
        currency: 'XOF',
        validFrom: '2026-03-01',
      }),
    );
    expect(library.validFrom).toBe('2026-03-01');
    must(
      await app.prices.addItem(owner, library.id, {
        code: 'GO-01',
        designation: 'Béton armé en fondation',
        unit: 'm3',
        price: '65000.1234',
        workKey: 'btp.footings.concrete',
      }),
    );
    expect(
      await app.prices.addItem(owner, library.id, {
        code: 'GO-02',
        designation: 'Doublon',
        unit: 'm3',
        price: '1',
        workKey: 'btp.footings.concrete',
      }),
    ).toMatchObject({ ok: false, error: { reason: 'PRICE_WORK_TAKEN' } });
    const applied = must(
      await app.boqs.applyPrices(tech, projectId, created.boq.id, {
        libraryId: library.id,
        overwrite: false,
      }),
    );
    const priced = applied.view.items.find((i) => i.id === concrete.id)!;
    expect(formatDecimal(priced.unitPrice!)).toBe('65000.1234');
    // 3,456 × 65 000,1234 = 224 640,4264704 → 224 640 F (XOF : sans décimale).
    expect(formatDecimal(priced.amount!)).toBe('224640');

    // Quantité retenue justifiée ; ligne saisie.
    must(
      await app.boqs.updateItem(
        tech,
        projectId,
        created.boq.id,
        concrete.id,
        { override: { quantity: '3.5', justification: 'Relevé contradictoire' } },
        priced.version,
      ),
    );
    const manual = must(
      await app.boqs.addItem(tech, projectId, created.boq.id, {
        nodeId: lot.id,
        designation: 'Installation de chantier',
        unit: 'ff',
        quantity: '1',
        unitPrice: '1500000',
      }),
    );
    expect(formatDecimal(manual.amount!)).toBe('1500000');

    // Recalcul : la ligne est signalée, puis mise à jour ; prix et quantité retenue restent.
    must(
      await app.calculations.run(as('ingenieur'), projectId, footing.id, { ...FOOTING, count: 8 }),
    );
    const stale = must(await app.boqs.get(tech, projectId, created.boq.id));
    expect(stale.pending.update).toBeGreaterThan(0);
    const synced = must(await app.boqs.sync(tech, projectId, created.boq.id));
    const line = synced.view.items.find((i) => i.id === concrete.id)!;
    expect(formatDecimal(line.quantity)).toBe('4.608');
    expect(formatDecimal(line.overrideQuantity!)).toBe('3.5');
    expect(line.source).toMatchObject({ revisionNumber: 2, superseded: false });
    // 3,5 × 65 000,1234 = 227 500,4319 → 227 500 ; + 1 500 000.
    expect(formatDecimal(synced.view.total.amount)).toBe('1727500');
    expect(synced.view.items.some((i) => i.id === manual.id)).toBe(true);

    const materials = must(await app.boqs.materials(as('lecteur'), projectId, created.boq.id));
    expect(materials.find((r) => r.key === 'cement')?.contributions).toHaveLength(1);

    // Tableau de bord : un projet, un quantitatif à jour.
    const dashboard = must(await app.btpDashboard.get(tech));
    const summary = dashboard.projects.find((p) => p.project.id === projectId)!;
    expect(summary.boqs[0]).toMatchObject({ outdated: false });
    expect(formatDecimal(summary.boqs[0]!.lots[0]!.subtotal.amount)).toBe('1727500');

    // Suppression de la bibliothèque : le prix reste, le lien disparaît (ON DELETE SET NULL).
    const fresh = must(await app.prices.get(owner, library.id)).library;
    must(await app.prices.remove(owner, library.id, fresh.version));
    const after = must(await app.boqs.get(tech, projectId, created.boq.id));
    const kept = after.items.find((i) => i.id === concrete.id)!;
    expect(kept.priceItemId).toBeNull();
    expect(formatDecimal(kept.unitPrice!)).toBe('65000.1234');
  });

  it('isolation : une autre organisation ne voit ni avant-métré, ni quantitatif, ni prix', async () => {
    const node = must(
      await app.takeoff.createNode(as('technicien'), projectId, {
        parentId: null,
        kind: 'LOT',
        code: 'ISO',
        title: 'Lot isolé',
      }),
    );
    const boq = must(await app.boqs.create(as('technicien'), projectId, { title: 'DQE isolé' }));
    const library = must(await app.prices.create(owner, { name: unique('Iso'), currency: 'XOF' }));
    const counts = await raw(stranger, async (tx) => ({
      nodes: await tx.takeoffNode.count({ where: { id: node.id } }),
      boqs: await tx.billOfQuantities.count({ where: { id: boq.boq.id } }),
      items: await tx.boqItem.count({ where: { boqId: boq.boq.id } }),
      libraries: await tx.priceLibrary.count({ where: { id: library.id } }),
    }));
    expect(counts).toEqual({ nodes: 0, boqs: 0, items: 0, libraries: 0 });
    // Écriture vers une autre organisation : refusée par la politique.
    await expect(
      raw(stranger, (tx) =>
        tx.priceLibrary.create({
          data: {
            id: crypto.randomUUID(),
            organizationId: owner.organization.id,
            name: 'Intrusion',
            currency: 'XOF',
            createdById: stranger.actor.userId,
          },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
    expect(await app.boqs.get(stranger, projectId, boq.boq.id)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });
});

describe('garde-fous de la base', () => {
  it('imbrication et nature des nœuds ; code unique parmi les frères, y compris à la racine', async () => {
    const who = as('technicien');
    const insert = (kind: string, parentId: string | null, code: string) =>
      raw(
        who,
        (tx) =>
          tx.$executeRaw`INSERT INTO takeoff_nodes (id, organization_id, project_id, parent_id, kind, code, title, updated_at)
          VALUES (gen_random_uuid(), ${who.organization.id}::uuid, ${projectId}::uuid, ${parentId}::uuid,
                  ${kind}::"TakeoffNodeKind", ${code}, 'Nœud brut', now())`,
      );
    await expect(insert('LEVEL', null, 'N1')).rejects.toThrow(/takeoff_nodes_root_check/);
    const lot = must(
      await app.takeoff.createNode(who, projectId, {
        parentId: null,
        kind: 'LOT',
        code: 'G',
        title: 'Lot G',
      }),
    );
    const element = must(
      await app.takeoff.createNode(who, projectId, {
        parentId: lot.id,
        kind: 'ELEMENT',
        code: 'G1',
        title: 'Ouvrage',
      }),
    );
    await expect(insert('LEVEL', element.id, 'X')).rejects.toThrow(/Imbrication invalide/);
    await expect(insert('LOT', null, 'G')).rejects.toThrow(/takeoff_nodes_sibling_code_key/);
    await expect(
      raw(
        who,
        (tx) => tx.$executeRaw`UPDATE takeoff_nodes SET kind = 'LEVEL' WHERE id = ${lot.id}::uuid`,
      ),
    ).rejects.toThrow(/ne change ni de nature ni de parent|takeoff_nodes_root_check/);
    await expect(insert('LOT', null, 'a b')).rejects.toThrow(/takeoff_nodes_code_check/);
  });

  it('lignes : origine cohérente, quantité retenue justifiée, montants positifs, calcul du projet', async () => {
    const who = as('technicien');
    const lot = must(
      await app.takeoff.createNode(who, projectId, {
        parentId: null,
        kind: 'LOT',
        code: 'H',
        title: 'Lot H',
      }),
    );
    const boq = must(await app.boqs.create(who, projectId, { title: 'DQE garde-fous' }));
    const item = must(
      await app.boqs.addItem(who, projectId, boq.boq.id, {
        nodeId: lot.id,
        designation: 'Ligne saisie',
        unit: 'u',
        quantity: '2',
      }),
    );
    const update = (set: string) =>
      raw(who, (tx) =>
        tx.$executeRawUnsafe(`UPDATE boq_items SET ${set} WHERE id = $1::uuid`, item.id),
      );
    await expect(update(`override_quantity = 1, override_justification = 'Essai'`)).rejects.toThrow(
      /boq_items_origin_check/,
    );
    await expect(update(`unit_price = -1`)).rejects.toThrow(/boq_items_amounts_check/);
    await expect(update(`unit = 'kN'`)).rejects.toThrow(/boq_items_unit_check/);
    await expect(update(`origin = 'CALCULATION'`)).rejects.toThrow(/boq_items_origin_check/);

    // Ligne calculée sans justification de la quantité retenue.
    const footing = await computedFooting('Semelles garde-fous');
    must(await app.takeoff.assign(who, projectId, footing.id, lot.id));
    const synced = must(await app.boqs.sync(who, projectId, boq.boq.id));
    const computed = synced.view.items.find((i) => i.origin === 'CALCULATION')!;
    await expect(
      raw(
        who,
        (tx) =>
          tx.$executeRaw`UPDATE boq_items SET override_quantity = 1 WHERE id = ${computed.id}::uuid`,
      ),
    ).rejects.toThrow(/boq_items_override_check/);
    // Une ligne ne peut citer qu'un calcul du projet, et la révision de ce calcul.
    const otherProject = must(
      await app.projects.create(as('ingenieur'), {
        code: unique('O')
          .replaceAll(/[^A-Za-z0-9]/g, '')
          .slice(-16)
          .toUpperCase(),
        name: 'Autre projet',
        disciplines: ['BTP'],
      }),
    );
    const otherStudy = must(
      await app.studies.create(as('ingenieur'), otherProject.id, {
        discipline: 'BTP',
        title: 'Autre',
      }),
    );
    const otherCalc = must(
      await app.calculations.create(as('ingenieur'), otherProject.id, otherStudy.id, {
        title: 'Semelles ailleurs',
        engineId: 'btp.footings',
      }),
    );
    await expect(
      raw(
        as('ingenieur'),
        (tx) =>
          tx.$executeRaw`UPDATE boq_items SET calculation_id = ${otherCalc.id}::uuid WHERE id = ${computed.id}::uuid`,
      ),
    ).rejects.toThrow(/Calcul étranger au projet|boq_items_source_revision_id_calculation_id_fkey/);
  });

  it('un article de prix d’une autre organisation ne peut pas chiffrer une ligne', async () => {
    const foreign = must(
      await app.prices.create(stranger, { name: unique('Ailleurs'), currency: 'XOF' }),
    );
    const foreignItem = must(
      await app.prices.addItem(stranger, foreign.id, {
        code: 'X',
        designation: 'Article étranger',
        unit: 'u',
        price: '1',
      }),
    );
    const who = as('technicien');
    const lot = must(
      await app.takeoff.createNode(who, projectId, {
        parentId: null,
        kind: 'LOT',
        code: 'K',
        title: 'Lot K',
      }),
    );
    const boq = must(await app.boqs.create(who, projectId, { title: 'DQE prix étranger' }));
    const item = must(
      await app.boqs.addItem(who, projectId, boq.boq.id, {
        nodeId: lot.id,
        designation: 'Ligne',
        unit: 'u',
        quantity: '1',
      }),
    );
    await expect(
      raw(
        who,
        (tx) =>
          tx.$executeRaw`UPDATE boq_items SET price_item_id = ${foreignItem.id}::uuid WHERE id = ${item.id}::uuid`,
      ),
    ).rejects.toThrow(/étranger à l.organisation/);
  });

  it('projet archivé : avant-métré et quantitatifs en lecture seule, même en écrivant en base', async () => {
    const who = as('ingenieur');
    const project = must(
      await app.projects.create(who, {
        code: unique('A')
          .replaceAll(/[^A-Za-z0-9]/g, '')
          .slice(-16)
          .toUpperCase(),
        name: 'Projet archivé',
        disciplines: ['BTP'],
      }),
    );
    const lot = must(
      await app.takeoff.createNode(who, project.id, {
        parentId: null,
        kind: 'LOT',
        code: '1',
        title: 'Lot',
      }),
    );
    const boq = must(await app.boqs.create(who, project.id, { title: 'DQE archivé' }));
    must(await app.projects.archive(who, project.id, 1));
    expect(await app.boqs.sync(who, project.id, boq.boq.id)).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_ARCHIVED' },
    });
    await expect(
      raw(
        who,
        (tx) =>
          tx.$executeRaw`UPDATE takeoff_nodes SET title = 'Modifié' WHERE id = ${lot.id}::uuid`,
      ),
    ).rejects.toThrow(/Projet archivé/);
    await expect(
      raw(
        who,
        (tx) => tx.$executeRaw`DELETE FROM bills_of_quantities WHERE id = ${boq.boq.id}::uuid`,
      ),
    ).rejects.toThrow(/Projet archivé/);
    expect((await app.boqs.get(who, project.id, boq.boq.id)).ok).toBe(true);
  });
});
