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
 * Plomberie (Phase 6) en base réelle : réseau lu dans un jeu de données, lignes de DQE
 * ventilées par diamètre (décision Q9), contrôlées par la base, présentation agrégée et
 * variantes proposées aux bibliothèques de prix.
 */

const seed = (file: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../standards/seeds/plumbing/${file}`, import.meta.url)),
      'utf8',
    ),
  );

let db: Database;
let adminDb: Database;
let app: Application;
let owner: OrgContext;

const must = <T>(
  result: { ok: true; value: T } | { ok: false; error: { message: string } | string },
) => {
  if (!result.ok) {
    throw new Error(typeof result.error === 'string' ? result.error : result.error.message);
  }
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
  const platform = await createUser('plateforme-p');
  must(await setPlatformAdmin(adminDb, platform.email, true));
  for (const file of [
    'nf-dtu-60.11-2013.json',
    'nf-dtu-64.1-2013.json',
    'tubes-en-1.json',
    'usages-plomberie-1.json',
  ]) {
    must(await loadStandard(adminDb, seed(file), { publishAs: platform.email }));
  }
  const founder = await createUser('orgp');
  const slug = unique('orgp');
  must(await app.organizations.create(ctxOf(founder), { name: `BET ${slug}`, slug }));
  owner = must(await app.organizations.resolveContext(ctxOf(founder), slug));
});

afterAll(async () => {
  await db.$disconnect();
  await adminDb.$disconnect();
});

describe('DQE de plomberie ventilé par diamètre', () => {
  it('lignes par diamètre persistées, présentation agrégée, variantes de prix', async () => {
    const project = must(
      await app.projects.create(owner, {
        code: unique('PL')
          .replaceAll(/[^A-Za-z0-9]/g, '')
          .slice(-16)
          .toUpperCase(),
        name: 'Dispensaire',
        disciplines: ['PLUMBING'],
      }),
    );
    const study = must(
      await app.studies.create(owner, project.id, {
        discipline: 'PLUMBING',
        title: 'Alimentation',
      }),
    );
    const network = must(
      await app.datasets.create(owner, project.id, { kind: 'PLUMBING_NETWORK', title: 'Réseau' }),
    );
    must(await app.datasets.saveRevision(owner, project.id, network.id, { rows: NETWORK }, 1));
    const calc = must(
      await app.calculations.create(owner, project.id, study.id, {
        title: 'Réseau eau froide',
        engineId: 'plumbing.supply-network',
      }),
    );
    const run = must(
      await app.calculations.run(owner, project.id, calc.id, {
        network: { fromDataset: network.id },
        material: 'PEHD_PN16',
        upstreamPressure: { value: 250, unit: 'kPa' },
        temperature: { value: 25, unit: 'degC' },
      }),
    );
    expect(run.revision.resultStatus).toBe('OK_WITH_WARNINGS');
    expect(run.view.outputs.some((o) => o.key.startsWith('pipes:PEHD_PN16-'))).toBe(true);

    const lot = must(
      await app.takeoff.createNode(owner, project.id, {
        parentId: null,
        kind: 'LOT',
        code: '5',
        title: 'Plomberie',
      }),
    );
    must(await app.takeoff.assign(owner, project.id, calc.id, lot.id));
    const created = must(await app.boqs.create(owner, project.id, { title: 'DQE plomberie' }));
    const view = must(await app.boqs.get(owner, project.id, created.boq.id));
    const pipes = view.items.filter((i) => i.outputPart !== '');
    expect(pipes.length).toBeGreaterThanOrEqual(2);
    expect(pipes.every((i) => i.groupDesignation === 'Réseau eau froide — Tube PEHD PN16')).toBe(
      true,
    );
    expect(view.groups).toHaveLength(1);

    const aggregated = must(
      await app.boqs.update(
        owner,
        project.id,
        created.boq.id,
        { presentation: 'AGGREGATED' },
        view.boq.version,
      ),
    );
    expect(must(await app.boqs.get(owner, project.id, created.boq.id)).boq.presentation).toBe(
      aggregated.boq.presentation,
    );

    const library = must(
      await app.prices.create(owner, { name: unique('Prix'), currency: 'XOF', validFrom: null }),
    );
    const works = must(await app.prices.get(owner, library.id)).works;
    for (const item of pipes) {
      expect(works.map((w) => w.workKey)).toContain(item.workKey);
    }

    // La base refuse une entrée ventilée sans groupe (présentation agrégée impossible).
    await expect(
      adminQuery(
        database().adminUrl,
        `UPDATE boq_items SET group_designation = NULL WHERE boq_id = $1 AND output_part <> ''`,
        [created.boq.id],
      ),
    ).rejects.toThrow(/boq_items_part_check/);
  });
});
