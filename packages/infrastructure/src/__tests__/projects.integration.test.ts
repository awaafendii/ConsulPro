import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ok } from '@consulpro/calc-core';
import { createApplication, type Application, type OrgContext } from '@consulpro/application';
import { createDatabase, type Database } from '@consulpro/db';
import type { OrgRole } from '@consulpro/domain';
import { adminQuery, unique } from '@consulpro/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryMailer } from '../mail/smtp-mailer';
import { createUnitOfWork } from '../persistence/unit-of-work';
import { loadStandard, setPlatformAdmin } from '../standards/load-standard';
import { createEngineRegistry } from '../index';
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
let platform: TestUser;
let demoVersionId: string;
let owner: OrgContext;
const ctx: Partial<Record<'admin' | 'engineer' | 'technician' | 'viewer', OrgContext>> = {};
const users: Partial<Record<'admin' | 'engineer' | 'technician' | 'viewer', TestUser>> = {};

const as = (role: keyof typeof ctx) => {
  const value = ctx[role];
  if (!value) throw new Error(`contexte ${role} absent`);
  return value;
};
const userOf = (role: keyof typeof users) => {
  const value = users[role];
  if (!value) throw new Error(`utilisateur ${role} absent`);
  return value;
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

async function join(org: OrgContext, prefix: string, role: OrgRole) {
  const user = await createUser(prefix);
  await adminQuery(
    database().adminUrl,
    `INSERT INTO memberships (id, organization_id, user_id, role, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, now())`,
    [org.organization.id, user.id, role],
  );
  const resolved = await app.organizations.resolveContext(ctxOf(user), org.organization.slug);
  if (!resolved.ok) throw new Error(resolved.error.message);
  return { user, ctx: resolved.value };
}

async function newProject(by: OrgContext, code = unique('P').toUpperCase().slice(0, 20)) {
  const created = await app.projects.create(by, {
    code,
    name: `Projet ${code}`,
    disciplines: ['BTP'],
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
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

  // Référentiel de démonstration publié par un administrateur de la plateforme.
  platform = await createUser('plateforme');
  const granted = await setPlatformAdmin(adminDb, platform.email, true);
  if (!granted.ok) throw new Error(granted.error);
  const loaded = await loadStandard(adminDb, DEMO, { publishAs: platform.email });
  if (!loaded.ok) throw new Error(loaded.error);
  demoVersionId = loaded.value.standardVersionId;

  const founder = await createUser('fondateur');
  const slug = unique('org');
  const created = await app.organizations.create(ctxOf(founder), { name: `BET ${slug}`, slug });
  if (!created.ok) throw new Error(created.error.message);
  const resolved = await app.organizations.resolveContext(ctxOf(founder), slug);
  if (!resolved.ok) throw new Error(resolved.error.message);
  owner = resolved.value;
  for (const [key, role] of [
    ['admin', 'ADMIN'],
    ['engineer', 'ENGINEER'],
    ['technician', 'TECHNICIAN'],
    ['viewer', 'VIEWER'],
  ] as const) {
    const member = await join(owner, key, role);
    ctx[key] = member.ctx;
    users[key] = member.user;
  }
});

afterAll(async () => {
  await db.$disconnect();
  await adminDb.$disconnect();
});

describe('chargement des référentiels (CLI d’administration)', () => {
  it('refuse un fichier invalide ou un éditeur qui n’est pas administrateur de la plateforme', async () => {
    const invalid = await loadStandard(adminDb, { standard: { code: 'x' } });
    expect(invalid.ok).toBe(false);
    const notAdmin = await loadStandard(adminDb, DEMO, { publishAs: userOf('admin').email });
    expect(notAdmin).toMatchObject({ ok: false });
  });

  it('une version publiée est immuable : la recharger ne change rien', async () => {
    expect(await loadStandard(adminDb, DEMO)).toEqual({
      ok: true,
      value: { standardVersionId: demoVersionId, outcome: 'UNCHANGED', status: 'PUBLISHED' },
    });
    await expect(
      adminQuery(
        database().adminUrl,
        `UPDATE parameters SET label = 'x' WHERE standard_version_id = $1`,
        [demoVersionId],
      ),
    ).rejects.toThrow(/non modifiable/);
  });

  it('un brouillon se remplace, puis se publie par l’API, réservée à l’administrateur de la plateforme', async () => {
    const draft = { ...(DEMO as object), version: { label: unique('brouillon') } };
    const first = await loadStandard(adminDb, draft);
    const second = await loadStandard(adminDb, draft);
    if (!first.ok || !second.ok) throw new Error('chargement');
    expect(second.value).toMatchObject({ outcome: 'DRAFT_REPLACED', status: 'DRAFT' });
    const id = first.value.standardVersionId;

    const asAdmin = await app.library.setSystemVersionStatus(
      {
        ...ctxOf(userOf('admin')),
        actor: { ...ctxOf(userOf('admin')).actor, platformAdmin: true },
      },
      id,
      'PUBLISHED',
    );
    expect(asAdmin).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });
    const platformCtx = {
      ...ctxOf(platform),
      actor: { ...ctxOf(platform).actor, platformAdmin: true },
    };
    expect(await app.library.setSystemVersionStatus(platformCtx, id, 'PUBLISHED')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await app.library.setSystemVersionStatus(platformCtx, id, 'PUBLISHED')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect((await app.library.setSystemVersionStatus(platformCtx, id, 'DEPRECATED')).ok).toBe(true);
    const audit = await adminQuery<{ action: string; organization_id: string | null }>(
      database().adminUrl,
      `SELECT action, organization_id FROM audit_logs WHERE target_id = $1 ORDER BY id`,
      [id],
    );
    expect(audit).toEqual([
      { action: 'standard.published', organization_id: null },
      { action: 'standard.deprecated', organization_id: null },
    ]);
  });
});

describe('rôle plateforme', () => {
  it('le rôle applicatif ne peut ni l’attribuer ni le modifier', async () => {
    await expect(
      raw(as('admin'), (tx) =>
        tx.user.update({
          where: { id: userOf('admin').id },
          data: { platformRole: 'PLATFORM_ADMIN' },
        }),
      ),
    ).rejects.toThrow(/rôle plateforme/);
    await expect(
      raw(as('admin'), (tx) =>
        tx.user.create({
          data: {
            name: 'Intrus',
            email: `${unique('intrus')}@consulpro.test`,
            platformRole: 'PLATFORM_ADMIN',
          },
        }),
      ),
    ).rejects.toThrow(/rôle plateforme/);
  });
});

describe('projets — accès en base (RLS)', () => {
  it('un ingénieur crée un projet et en devient membre ; référentiel par défaut retenu', async () => {
    const project = await newProject(as('engineer'));
    expect(project).toMatchObject({ role: 'ENGINEER', disciplines: ['BTP'], version: 1 });
    const standards = await app.library.projectStandards(as('engineer'), project.id);
    expect(standards.ok && standards.value.items[0]?.versions.map((v) => v.id)).toEqual([
      demoVersionId,
    ]);
    const activity = await app.projects.activity(as('engineer'), project.id, { limit: 10 });
    expect(activity.ok && activity.value.items.map((a) => [a.type, a.actorName])).toEqual([
      ['project.created', 'engineer'],
    ]);
  });

  it('un non-membre ne voit ni le projet ni ses données, même sans filtre applicatif', async () => {
    const project = await newProject(as('engineer'));
    const seen = await raw(as('technician'), async (tx) => ({
      projects: await tx.project.count({ where: { id: project.id } }),
      members: await tx.projectMember.count({ where: { projectId: project.id } }),
      disciplines: await tx.projectDiscipline.count({ where: { projectId: project.id } }),
      standards: await tx.projectStandardVersion.count({ where: { projectId: project.id } }),
      activity: await tx.activityEvent.count({ where: { projectId: project.id } }),
    }));
    expect(seen).toEqual({ projects: 0, members: 0, disciplines: 0, standards: 0, activity: 0 });
    // L'administrateur voit tout le projet.
    expect(await raw(as('admin'), (tx) => tx.project.count({ where: { id: project.id } }))).toBe(1);
    expect(await app.projects.get(as('technician'), project.id)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });

  it('un non-membre ne peut ni s’ajouter au projet, ni le modifier', async () => {
    const project = await newProject(as('engineer'));
    await expect(
      raw(as('technician'), (tx) =>
        tx.projectMember.createMany({
          data: [
            {
              id: uuidV7Generator.next(),
              organizationId: owner.organization.id,
              projectId: project.id,
              userId: userOf('technician').id,
              role: 'TECHNICIAN',
            },
          ],
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
    const updated = await raw(as('technician'), (tx) =>
      tx.project.updateMany({ where: { id: project.id }, data: { name: 'Piraté' } }),
    );
    expect(updated.count).toBe(0);
    await expect(
      raw(
        as('engineer'),
        (tx) => tx.$executeRaw`DELETE FROM projects WHERE id = ${project.id}::uuid`,
      ),
    ).resolves.toBe(0);
  });

  it('amorçage : le créateur ne peut ajouter que lui-même comme premier membre', async () => {
    const id = uuidV7Generator.next();
    await expect(
      raw(as('engineer'), async (tx) => {
        await tx.project.createMany({
          data: [
            {
              id,
              organizationId: owner.organization.id,
              code: unique('B').toUpperCase().slice(0, 20),
              name: 'Amorçage',
              createdById: userOf('engineer').id,
            },
          ],
        });
        await tx.projectMember.createMany({
          data: [
            {
              id: uuidV7Generator.next(),
              organizationId: owner.organization.id,
              projectId: id,
              userId: userOf('viewer').id,
              role: 'VIEWER',
            },
          ],
        });
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('un membre ajouté voit le projet ; quitter l’organisation retire de ses projets, même archivés', async () => {
    const project = await newProject(as('engineer'));
    const outsider = await join(owner, 'partant', 'TECHNICIAN');
    const added = await app.projectMembers.add(as('engineer'), project.id, {
      userId: outsider.user.id,
      role: 'TECHNICIAN',
    });
    if (!added.ok) throw new Error(added.error.message);
    const listed = await app.projectMembers.list(outsider.ctx, project.id);
    expect(listed.ok && listed.value.map((m) => [m.name, m.role, m.organizationRole])).toEqual([
      ['engineer', 'ENGINEER', 'ENGINEER'],
      ['partant', 'TECHNICIAN', 'TECHNICIAN'],
    ]);
    expect((await app.projects.list(outsider.ctx, 'ACTIVE')).ok).toBe(true);

    expect((await app.projects.archive(as('engineer'), project.id, 1)).ok).toBe(true);
    const removed = await app.members.remove(owner, outsider.ctx.membershipId, 1);
    expect(removed).toEqual({ ok: true, value: undefined });
    const left = await adminQuery<{ n: string }>(
      database().adminUrl,
      'SELECT count(*)::text AS n FROM project_members WHERE user_id = $1',
      [outsider.user.id],
    );
    expect(left[0]?.n).toBe('0');
  });
});

describe('projet archivé : lecture seule, y compris en base', () => {
  it('refuse toute écriture sur ses données, même sans contrôle applicatif', async () => {
    const project = await newProject(as('engineer'));
    expect((await app.projects.archive(as('engineer'), project.id, 1)).ok).toBe(true);
    expect(
      await app.projects.update(
        as('engineer'),
        project.id,
        { code: 'X1', name: 'Nouveau nom', disciplines: ['BTP'] },
        2,
      ),
    ).toMatchObject({ ok: false, error: { reason: 'PROJECT_ARCHIVED' } });

    await expect(
      raw(as('admin'), (tx) =>
        tx.project.updateMany({ where: { id: project.id }, data: { name: 'Contournement' } }),
      ),
    ).rejects.toThrow(/lecture seule/);
    await expect(
      raw(as('admin'), (tx) =>
        tx.projectDiscipline.createMany({
          data: [
            {
              id: uuidV7Generator.next(),
              organizationId: owner.organization.id,
              projectId: project.id,
              discipline: 'ELEC',
            },
          ],
        }),
      ),
    ).rejects.toThrow(/lecture seule/);
    await expect(
      raw(as('admin'), (tx) =>
        tx.projectStandardVersion.deleteMany({ where: { projectId: project.id } }),
      ),
    ).rejects.toThrow(/lecture seule/);

    // Le désarchivage reste possible et rouvre l'écriture.
    expect(await app.projects.unarchive(as('engineer'), project.id, 2)).toEqual({
      ok: true,
      value: { version: 3 },
    });
    expect(
      (
        await app.projects.update(
          as('engineer'),
          project.id,
          { code: project.code, name: 'Nouveau nom', disciplines: ['BTP'] },
          3,
        )
      ).ok,
    ).toBe(true);
  });
});

describe('surcharges et paramètres effectifs (PostgreSQL)', () => {
  it('projet > organisation > référentiel ; une surcharge par niveau, même en concurrence', async () => {
    const project = await newProject(as('engineer'));
    const input = {
      standardVersionId: demoVersionId,
      key: 'demo.waste_rate',
      value: { kind: 'SCALAR', value: 7, unit: '%' },
      justification: 'Pratique du bureau',
    };
    const org = await app.library.createOrgOverride(as('admin'), input);
    expect(org).toMatchObject({
      ok: true,
      value: { scope: 'ORGANIZATION', createdByName: 'admin' },
    });
    const proj = await app.library.createProjectOverride(as('engineer'), project.id, {
      ...input,
      value: { kind: 'SCALAR', value: 9, unit: '%' },
      justification: 'Chantier exigu',
    });
    expect(proj.ok).toBe(true);

    const effective = await app.library.effectiveParameters(
      as('engineer'),
      project.id,
      demoVersionId,
    );
    expect(effective.ok && effective.value.map((p) => [p.key, p.origin, p.value])).toEqual([
      ['demo.waste_rate', 'PROJECT', { kind: 'SCALAR', value: 9, unit: '%' }],
      ['demo.max_area', 'STANDARD', { kind: 'SCALAR', value: 500, unit: 'm2' }],
    ]);

    // Doublon d'organisation inséré directement : l'index unique (NULLS NOT DISTINCT) le refuse.
    await expect(
      raw(as('admin'), (tx) =>
        tx.parameterOverride.create({
          data: {
            id: uuidV7Generator.next(),
            organizationId: owner.organization.id,
            standardVersionId: demoVersionId,
            key: 'demo.waste_rate',
            value: { kind: 'SCALAR', value: 8, unit: '%' },
            justification: 'Doublon',
            createdById: userOf('admin').id,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('un référentiel transversal peut être retenu pour deux métiers du même projet', async () => {
    const generic = await loadStandard(
      adminDb,
      {
        ...(DEMO as object),
        standard: {
          code: unique('GEN').toUpperCase(),
          title: 'Transversal',
          discipline: null,
          nature: 'PRACTICE',
        },
        version: { label: '1' },
        rules: [],
      },
      { publishAs: platform.email },
    );
    if (!generic.ok) throw new Error(generic.error);
    const project = await newProject(as('engineer'));
    await app.projects.update(
      as('engineer'),
      project.id,
      { code: project.code, name: project.name, disciplines: ['BTP', 'ELEC'] },
      1,
    );
    const id = generic.value.standardVersionId;
    expect(
      await app.library.setProjectStandards(as('engineer'), project.id, 'BTP', [demoVersionId, id]),
    ).toEqual(ok(undefined));
    expect(await app.library.setProjectStandards(as('engineer'), project.id, 'ELEC', [id])).toEqual(
      ok(undefined),
    );
    const standards = await app.library.projectStandards(as('viewer'), project.id);
    expect(standards).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });
    const asEngineer = await app.library.projectStandards(as('engineer'), project.id);
    expect(asEngineer.ok && asEngineer.value.items.map((i) => i.versions.length)).toEqual([2, 1]);
  });
});
