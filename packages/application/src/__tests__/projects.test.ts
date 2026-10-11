import type { OrgRole } from '@consulpro/domain';
import type { ParameterDefinition } from '@consulpro/standards';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApplication, type Application, type OrgContext, type OverrideInput } from '../index';
import type { StandardHeader, StandardVersionDetail } from '../ports-projects';
import { InMemoryStore, userContext } from './in-memory';

let store: InMemoryStore;
let app: Application;

const header = (
  id: string,
  code: string,
  discipline: StandardHeader['discipline'],
): StandardHeader => ({
  id,
  organizationId: null,
  code,
  title: `Référentiel ${code}`,
  publisher: null,
  discipline,
  nature: 'PRACTICE',
});

const scalar = (key: string, value: number, unit: '%' | 'm2' | 'm'): ParameterDefinition => ({
  key,
  label: `Libellé ${key}`,
  kind: 'SCALAR',
  value,
  unit,
  source: { document: 'Démonstration' },
  verification: 'TO_VERIFY',
});

const version = (
  id: string,
  standard: StandardHeader,
  status: StandardVersionDetail['status'],
  parameters: ParameterDefinition[],
  label = '1',
): StandardVersionDetail => ({
  id,
  label,
  status,
  sourceNotes: null,
  publishedAt: status === 'DRAFT' ? null : new Date('2026-01-01T00:00:00Z'),
  standard,
  parameters,
  rules: [],
});

const DEMO = header('std-demo', 'DEMO', 'BTP');
const ELEC = header('std-elec', 'ELEC', 'ELEC');
const GEN = header('std-gen', 'GEN', null);

const V = {
  demo: 'v-demo-1',
  demoDraft: 'v-demo-2',
  elec: 'v-elec-1',
  elecOld: 'v-elec-0',
  gen: 'v-gen-1',
} as const;

beforeEach(() => {
  store = new InMemoryStore();
  app = createApplication(store.deps());
  store.state.standardVersions = [
    version(V.demo, DEMO, 'PUBLISHED', [
      scalar('demo.waste_rate', 5, '%'),
      scalar('demo.max_area', 500, 'm2'),
      scalar('demo.cover', 3, 'm'),
    ]),
    version(V.demoDraft, DEMO, 'DRAFT', [scalar('demo.waste_rate', 6, '%')], '2'),
    version(V.elec, ELEC, 'PUBLISHED', [scalar('elec.drop', 3, '%')], '2'),
    version(V.elecOld, ELEC, 'DEPRECATED', [scalar('elec.drop', 4, '%')], '1'),
    version(V.gen, GEN, 'PUBLISHED', [scalar('gen.margin', 1, 'm')]),
    version('v-org-1', { ...header('std-org', 'ORGX', 'BTP'), organizationId: 'org' }, 'DRAFT', []),
  ];
});

async function setup() {
  const owner = store.addUser('owner@bet.test', 'Awa Owner');
  const created = await app.organizations.create(userContext(owner), {
    name: 'BET Sahel',
    slug: 'bet-sahel',
  });
  if (!created.ok) throw new Error(created.error.message);
  const ownerCtx = await app.organizations.resolveContext(userContext(owner), 'bet-sahel');
  if (!ownerCtx.ok) throw new Error(ownerCtx.error.message);

  const member = async (email: string, role: OrgRole) => {
    const user = store.addUser(email, email.split('@')[0]);
    const invited = await app.invitations.create(ownerCtx.value, { email, role });
    if (!invited.ok) throw new Error(invited.error.message);
    const token = /invitation\/(\S+)/.exec(store.sentMail.at(-1)?.text ?? '')?.[1] ?? '';
    const accepted = await app.invitations.accept(userContext(user), token);
    if (!accepted.ok) throw new Error(accepted.error.message);
    const ctx = await app.organizations.resolveContext(userContext(user), 'bet-sahel');
    if (!ctx.ok) throw new Error(ctx.error.message);
    return { user, ctx: ctx.value };
  };

  return {
    owner: ownerCtx.value,
    admin: await member('admin@bet.test', 'ADMIN'),
    engineer: await member('ingenieur@bet.test', 'ENGINEER'),
    engineer2: await member('ingenieur2@bet.test', 'ENGINEER'),
    technician: await member('technicien@bet.test', 'TECHNICIAN'),
    viewer: await member('lecteur@bet.test', 'VIEWER'),
  };
}

