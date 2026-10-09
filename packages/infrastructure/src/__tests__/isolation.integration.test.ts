import { err, ok } from '@consulpro/calc-core';
import { createApplication, type Application, type OrgContext } from '@consulpro/application';
import { createDatabase, type Database } from '@consulpro/db';
import { adminQuery, unique } from '@consulpro/test-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MemoryMailer } from '../mail/smtp-mailer';
import { createUnitOfWork } from '../persistence/unit-of-work';
import { systemClock, tokenService, uuidV7Generator } from '../system/services';
import { createUser, ctxOf, database, type TestUser } from './helpers';

let db: Database;
let app: Application;
let mailer: MemoryMailer;
let alice: TestUser;
let bob: TestUser;
let orgA: OrgContext;
let orgB: OrgContext;

async function newOrg(owner: TestUser): Promise<OrgContext> {
  const slug = unique('org');
  const created = await app.organizations.create(ctxOf(owner), {
    name: `Organisation ${slug}`,
    slug,
  });
  if (!created.ok) throw new Error(created.error.message);
  const ctx = await app.organizations.resolveContext(ctxOf(owner), slug);
  if (!ctx.ok) throw new Error(ctx.error.message);
  return ctx.value;
}

/** Transaction brute avec un contexte RLS donné, SANS les filtres applicatifs des repositories. */
async function raw<T>(
  scope: { org?: string; user?: string; email?: string },
  fn: (tx: Parameters<Parameters<Database['$transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.organization_id', ${scope.org ?? ''}, true),
                              set_config('app.user_id', ${scope.user ?? ''}, true),
                              set_config('app.user_email', ${scope.email ?? ''}, true)`;
    return fn(tx);
  });
}

beforeAll(async () => {
  db = createDatabase(database().appUrl, { max: 4 });
  mailer = new MemoryMailer();
  app = createApplication({
    uow: createUnitOfWork(db),
    mailer,
    tokens: tokenService,
    clock: systemClock,
    ids: uuidV7Generator,
    appUrl: 'http://localhost:3000',
  });
  alice = await createUser('alice');
  bob = await createUser('bob');
  orgA = await newOrg(alice);
  orgB = await newOrg(bob);
  const invited = await app.invitations.create(orgB, {
    email: 'pending@consulpro.test',
    role: 'VIEWER',
  });
  if (!invited.ok) throw new Error(invited.error.message);
});

afterAll(async () => {
  await db.$disconnect();
});

describe('rôle applicatif', () => {
  it('n’est ni superutilisateur ni exempté de RLS', async () => {
    const rows = await db.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });
});

describe('RLS — lecture', () => {
  it('sans contexte, aucune donnée d’organisation n’est visible', async () => {
    const counts = await raw({}, async (tx) => ({
      organizations: await tx.organization.count(),
      memberships: await tx.membership.count(),
      invitations: await tx.invitation.count(),
      audit: await tx.auditLog.count(),
    }));
    expect(counts).toEqual({ organizations: 0, memberships: 0, invitations: 0, audit: 0 });
  });

  it('dans le contexte de A, seules les lignes de A sont visibles (sans filtre applicatif)', async () => {
    const seen = await raw({ org: orgA.organization.id }, async (tx) => ({
      organizations: (await tx.organization.findMany()).map((o) => o.id),
      memberships: [...new Set((await tx.membership.findMany()).map((m) => m.organizationId))],
      invitations: await tx.invitation.count(),
      audit: [...new Set((await tx.auditLog.findMany()).map((a) => a.organizationId))],
    }));
    expect(seen).toEqual({
      organizations: [orgA.organization.id],
      memberships: [orgA.organization.id],
      invitations: 0,
      audit: [orgA.organization.id],
    });
  });

  it('en portée utilisateur, on ne voit que ses propres organisations', async () => {
    const orgs = await raw({ user: alice.id }, async (tx) =>
      (await tx.organization.findMany()).map((o) => o.id),
    );
    expect(orgs).toEqual([orgA.organization.id]);
  });

  it('une invitation n’est visible hors organisation que par l’adresse invitée', async () => {
    expect(await raw({ email: 'pending@consulpro.test' }, (tx) => tx.invitation.count())).toBe(1);
    expect(await raw({ email: alice.email }, (tx) => tx.invitation.count())).toBe(0);
  });

  it('le repository ne retrouve pas une ressource d’une autre organisation par identifiant (IDOR)', async () => {
    const found = await createUnitOfWork(db).run(
      { organizationId: orgA.organization.id, userId: alice.id, userEmail: alice.email },
      async (repos) =>
        ok(await repos.memberships.findById(orgB.organization.id, orgB.membershipId)),
    );
    expect(found).toEqual({ ok: true, value: null });
  });
});

describe('RLS — écriture', () => {
  it('impossible d’insérer une adhésion dans une autre organisation', async () => {
    await expect(
      raw({ org: orgA.organization.id }, (tx) =>
        tx.membership.create({
          data: {
            id: uuidV7Generator.next(),
            organizationId: orgB.organization.id,
            userId: alice.id,
            role: 'ADMIN',
          },
        }),
      ),
    ).rejects.toThrow();
    const members = await adminQuery<{ n: string }>(
      database().adminUrl,
      'SELECT count(*)::text AS n FROM memberships WHERE organization_id = $1',
      [orgB.organization.id],
    );
    expect(members[0]?.n).toBe('1');
  });

  it('une modification ciblant une autre organisation n’affecte aucune ligne', async () => {
    const updated = await raw({ org: orgA.organization.id }, (tx) =>
      tx.membership.updateMany({ where: { id: orgB.membershipId }, data: { role: 'VIEWER' } }),
    );
    expect(updated.count).toBe(0);
    const deleted = await raw({ org: orgA.organization.id }, (tx) =>
      tx.organization.deleteMany({ where: { id: orgB.organization.id } }),
    );
    expect(deleted.count).toBe(0);
  });

  it('impossible d’écrire une ligne d’audit au nom d’une autre organisation', async () => {
    await expect(
      raw({ org: orgA.organization.id }, (tx) =>
        tx.auditLog.createMany({
          data: [{ organizationId: orgB.organization.id, action: 'organization.created' }],
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('journal d’audit immuable', () => {
  it('le rôle applicatif ne peut ni modifier ni supprimer', async () => {
    await expect(
      raw(
        { org: orgA.organization.id },
        (tx) => tx.$executeRaw`UPDATE audit_logs SET action = 'x'`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      raw({ org: orgA.organization.id }, (tx) => tx.$executeRaw`DELETE FROM audit_logs`),
    ).rejects.toThrow(/permission denied/i);
  });

  it('même le propriétaire de la base est bloqué par le trigger', async () => {
    await expect(
      adminQuery(database().adminUrl, `UPDATE audit_logs SET action = 'x'`),
    ).rejects.toThrow(/ajout seul/);
    await expect(adminQuery(database().adminUrl, 'DELETE FROM audit_logs')).rejects.toThrow(
      /ajout seul/,
    );
    await expect(adminQuery(database().adminUrl, 'TRUNCATE audit_logs')).rejects.toThrow(
      /ajout seul/,
    );
  });

  it('chaque mutation de la Phase 1 a laissé sa trace, dans la même transaction', async () => {
    const actions = await adminQuery<{ action: string }>(
      database().adminUrl,
      'SELECT action FROM audit_logs WHERE organization_id = $1 ORDER BY id',
      [orgB.organization.id],
    );
    expect(actions.map((a) => a.action)).toEqual(['organization.created', 'invitation.created']);
  });
});

describe('unité de travail', () => {
  it('une erreur métier annule toutes les écritures de la transaction', async () => {
    const id = uuidV7Generator.next();
    const result = await createUnitOfWork(db).run(
      { organizationId: id, userId: alice.id, userEmail: alice.email },
      async (repos) => {
        await repos.organizations.create({ id, name: 'Annulée', slug: unique('rollback') });
        return err('ABANDON' as const);
      },
    );
    expect(result).toEqual({ ok: false, error: 'ABANDON' });
    const rows = await adminQuery(
      database().adminUrl,
      'SELECT 1 FROM organizations WHERE id = $1',
      [id],
    );
    expect(rows).toHaveLength(0);
  });

  it('un identifiant d’organisation déjà pris est signalé sans exception', async () => {
    const other = await app.organizations.create(ctxOf(alice), {
      name: 'Copie',
      slug: orgB.organization.slug,
    });
    expect(other).toMatchObject({ ok: false, error: { reason: 'ORGANIZATION_SLUG_TAKEN' } });
  });
});

describe('services applicatifs sur PostgreSQL', () => {
  it('invitation acceptée de bout en bout, membres et audit cohérents', async () => {
    const carol = await createUser('carol');
    const invited = await app.invitations.create(orgA, { email: carol.email, role: 'ENGINEER' });
    expect(invited.ok).toBe(true);
    const token = /invitation\/(\S+)/.exec(mailer.sent.at(-1)?.text ?? '')?.[1] ?? '';
    expect(await app.invitations.accept(ctxOf(bob), token)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    const accepted = await app.invitations.accept(ctxOf(carol), token);
    expect(accepted).toMatchObject({ ok: true, value: { id: orgA.organization.id } });

    const members = await app.members.list(orgA);
    expect(members.ok && members.value.map((m) => [m.email, m.role])).toEqual([
      [alice.email, 'OWNER'],
      [carol.email, 'ENGINEER'],
    ]);
    const page = await app.audit.list(orgA, { limit: 10 });
    expect(page.ok && page.value.items.map((a) => a.action)).toEqual([
      'invitation.accepted',
      'invitation.created',
      'organization.created',
    ]);
  });
});
