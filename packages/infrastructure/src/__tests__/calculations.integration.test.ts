import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { canonicalJson } from '@consulpro/calc-core';
import { createApplication, type Application, type OrgContext } from '@consulpro/application';
import { createDatabase, type Database } from '@consulpro/db';
import type { OrgRole } from '@consulpro/domain';
import { adminQuery, unique } from '@consulpro/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEngineRegistry } from '../index';
import { MemoryMailer } from '../mail/smtp-mailer';
import { createUnitOfWork } from '../persistence/unit-of-work';
import { loadStandard, setPlatformAdmin } from '../standards/load-standard';
import { sha256Hasher, systemClock, tokenService, uuidV7Generator } from '../system/services';
import { createUser, ctxOf, database, type TestUser } from './helpers';

const DEMO: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../standards/seeds/demo/demo-1.json', import.meta.url)),
    'utf8',
  ),
);

let db: Database;
let adminDb: Database;
let app: Application;
let owner: OrgContext;
const people: Record<string, { user: TestUser; ctx: OrgContext }> = {};
let projectId: string;
let studyId: string;

const slab = {
  length: { value: 10, unit: 'm' },
  width: { value: 5, unit: 'm' },
  thickness: { value: 20, unit: 'cm' },
};

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
  return p;
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

async function newCalculation(title = 'Dalle') {
  return must(
    await app.calculations.create(as('auteur').ctx, projectId, studyId, {
      title,
      engineId: 'demo.slab-volume',
    }),
  );
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
    engines: createEngineRegistry({ demoEngines: true }),
    defaultTimeZone: 'Africa/Abidjan',
    appUrl: 'http://localhost:3000',
  });
  const platform = await createUser('plateforme-c');
  must(await setPlatformAdmin(adminDb, platform.email, true));
  must(await loadStandard(adminDb, DEMO, { publishAs: platform.email }));

  const founder = await createUser('fondateur-c');
  const slug = unique('orgc');
  must(await app.organizations.create(ctxOf(founder), { name: `BET ${slug}`, slug }));
  owner = must(await app.organizations.resolveContext(ctxOf(founder), slug));
  await join('auteur', 'ENGINEER');
  await join('verificateur', 'ENGINEER');
  await join('technicien', 'TECHNICIAN');
  const project = must(
    await app.projects.create(as('auteur').ctx, {
      code: unique('C')
        .replaceAll(/[^A-Za-z0-9]/g, '')
        .slice(-16)
        .toUpperCase(),
      name: 'Projet Lot C',
      disciplines: ['BTP'],
    }),
  );
  projectId = project.id;
  for (const name of ['verificateur', 'technicien'] as const) {
    must(
      await app.projectMembers.add(as('auteur').ctx, projectId, {
        userId: as(name).user.id,
        role: name === 'verificateur' ? 'ENGINEER' : 'TECHNICIAN',
      }),
    );
  }
  studyId = must(
    await app.studies.create(as('auteur').ctx, projectId, { discipline: 'BTP', title: 'Dalles' }),
  ).id;
});

afterAll(async () => {
  await db.$disconnect();
  await adminDb.$disconnect();
});

describe('exécution : paramètres résolus, figés et empreints', () => {
  it('projet > organisation > référentiel ; snapshot et SHA-256 reproductibles', async () => {
    const calc = await newCalculation('Dalle résolue');
    const demo = await app.library.projectStandards(as('auteur').ctx, projectId);
    // Base partagée : d'autres référentiels BTP peuvent être retenus ; on vise DEMO.
    const versionId = must(demo).items[0]?.versions.find((v) => v.code === 'DEMO')?.id ?? '';
    must(
      await app.library.createOrgOverride(owner, {
        standardVersionId: versionId,
        key: 'demo.max_area',
        value: { kind: 'SCALAR', value: 400, unit: 'm2' },
        justification: 'Pratique du bureau',
      }),
    );
    must(
      await app.library.createProjectOverride(as('auteur').ctx, projectId, {
        standardVersionId: versionId,
        key: 'demo.waste_rate',
        value: { kind: 'SCALAR', value: 8, unit: '%' },
        justification: 'Chantier exigu',
      }),
    );
    const view = must(await app.calculations.run(as('auteur').ctx, projectId, calc.id, slab));
    const snapshot = view.revision.parameterSnapshot;
    expect(snapshot.map((p) => [p.key, p.override?.scope ?? 'STANDARD'])).toEqual([
      ['demo.max_area', 'ORGANIZATION'],
      ['demo.waste_rate', 'PROJECT'],
    ]);
    expect(view.revision.parameterSnapshotHash).toBe(
      createHash('sha256').update(canonicalJson(snapshot), 'utf8').digest('hex'),
    );
    expect(view.view.outputs.find((o) => o.key === 'volumeWithWaste')?.value).toBeCloseTo(10.8, 9);
    // Recalcul identique : même empreinte.
    const again = must(await app.calculations.run(as('auteur').ctx, projectId, calc.id, slab));
    expect(again.revision.parameterSnapshotHash).toBe(view.revision.parameterSnapshotHash);
    expect(again.revision.number).toBe(2);
  });
});