const body = {
  code: 'imm-r3',
  name: 'Immeuble R+3',
  client: 'SCI Plateau',
  disciplines: ['BTP'] as const,
};

async function createProject(ctx: OrgContext, input: Partial<typeof body> = {}) {
  const created = await app.projects.create(ctx, {
    ...body,
    ...input,
    disciplines: [...(input.disciplines ?? body.disciplines)],
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

const activityTypes = () => store.state.activity.map((a) => a.type);
const auditActions = () => store.state.audit.map((a) => a.action);

describe('projets — création et visibilité', () => {
  it('un ingénieur crée un projet, en devient membre ; référentiels par défaut retenus', async () => {
    const { engineer } = await setup();
    const project = await createProject(engineer.ctx);
    expect(project).toMatchObject({
      code: 'IMM-R3',
      name: 'Immeuble R+3',
      client: 'SCI Plateau',
      description: null,
      status: 'ACTIVE',
      role: 'ENGINEER',
      disciplines: ['BTP'],
      version: 1,
    });
    expect(store.state.projectMembers).toMatchObject([
      { projectId: project.id, userId: engineer.user.id, role: 'ENGINEER' },
    ]);
    const standards = await app.library.projectStandards(engineer.ctx, project.id);
    expect(standards.ok && standards.value.items).toEqual([
      {
        discipline: 'BTP',
        versions: [{ id: V.demo, code: 'DEMO', label: '1', title: 'Référentiel DEMO' }],
      },
    ]);
    expect(activityTypes()).toEqual(['project.created']);
    expect(store.state.activity[0]?.summary).toMatchObject({ standards: ['DEMO 1'] });
    expect(auditActions()).toContain('project.created');
  });

  it('Owner et Admin ne deviennent pas membres : ils voient tous les projets', async () => {
    const { owner, admin, engineer } = await setup();
    const own = await createProject(owner);
    expect(own.role).toBe('OWNER');
    expect(store.state.projectMembers).toHaveLength(0);
    await createProject(engineer.ctx, { code: 'ENG-1' });
    const list = await app.projects.list(admin.ctx, 'ACTIVE');
    expect(list.ok && list.value.map((p) => [p.code, p.role])).toEqual([
      ['ENG-1', 'ADMIN'],
      ['IMM-R3', 'ADMIN'],
    ]);
  });

  it('refuse sans permission, code invalide ou déjà pris, sans écriture', async () => {
    const { owner, technician } = await setup();
    expect(
      await app.projects.create(technician.ctx, { ...body, disciplines: ['BTP'] }),
    ).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(
      await app.projects.create(owner, { ...body, code: 'a b', disciplines: ['BTP'] }),
    ).toMatchObject({ ok: false, error: { kind: 'VALIDATION', reason: 'PROJECT_CODE_INVALID' } });
    await createProject(owner);
    const before = structuredClone(store.state);
    expect(await app.projects.create(owner, { ...body, disciplines: ['ELEC'] })).toMatchObject({
      ok: false,
      error: { kind: 'CONFLICT', reason: 'PROJECT_CODE_TAKEN' },
    });
    expect(store.state).toEqual(before);
  });

  it('un projet inaccessible est introuvable ; visible une fois membre, avec le rôle effectif', async () => {
    const { owner, technician, engineer2 } = await setup();
    const project = await createProject(owner);
    expect(await app.projects.list(technician.ctx, 'ALL')).toEqual({ ok: true, value: [] });
    expect(await app.projects.get(technician.ctx, project.id)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    // Sans accès, même une action interdite par le rôle d'organisation répond 403 sans révéler le projet.
    expect(await app.projects.archive(technician.ctx, project.id, 1)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });

    await app.projectMembers.add(owner, project.id, {
      userId: technician.user.id,
      role: 'TECHNICIAN',
    });
    await app.projectMembers.add(owner, project.id, { userId: engineer2.user.id, role: 'VIEWER' });
    const seen = await app.projects.list(technician.ctx, 'ACTIVE');
    expect(seen.ok && seen.value.map((p) => p.role)).toEqual(['TECHNICIAN']);
    // Ingénieur dans l'organisation mais lecteur sur le projet : le plus restrictif l'emporte.
    const asViewer = await app.projects.get(engineer2.ctx, project.id);
    expect(asViewer.ok && asViewer.value.role).toBe('VIEWER');
    expect(
      await app.projects.update(engineer2.ctx, project.id, { ...body, disciplines: ['BTP'] }, 1),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });
  });
});

describe('projets — modification et archivage', () => {
  it('modifie avec verrouillage optimiste ; trace champs et métiers', async () => {
    const { engineer } = await setup();
    const project = await createProject(engineer.ctx);
    const next = {
      ...body,
      name: 'Immeuble R+4',
      disciplines: ['BTP', 'ELEC'] as ('BTP' | 'ELEC')[],
    };
    expect(await app.projects.update(engineer.ctx, project.id, next, 7)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    const updated = await app.projects.update(engineer.ctx, project.id, next, 1);
    expect(updated).toMatchObject({
      ok: true,
      value: { name: 'Immeuble R+4', version: 2, disciplines: ['BTP', 'ELEC'] },
    });
    expect(activityTypes()).toEqual([
      'project.created',
      'project.updated',
      'project.disciplines_changed',
    ]);
    // Le métier ajouté reçoit ses référentiels par défaut.
    const standards = await app.library.projectStandards(engineer.ctx, project.id);
    expect(standards.ok && standards.value.items.map((i) => i.versions.map((v) => v.id))).toEqual([
      [V.demo],
      [V.elec],
    ]);

    // Aucun changement : rien n'est écrit.
    const same = await app.projects.update(engineer.ctx, project.id, next, 2);
    expect(same.ok && same.value.version).toBe(2);
    expect(store.state.activity).toHaveLength(3);
  });

  it('refuse un code déjà pris ou un nom invalide', async () => {
    const { owner } = await setup();
    const project = await createProject(owner);
    await createProject(owner, { code: 'AUTRE' });
    expect(
      await app.projects.update(
        owner,
        project.id,
        { ...body, code: 'autre', disciplines: ['BTP'] },
        1,
      ),
    ).toMatchObject({ ok: false, error: { kind: 'CONFLICT', reason: 'PROJECT_CODE_TAKEN' } });
    expect(
      await app.projects.update(owner, project.id, { ...body, name: 'x', disciplines: ['BTP'] }, 1),
    ).toMatchObject({ ok: false, error: { kind: 'VALIDATION', reason: 'PROJECT_NAME_INVALID' } });
  });

  it('un projet archivé est en lecture seule jusqu’au désarchivage', async () => {
    const { engineer, technician } = await setup();
    const project = await createProject(engineer.ctx);
    await app.projectMembers.add(engineer.ctx, project.id, {
      userId: technician.user.id,
      role: 'TECHNICIAN',
    });
    expect(await app.projects.archive(technician.ctx, project.id, 1)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(await app.projects.archive(engineer.ctx, project.id, 1)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(await app.projects.archive(engineer.ctx, project.id, 2)).toMatchObject({
      ok: false,
      error: { kind: 'CONFLICT', reason: 'PROJECT_ALREADY_ARCHIVED' },
    });
    expect(
      await app.projects.update(engineer.ctx, project.id, { ...body, disciplines: ['BTP'] }, 2),
    ).toMatchObject({ ok: false, error: { kind: 'POLICY_VIOLATION', reason: 'PROJECT_ARCHIVED' } });
    expect(
      await app.library.setProjectStandards(engineer.ctx, project.id, 'BTP', []),
    ).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_ARCHIVED' },
    });
    // Lecture toujours possible.
    expect((await app.projects.list(engineer.ctx, 'ARCHIVED')).ok).toBe(true);
    expect((await app.projects.get(technician.ctx, project.id)).ok).toBe(true);

    expect(await app.projects.unarchive(engineer.ctx, project.id, 1)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(await app.projects.unarchive(engineer.ctx, project.id, 2)).toEqual({
      ok: true,
      value: { version: 3 },
    });
    expect(await app.projects.unarchive(engineer.ctx, project.id, 3)).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_NOT_ARCHIVED' },
    });
    expect(auditActions()).toEqual(
      expect.arrayContaining(['project.archived', 'project.unarchived']),
    );
  });

  it('pagine le fil d’activité', async () => {
    const { owner } = await setup();
    const project = await createProject(owner);
    await app.projects.archive(owner, project.id, 1);
    await app.projects.unarchive(owner, project.id, 2);
    const first = await app.projects.activity(owner, project.id, { limit: 2 });
    expect(first.ok && first.value.items.map((a) => a.type)).toEqual([
      'project.unarchived',
      'project.archived',
    ]);
    const cursor = first.ok ? (first.value.nextCursor ?? undefined) : undefined;
    expect(cursor).toBeDefined();
    const second = await app.projects.activity(owner, project.id, { cursor, limit: 2 });
    expect(second).toMatchObject({ ok: true, value: { nextCursor: null } });
    expect(second.ok && second.value.items.map((a) => a.type)).toEqual(['project.created']);
  });
});

describe('membres de projet', () => {
  it('ajoute, change le rôle et retire, avec contrôles et traces', async () => {
    const { owner, admin, engineer, technician, viewer } = await setup();
    const project = await createProject(engineer.ctx);
    const add = (userId: string, role: 'ENGINEER' | 'TECHNICIAN' | 'VIEWER') =>
      app.projectMembers.add(engineer.ctx, project.id, { userId, role });

    expect(await add(admin.user.id, 'VIEWER')).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_MEMBER_NOT_NEEDED' },
    });
    expect(await add(viewer.user.id, 'ENGINEER')).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_ROLE_ABOVE_ORG_ROLE' },
    });
    expect(await add('inconnu', 'VIEWER')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    const added = await add(technician.user.id, 'VIEWER');
    if (!added.ok) throw new Error(added.error.message);
    expect(await add(technician.user.id, 'VIEWER')).toMatchObject({
      ok: false,
      error: { kind: 'CONFLICT', reason: 'ALREADY_PROJECT_MEMBER' },
    });
    expect(
      await app.projectMembers.add(technician.ctx, project.id, {
        userId: viewer.user.id,
        role: 'VIEWER',
      }),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });

    const list = await app.projectMembers.list(owner, project.id);
    expect(list.ok && list.value.map((m) => [m.email, m.role, m.organizationRole])).toEqual([
      ['ingenieur@bet.test', 'ENGINEER', 'ENGINEER'],
      ['technicien@bet.test', 'VIEWER', 'TECHNICIAN'],
    ]);

    const change = (role: 'ENGINEER' | 'TECHNICIAN', v: number) =>
      app.projectMembers.changeRole(engineer.ctx, project.id, added.value.id, role, v);
    expect(await change('TECHNICIAN', 9)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(await change('ENGINEER', 1)).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_ROLE_ABOVE_ORG_ROLE' },
    });
    expect(await change('TECHNICIAN', 1)).toEqual({ ok: true, value: { version: 2 } });
    expect(
      await app.projectMembers.changeRole(
        engineer.ctx,
        project.id,
        added.value.id,
        'TECHNICIAN',
        2,
      ),
    ).toEqual({ ok: true, value: { version: 2 } });
    expect(
      await app.projectMembers.changeRole(engineer.ctx, project.id, 'absent', 'TECHNICIAN', 1),
    ).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });

    expect(
      await app.projectMembers.remove(engineer.ctx, project.id, added.value.id, 1),
    ).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(await app.projectMembers.remove(engineer.ctx, project.id, added.value.id, 2)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      await app.projectMembers.remove(engineer.ctx, project.id, added.value.id, 2),
    ).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(activityTypes()).toEqual([
      'project.created',
      'project.member_added',
      'project.member_role_changed',
      'project.member_removed',
    ]);
    expect(auditActions()).toEqual(
      expect.arrayContaining([
        'project.member_added',
        'project.member_role_changed',
        'project.member_removed',
      ]),
    );
  });

  it('retirer quelqu’un de l’organisation le retire de ses projets', async () => {
    const { owner, technician } = await setup();
    const project = await createProject(owner);
    await app.projectMembers.add(owner, project.id, {
      userId: technician.user.id,
      role: 'TECHNICIAN',
    });
    const membership = store.state.memberships.find((m) => m.userId === technician.user.id);
    if (!membership) throw new Error('adhésion absente');
    expect((await app.members.remove(owner, membership.id, membership.version)).ok).toBe(true);
    expect(store.state.projectMembers).toHaveLength(0);
  });
});

