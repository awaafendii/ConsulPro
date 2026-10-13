import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createApplication, type Application, type OrgContext } from '@consulpro/application';
import { createDatabase, type Database } from '@consulpro/db';
import { adminQuery, unique } from '@consulpro/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEngineRegistry } from '../index';
import { MemoryMailer } from '../mail/smtp-mailer';
import { createUnitOfWork } from '../persistence/unit-of-work';
import { loadStandard, setPlatformAdmin } from '../standards/load-standard';
import { sha256Hasher, systemClock, tokenService, uuidV7Generator } from '../system/services';
import { createUser, ctxOf, database } from './helpers';

/*
 * Électricité (Phase 5) en base réelle : entrée « jeu de données » tracée en ajout seul,
 * obsolescence calculée par la base, garde inter-projets, isolation ; paramètres d'organisation.
 */

const seed = (file: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../standards/seeds/elec/${file}`, import.meta.url)),
      'utf8',
    ),
  );

let db: Database;
let adminDb: Database;
let app: Application;
let owner: OrgContext;
let stranger: OrgContext;

const must = <T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } | string },
) => {
  if (!result.ok) {
    throw new Error(typeof result.error === 'string' ? result.error : result.error.message);
  }
  return result.value;
};

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

async function organization(prefix: string) {
  const founder = await createUser(prefix);
  const slug = unique(prefix);
  must(await app.organizations.create(ctxOf(founder), { name: `BET ${slug}`, slug }));
  return must(await app.organizations.resolveContext(ctxOf(founder), slug));
}

const code = (prefix: string) =>
  unique(prefix)
    .replaceAll(/[^A-Za-z0-9]/g, '')
    .slice(-16)
    .toUpperCase();

const kw = (value: number) => ({ value, unit: 'kW' });
const TREE = [
  { code: 'TGBT', type: 'BOARD' },
  { code: 'D1', parent: 'TGBT', type: 'LOAD', power: kw(2), count: 10, ku: 0.75, cosPhi: 0.9 },
  { code: 'D2', parent: 'TGBT', type: 'LOAD', power: kw(3), cosPhi: 0.8 },
];

/** Projet électrique avec un arbre de tableaux et un bilan de puissance qui le lit. */
async function balanceWorld() {
  const project = must(
    await app.projects.create(owner, {
      code: code('EL'),
      name: 'Clinique',
      disciplines: ['ELEC'],
    }),
  );
  const study = must(
    await app.studies.create(owner, project.id, { discipline: 'ELEC', title: 'Bilan' }),
  );
  const dataset = must(
    await app.datasets.create(owner, project.id, { kind: 'ELEC_BOARD_TREE', title: 'Tableaux' }),
  );
  must(await app.datasets.saveRevision(owner, project.id, dataset.id, { rows: TREE }, 1));
  const calc = must(
    await app.calculations.create(owner, project.id, study.id, {
      title: 'Bilan général',
      engineId: 'elec.power-balance',
    }),
  );
  const run = () =>
    app.calculations.run(owner, project.id, calc.id, {
      tree: { fromDataset: dataset.id },
      system: 'TRI',
      voltage: { value: 400, unit: 'V' },
    });
  return { project, study, dataset, calc, run };
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
    defaultTimeZone: 'Africa/Conakry',
    appUrl: 'http://localhost:3000',
  });
  // Référentiels électriques publiés (rechargement sans effet s'ils le sont déjà).
  const platform = await createUser('plateforme-e');
  must(await setPlatformAdmin(adminDb, platform.email, true));
  for (const file of ['nfc15-100-2002.json', 'ute-c15-105-2003.json']) {
    must(await loadStandard(adminDb, seed(file), { publishAs: platform.email }));
  }
  owner = await organization('orge');
  stranger = await organization('autree');
});

afterAll(async () => {
  await db.$disconnect();
  await adminDb.$disconnect();
});

describe('entrée « jeu de données » en base', () => {
  it('révision lue tracée ; une nouvelle révision du jeu rend le calcul obsolète', async () => {
    const w = await balanceWorld();
    const first = must(await w.run());
    expect(first.revision.resultStatus).toBe('OK_WITH_WARNINGS');
    expect(first.datasets).toEqual([
      expect.objectContaining({
        input: 'tree',
        datasetId: w.dataset.id,
        datasetRevisionNumber: 1,
        rowCount: 3,
        obsolete: false,
      }),
    ]);
    expect(first.view.outputs.find((o) => o.key === 'absorbedPower')?.value).toBeCloseTo(16.2, 9);

    must(
      await app.datasets.saveRevision(
        owner,
        w.project.id,
        w.dataset.id,
        { rows: [...TREE, { code: 'D3', parent: 'TGBT', type: 'LOAD', power: kw(1), cosPhi: 1 }] },
        2,
      ),
    );
    expect(must(await app.calculations.get(owner, w.project.id, w.calc.id)).obsolete).toBe(true);
    const second = must(await w.run());
    expect(second.datasets[0]).toMatchObject({ datasetRevisionNumber: 2, rowCount: 4 });
    expect(must(await app.calculations.get(owner, w.project.id, w.calc.id)).obsolete).toBe(false);
  });

  it('liens en ajout seul : ni modification ni suppression, même par le propriétaire', async () => {
    const w = await balanceWorld();
    must(await w.run());
    await expect(
      raw(owner, (tx) => tx.$executeRaw`UPDATE calculation_dataset_links SET input = 'autre'`),
    ).rejects.toThrow();
    await expect(
      raw(owner, (tx) => tx.$executeRaw`DELETE FROM calculation_dataset_links`),
    ).rejects.toThrow();
    await expect(
      adminQuery(
        database().adminUrl,
        `UPDATE calculation_dataset_links SET input = 'autre' WHERE project_id = $1`,
        [w.project.id],
      ),
    ).rejects.toThrow(/ajout seul/);
  });

  it('un lien vers le jeu d’un autre projet est refusé par la base', async () => {
    const a = await balanceWorld();
    const b = await balanceWorld();
    const revision = must(await a.run()).revision;
    const foreign = await raw(owner, (tx) =>
      tx.datasetRevision.findFirstOrThrow({ where: { datasetId: b.dataset.id } }),
    );
    await expect(
      raw(
        owner,
        (tx) => tx.$executeRaw`INSERT INTO calculation_dataset_links
          (id, organization_id, project_id, revision_id, input, dataset_id, dataset_revision_id)
          VALUES (gen_random_uuid(), ${owner.organization.id}::uuid, ${a.project.id}::uuid,
                  ${revision.id}::uuid, 'autre', ${b.dataset.id}::uuid, ${foreign.id}::uuid)`,
      ),
    ).rejects.toThrow(/étranger au projet/);
  });

  it('une autre organisation ne voit aucun lien', async () => {
    const w = await balanceWorld();
    must(await w.run());
    const mine = await raw(owner, (tx) =>
      tx.calculationDatasetLink.count({ where: { projectId: w.project.id } }),
    );
    expect(mine).toBe(1);
    const theirs = await raw(stranger, (tx) =>
      tx.calculationDatasetLink.count({ where: { projectId: w.project.id } }),
    );
    expect(theirs).toBe(0);
  });
});

describe('paramètres d’organisation (décision Q3)', () => {
  it('Guinée et GNF enregistrés, version incrémentée, audit ; devise reprise par les quantitatifs', async () => {
    const org = await organization('orgg');
    const current = must(await app.organizations.current(org));
    expect(current).toMatchObject({ currency: 'XOF', country: null, version: 1 });
    const updated = must(
      await app.organizations.update(
        org,
        { name: current.name, country: 'GN', currency: 'GNF' },
        current.version,
      ),
    );
    expect(updated).toMatchObject({ country: 'GN', currency: 'GNF', version: 2 });
    expect(
      await app.organizations.update(org, { name: 'Autre', country: 'GN', currency: 'GNF' }, 1),
    ).toMatchObject({ ok: false, error: { kind: 'PRECONDITION_FAILED' } });
    const audit = must(await app.audit.list(org, { limit: 10 }));
    expect(audit.items.map((a) => a.action)).toContain('organization.updated');

    const project = must(
      await app.projects.create(org, {
        code: code('GN'),
        name: 'Dispensaire',
        disciplines: ['BTP'],
      }),
    );
    const boq = must(await app.boqs.create(org, project.id, { title: 'DQE' }));
    expect(boq.currency).toBe('GNF');
    // Une autre organisation ne modifie pas celle-ci (RLS), même en écrivant directement.
    const changed = await raw(stranger, (tx) =>
      tx.organization.updateMany({ where: { id: org.organization.id }, data: { currency: 'EUR' } }),
    );
    expect(changed.count).toBe(0);
  });
});