describe('révisions immuables (trigger)', () => {
  it('ni le rôle applicatif ni le propriétaire ne modifient une révision', async () => {
    const calc = await newCalculation('Dalle immuable');
    const rev = must(
      await app.calculations.run(as('auteur').ctx, projectId, calc.id, slab),
    ).revision;
    await expect(
      raw(
        as('auteur').ctx,
        (tx) =>
          tx.$executeRaw`UPDATE calculation_revisions SET outputs = '{}' WHERE id = ${rev.id}::uuid`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      raw(
        as('auteur').ctx,
        (tx) => tx.$executeRaw`DELETE FROM calculation_revisions WHERE id = ${rev.id}::uuid`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      adminQuery(
        database().adminUrl,
        `UPDATE calculation_revisions SET outputs = '{}' WHERE id = $1`,
        [rev.id],
      ),
    ).rejects.toThrow(/immuable/);
    await expect(
      adminQuery(
        database().adminUrl,
        `UPDATE calculation_revisions SET workflow_status = 'VERIFIED' WHERE id = $1`,
        [rev.id],
      ),
    ).rejects.toThrow(/immuable/);
  });

  it('une révision naît « calculée », au nom de l’utilisateur courant', async () => {
    const calc = await newCalculation('Dalle forgée');
    const base = {
      organization_id: owner.organization.id,
      project_id: projectId,
      calculation_id: calc.id,
    };
    const insert = (who: OrgContext, status: string, author: string) =>
      raw(who, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO calculation_revisions (id, organization_id, project_id, calculation_id, number,
             engine_id, engine_version, standards, parameter_snapshot, parameter_snapshot_hash,
             raw_inputs, checks, warnings, hypotheses, trace, errors, presentation, result_status,
             workflow_status, author_id)
           VALUES (gen_random_uuid(), $1, $2, $3, 99, 'demo.slab-volume', '1.0.0', '[]', '[]', 'x',
             '{}', '[]', '[]', '[]', '[]', '[]', '{}', 'OK', $4::"WorkflowStatus", $5)`,
          base.organization_id,
          base.project_id,
          base.calculation_id,
          status,
          author,
        ),
      );
    await expect(insert(as('auteur').ctx, 'VERIFIED', as('auteur').user.id)).rejects.toThrow(
      /COMPUTED/,
    );
    await expect(insert(as('auteur').ctx, 'COMPUTED', as('verificateur').user.id)).rejects.toThrow(
      /row-level security/i,
    );
  });
});

describe('contrôle à deux niveaux, revérifié par la base', () => {
  it('l’auteur ne peut pas vérifier son calcul, même en écrivant directement en base', async () => {
    const calc = await newCalculation('Dalle contrôlée');
    const rev = must(
      await app.calculations.run(as('auteur').ctx, projectId, calc.id, slab),
    ).revision;
    must(await app.calculations.validate(as('auteur').ctx, projectId, rev.id));

    const review = (who: OrgContext, reviewer: string, type: string, decision = 'APPROVED') =>
      raw(who, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO calculation_reviews (organization_id, project_id, revision_id, type, decision, reviewer_id)
           VALUES ($1, $2, $3, $4::"ReviewType", $5::"ReviewDecision", $6)`,
          owner.organization.id,
          projectId,
          rev.id,
          type,
          decision,
          reviewer,
        ),
      );
    await expect(review(as('auteur').ctx, as('auteur').user.id, 'VERIFICATION')).rejects.toThrow(
      /vérificateur ne peut pas être l'auteur/,
    );
    // Signer au nom d'un autre est refusé par la RLS.
    await expect(
      review(as('auteur').ctx, as('verificateur').user.id, 'VERIFICATION'),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      review(as('verificateur').ctx, as('verificateur').user.id, 'VERIFICATION', 'REJECTED'),
    ).rejects.toThrow(/Motif de rejet/);

    expect(
      await app.calculations.verify(as('auteur').ctx, projectId, rev.id, 'APPROVED'),
    ).toMatchObject({ ok: false, error: { reason: 'VERIFIER_IS_AUTHOR' } });
    const verified = must(
      await app.calculations.verify(
        as('verificateur').ctx,
        projectId,
        rev.id,
        'APPROVED',
        'Conforme',
      ),
    );
    expect(verified.revision.workflowStatus).toBe('VERIFIED');
    await expect(
      raw(
        as('verificateur').ctx,
        (tx) => tx.$executeRaw`UPDATE calculation_reviews SET comment = 'x'`,
      ),
    ).rejects.toThrow(/permission denied/i);

    // Notifications : chacun ne voit que les siennes.
    const authorInbox = must(
      await app.account.notifications(ctxOf(as('auteur').user), { limit: 10, unreadOnly: false }),
    );
    expect(authorInbox.items.map((n) => n.type)).toContain('calculation.verified');
    const visible = await raw(as('verificateur').ctx, (tx) => tx.notification.count());
    const own = await raw(as('verificateur').ctx, (tx) =>
      tx.notification.count({ where: { userId: as('verificateur').user.id } }),
    );
    expect(visible).toBe(own);
  });

  it('seule la révision courante se contrôle', async () => {
    const calc = await newCalculation('Dalle remplacée');
    const first = must(
      await app.calculations.run(as('auteur').ctx, projectId, calc.id, slab),
    ).revision;
    must(await app.calculations.run(as('auteur').ctx, projectId, calc.id, slab));
    await expect(
      raw(as('auteur').ctx, (tx) =>
        tx.$executeRawUnsafe(
          `INSERT INTO calculation_reviews (organization_id, project_id, revision_id, type, decision, reviewer_id)
           VALUES ($1, $2, $3, 'VALIDATION', 'APPROVED', $4)`,
          owner.organization.id,
          projectId,
          first.id,
          as('auteur').user.id,
        ),
      ),
    ).rejects.toThrow(/révision courante/);
  });
});

describe('dépendances, données, recherche', () => {
  it('obsolescence détectée en base après recalcul de la source', async () => {
    const volume = await newCalculation('Volume source');
    must(await app.calculations.run(as('auteur').ctx, projectId, volume.id, slab));
    const mass = must(
      await app.calculations.create(as('auteur').ctx, projectId, studyId, {
        title: 'Masse liée',
        engineId: 'demo.slab-mass',
      }),
    );
    must(
      await app.calculations.run(as('auteur').ctx, projectId, mass.id, {
        volume: { fromCalculation: volume.id, output: 'volume' },
        density: { value: 2.4, unit: 't/m3' },
      }),
    );
    expect(must(await app.calculations.get(as('auteur').ctx, projectId, mass.id)).obsolete).toBe(
      false,
    );
    must(await app.calculations.run(as('auteur').ctx, projectId, volume.id, slab));
    expect(must(await app.calculations.get(as('auteur').ctx, projectId, mass.id)).obsolete).toBe(
      true,
    );
  });

  it('révisions de données immuables ; recherche insensible aux accents', async () => {
    const dataset = must(
      await app.datasets.create(as('technicien').ctx, projectId, {
        kind: 'ROOMS',
        title: 'Pièces étage',
      }),
    );
    const rev = must(
      await app.datasets.saveRevision(
        as('technicien').ctx,
        projectId,
        dataset.id,
        { rows: [{ name: 'Séjour', area: { value: 24, unit: 'm2' } }] },
        1,
      ),
    );
    await expect(
      adminQuery(database().adminUrl, `UPDATE dataset_revisions SET row_count = 9 WHERE id = $1`, [
        rev.id,
      ]),
    ).rejects.toThrow(/ajout seul/);

    const hits = must(await app.account.search(as('auteur').ctx, 'PIECES'));
    expect(hits).toEqual([]); // les jeux de données ne sont pas indexés ; les études oui :
    expect(must(await app.account.search(as('auteur').ctx, 'dalles')).map((h) => h.type)).toContain(
      'study',
    );
    expect(must(await app.account.search(as('auteur').ctx, '50%_')).length).toBe(0);
    const outsider = await createUser('externe-c');
    await adminQuery(
      database().adminUrl,
      `INSERT INTO memberships (id, organization_id, user_id, role, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'ENGINEER', now())`,
      [owner.organization.id, outsider.id],
    );
    const outsiderCtx = must(
      await app.organizations.resolveContext(ctxOf(outsider), owner.organization.slug),
    );
    expect(must(await app.account.search(outsiderCtx, 'dalle'))).toEqual([]);
  });

  it('projet archivé : études, calculs et données en lecture seule, même en base', async () => {
    const calc = await newCalculation('Dalle archivée');
    must(await app.calculations.run(as('auteur').ctx, projectId, calc.id, slab));
    const project = must(await app.projects.get(as('auteur').ctx, projectId));
    must(await app.projects.archive(as('auteur').ctx, projectId, project.version));
    try {
      expect(await app.calculations.run(as('auteur').ctx, projectId, calc.id, slab)).toMatchObject({
        ok: false,
        error: { reason: 'PROJECT_ARCHIVED' },
      });
      await expect(
        raw(owner, (tx) =>
          tx.study.updateMany({ where: { id: studyId }, data: { title: 'Contournement' } }),
        ),
      ).rejects.toThrow(/lecture seule/);
    } finally {
      must(await app.projects.unarchive(as('auteur').ctx, projectId, project.version + 1));
    }
  });
});