describe('bibliothèque', () => {
  it('masque les brouillons, sauf à l’administrateur de la plateforme', async () => {
    const { viewer, admin } = await setup();
    const list = await app.library.listStandards(viewer.ctx);
    expect(list.ok && list.value.map((s) => s.code)).not.toContain('ORGX');
    // Brouillon d'un référentiel d'organisation : visible de qui gère la bibliothèque.
    const managed = await app.library.listStandards(admin.ctx);
    expect(managed.ok && managed.value.map((s) => s.code)).toContain('ORGX');
    const demo = list.ok ? list.value.find((s) => s.code === 'DEMO') : undefined;
    expect(demo?.versions.map((v) => v.label)).toEqual(['1']);
    expect(demo?.versions[0]).toMatchObject({ parameterCount: 3, toVerifyCount: 3 });
    expect(await app.library.getVersion(viewer.ctx, V.demoDraft)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.library.getVersion(viewer.ctx, 'absente')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect((await app.library.getVersion(viewer.ctx, V.demo)).ok).toBe(true);

    const platform = { ...viewer.ctx, actor: { ...viewer.ctx.actor, platformAdmin: true } };
    const all = await app.library.listStandards(platform);
    expect(all.ok && all.value.find((s) => s.code === 'DEMO')?.versions).toHaveLength(2);
    expect((await app.library.getVersion(platform, V.demoDraft)).ok).toBe(true);
  });

  it('publication et dépréciation des référentiels système : administrateur de la plateforme', async () => {
    await setup();
    const someone = store.addUser('x@bet.test');
    expect(
      await app.library.setSystemVersionStatus(userContext(someone), V.demoDraft, 'PUBLISHED'),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });

    const root = store.addUser('root@consulpro.test', 'Plateforme', true);
    // Drapeau de session sans le rôle en base : la base refuse.
    const forged = {
      ...userContext(someone),
      actor: { ...userContext(someone).actor, platformAdmin: true },
    };
    expect(
      await app.library.setSystemVersionStatus(forged, V.demoDraft, 'PUBLISHED'),
    ).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(
      await app.library.setSystemVersionStatus(userContext(root), V.demoDraft, 'PUBLISHED'),
    ).toEqual({
      ok: true,
      value: undefined,
    });
    expect(
      await app.library.setSystemVersionStatus(userContext(root), V.demoDraft, 'PUBLISHED'),
    ).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(
      (await app.library.setSystemVersionStatus(userContext(root), V.demo, 'DEPRECATED')).ok,
    ).toBe(true);
    const audit = store.state.audit.filter((a) => a.action.startsWith('standard.'));
    expect(audit.map((a) => [a.action, a.organizationId])).toEqual([
      ['standard.published', null],
      ['standard.deprecated', null],
    ]);
  });

  it('surcharges d’organisation : justifiées, conformes, verrouillées', async () => {
    const { admin, viewer } = await setup();
    const input: OverrideInput = {
      standardVersionId: V.demo,
      key: 'demo.waste_rate',
      value: { kind: 'SCALAR', value: 7, unit: '%' },
      justification: 'Pratique du bureau',
    };
    expect(await app.library.createOrgOverride(viewer.ctx, input)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    const cases: [Partial<OverrideInput>, string][] = [
      [{ value: { kind: 'SCALAR', value: 7, unit: 'pieds' } }, 'PARAMETER_INVALID'],
      [{ value: { kind: 'SCALAR', value: 7, unit: 'm' } }, 'OVERRIDE_INCOMPATIBLE'],
      [{ justification: ' ' }, 'OVERRIDE_UNJUSTIFIED'],
      [{ key: 'demo.absent' }, 'NOT_FOUND'],
      [{ standardVersionId: V.demoDraft }, 'NOT_FOUND'],
      [{ standardVersionId: V.elecOld, key: 'elec.drop' }, 'STANDARD_VERSION_DEPRECATED'],
    ];
    for (const [change, reason] of cases) {
      expect(await app.library.createOrgOverride(admin.ctx, { ...input, ...change })).toMatchObject(
        {
          ok: false,
          error: { reason },
        },
      );
    }

    const created = await app.library.createOrgOverride(admin.ctx, input);
    expect(created).toMatchObject({
      ok: true,
      value: {
        scope: 'ORGANIZATION',
        standardCode: 'DEMO',
        label: 'Libellé demo.waste_rate',
        value: { kind: 'SCALAR', value: 7, unit: '%' },
        referenceValue: { kind: 'SCALAR', value: 5, unit: '%' },
        createdByName: 'admin',
      },
    });
    if (!created.ok) throw new Error();
    expect(await app.library.createOrgOverride(admin.ctx, input)).toMatchObject({
      ok: false,
      error: { kind: 'CONFLICT', reason: 'OVERRIDE_EXISTS' },
    });
    const listed = await app.library.listOrgOverrides(viewer.ctx);
    expect(listed.ok && listed.value.map((o) => o.createdByName)).toEqual(['admin']);

    const change = { value: { kind: 'SCALAR', value: 8, unit: '%' }, justification: 'Révision' };
    expect(
      await app.library.updateOrgOverride(admin.ctx, created.value.id, change, 5),
    ).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(
      await app.library.updateOrgOverride(
        admin.ctx,
        created.value.id,
        { ...change, justification: '' },
        1,
      ),
    ).toMatchObject({ ok: false, error: { reason: 'OVERRIDE_UNJUSTIFIED' } });
    expect(
      await app.library.updateOrgOverride(admin.ctx, created.value.id, change, 1),
    ).toMatchObject({
      ok: true,
      value: { version: 2, value: { value: 8 }, justification: 'Révision', createdByName: 'admin' },
    });
    expect(
      await app.library.updateOrgOverride(viewer.ctx, created.value.id, change, 2),
    ).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(await app.library.deleteOrgOverride(viewer.ctx, created.value.id, 2)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(await app.library.deleteOrgOverride(admin.ctx, 'absente', 2)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.library.deleteOrgOverride(admin.ctx, created.value.id, 2)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(auditActions().filter((a) => a.startsWith('parameter.'))).toEqual([
      'parameter.overridden',
      'parameter.overridden',
      'parameter.override_removed',
    ]);
    expect(await app.library.listOrgOverrides(viewer.ctx)).toEqual({ ok: true, value: [] });
  });

  it('référentiels retenus par un projet : publiés, du bon métier, une version par référentiel', async () => {
    const { engineer, technician } = await setup();
    const project = await createProject(engineer.ctx, { disciplines: ['BTP'] });
    const set = (discipline: 'BTP' | 'ELEC', ids: string[]) =>
      app.library.setProjectStandards(engineer.ctx, project.id, discipline, ids);
    expect(await set('ELEC', [V.elec])).toMatchObject({
      ok: false,
      error: { reason: 'DISCIPLINE_INACTIVE' },
    });
    expect(await set('BTP', [V.elec])).toMatchObject({
      ok: false,
      error: { reason: 'STANDARD_DISCIPLINE_MISMATCH' },
    });
    expect(await set('BTP', [V.demoDraft])).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    await app.projects.update(
      engineer.ctx,
      project.id,
      { ...body, disciplines: ['BTP', 'ELEC'] },
      1,
    );
    expect(await set('ELEC', [V.elecOld])).toMatchObject({
      ok: false,
      error: { reason: 'STANDARD_VERSION_DEPRECATED' },
    });
    expect(await set('ELEC', [V.elec, V.elec])).toEqual({ ok: true, value: undefined });
    expect(await set('BTP', [V.demo, V.gen])).toEqual({ ok: true, value: undefined });
    store.state.standardVersions.push(version('v-gen-2', GEN, 'PUBLISHED', [], '2'));
    expect(await set('BTP', [V.gen, 'v-gen-2'])).toMatchObject({
      ok: false,
      error: { reason: 'STANDARD_VERSION_DUPLICATE' },
    });
    expect(
      await app.library.setProjectStandards(technician.ctx, project.id, 'BTP', []),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });
    const standards = await app.library.projectStandards(engineer.ctx, project.id);
    expect(standards.ok && standards.value.items.map((i) => i.versions.map((v) => v.code))).toEqual(
      [['DEMO', 'GEN'], ['ELEC']],
    );
    expect(activityTypes().filter((t) => t === 'project.standards_changed')).toHaveLength(2);
  });

  it('surcharges de projet et paramètres effectifs : projet > organisation > référentiel', async () => {
    const { admin, engineer, technician } = await setup();
    const project = await createProject(engineer.ctx);
    await app.projectMembers.add(engineer.ctx, project.id, {
      userId: technician.user.id,
      role: 'TECHNICIAN',
    });
    const base = {
      standardVersionId: V.demo,
      key: 'demo.waste_rate',
      value: { kind: 'SCALAR', value: 7, unit: '%' },
      justification: 'Pratique du bureau',
    };
    await app.library.createOrgOverride(admin.ctx, base);
    await app.library.createOrgOverride(admin.ctx, {
      ...base,
      key: 'demo.max_area',
      value: { kind: 'SCALAR', value: 400, unit: 'm2' },
    });

    expect(
      await app.library.createProjectOverride(engineer.ctx, project.id, {
        ...base,
        standardVersionId: V.elec,
        key: 'elec.drop',
      }),
    ).toMatchObject({ ok: false, error: { reason: 'STANDARD_NOT_SELECTED' } });
    expect(await app.library.createProjectOverride(technician.ctx, project.id, base)).toMatchObject(
      { ok: false, error: { kind: 'FORBIDDEN' } },
    );

    const created = await app.library.createProjectOverride(engineer.ctx, project.id, {
      ...base,
      value: { kind: 'SCALAR', value: 9, unit: '%' },
      justification: 'Chantier exigu',
    });
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value).toMatchObject({ scope: 'PROJECT', projectId: project.id });

    const effective = await app.library.effectiveParameters(technician.ctx, project.id, V.demo);
    expect(
      effective.ok &&
        effective.value.map((p) => [p.key, p.origin, p.value, p.verification, p.justification]),
    ).toEqual([
      [
        'demo.waste_rate',
        'PROJECT',
        { kind: 'SCALAR', value: 9, unit: '%' },
        'TO_VERIFY',
        'Chantier exigu',
      ],
      [
        'demo.max_area',
        'ORGANIZATION',
        { kind: 'SCALAR', value: 400, unit: 'm2' },
        'TO_VERIFY',
        'Pratique du bureau',
      ],
      ['demo.cover', 'STANDARD', { kind: 'SCALAR', value: 3, unit: 'm' }, 'TO_VERIFY', null],
    ]);
    const orgOverrides = await app.library.listOrgOverrides(technician.ctx);
    expect(orgOverrides.ok && orgOverrides.value.map((o) => o.key)).toEqual([
      'demo.waste_rate',
      'demo.max_area',
    ]);
    expect(await app.library.effectiveParameters(technician.ctx, project.id, V.elec)).toMatchObject(
      {
        ok: false,
        error: { kind: 'NOT_FOUND' },
      },
    );

    const listed = await app.library.listProjectOverrides(technician.ctx, project.id);
    expect(listed.ok && listed.value.map((o) => o.value)).toEqual([
      { kind: 'SCALAR', value: 9, unit: '%' },
    ]);
    // Une surcharge de projet ne se modifie pas par la route d'organisation, ni depuis un autre projet.
    expect(await app.library.deleteOrgOverride(admin.ctx, created.value.id, 1)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    const other = await createProject(engineer.ctx, { code: 'AUTRE' });
    expect(
      await app.library.deleteProjectOverride(engineer.ctx, other.id, created.value.id, 1),
    ).toMatchObject({ ok: false, error: { kind: 'NOT_FOUND' } });

    expect(
      await app.library.updateProjectOverride(
        engineer.ctx,
        project.id,
        created.value.id,
        { value: { kind: 'SCALAR', value: 10, unit: '%' }, justification: 'Chantier très exigu' },
        1,
      ),
    ).toMatchObject({ ok: true, value: { version: 2 } });
    expect(
      await app.library.deleteProjectOverride(engineer.ctx, project.id, created.value.id, 2),
    ).toEqual({ ok: true, value: undefined });
    expect(activityTypes().filter((t) => t.startsWith('project.parameter'))).toEqual([
      'project.parameter_overridden',
      'project.parameter_overridden',
      'project.parameter_override_removed',
    ]);

    await app.projects.archive(engineer.ctx, project.id, 1);
    expect(await app.library.createProjectOverride(engineer.ctx, project.id, base)).toMatchObject({
      ok: false,
      error: { reason: 'PROJECT_ARCHIVED' },
    });
  });
});

describe('cas limites', () => {
  it('création complète ; métier sans référentiel publié ; modification d’un seul champ', async () => {
    const { owner } = await setup();
    const created = await app.projects.create(owner, {
      ...body,
      description: '  Bâtiment de bureaux ',
      location: 'Dakar',
      startDate: '2026-11-01',
      endDate: '2027-06-30',
      disciplines: ['BTP', 'TOPO'],
    });
    if (!created.ok) throw new Error(created.error.message);
    expect(created.value).toMatchObject({
      description: 'Bâtiment de bureaux',
      location: 'Dakar',
      startDate: '2026-11-01',
      endDate: '2027-06-30',
      disciplines: ['BTP', 'TOPO'],
    });
    const standards = await app.library.projectStandards(owner, created.value.id);
    expect(
      standards.ok && standards.value.items.map((i) => [i.discipline, i.versions.length]),
    ).toEqual([
      ['BTP', 1],
      ['TOPO', 0],
    ]);
    const renamed = await app.projects.update(
      owner,
      created.value.id,
      { ...body, location: 'Thiès', disciplines: ['TOPO', 'BTP'] },
      1,
    );
    expect(renamed).toMatchObject({
      ok: true,
      value: { location: 'Thiès', description: null, version: 2 },
    });
    expect(activityTypes()).toEqual(['project.created', 'project.updated']);
    expect(store.state.activity[1]?.summary).toEqual({
      fields: ['description', 'location', 'startDate', 'endDate'],
    });
    expect(await app.projects.get(owner, 'inconnu')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });

  it('surcharges orphelines ou devenues invalides : ignorées ou signalées, jamais appliquées en silence', async () => {
    const { owner, engineer } = await setup();
    const project = await createProject(engineer.ctx);
    const orphan = {
      organizationId: owner.organization.id,
      projectId: null,
      justification: 'Ancienne donnée',
      createdById: owner.actor.userId,
      version: 1,
      updatedAt: store.now,
    };
    store.state.overrides.push(
      {
        ...orphan,
        id: 'o-1',
        standardVersionId: 'v-disparue',
        key: 'x',
        value: { kind: 'SCALAR', value: 1, unit: 'm' },
      },
      {
        ...orphan,
        id: 'o-2',
        standardVersionId: V.demo,
        key: 'demo.retire',
        value: { kind: 'SCALAR', value: 2, unit: 'm' },
      },
      {
        ...orphan,
        id: 'o-3',
        projectId: project.id,
        standardVersionId: V.demo,
        key: 'demo.cover',
        value: { kind: 'SCALAR', value: 2, unit: '%' },
      },
    );
    const listed = await app.library.listOrgOverrides(owner);
    expect(listed.ok && listed.value.map((o) => [o.key, o.label, o.referenceValue])).toEqual([
      ['demo.retire', 'demo.retire', { kind: 'SCALAR', value: 2, unit: 'm' }],
    ]);
    expect(await app.library.deleteOrgOverride(owner, 'o-1', 1)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.library.effectiveParameters(owner, project.id, V.demo)).toMatchObject({
      ok: false,
      error: { kind: 'VALIDATION', reason: 'PARAMETERS_UNRESOLVABLE' },
    });
  });
});
