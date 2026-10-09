import { orgRoleSchema } from '@consulpro/contracts';
import { ORG_ROLES, type OrgRole } from '@consulpro/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import { createApplication, type Application, type OrgContext } from '../index';
import { InMemoryStore, userContext } from './in-memory';

let store: InMemoryStore;
let app: Application;

beforeEach(() => {
  store = new InMemoryStore();
  app = createApplication(store.deps());
});

async function orgWithOwner(slug = 'bet-sahel') {
  const owner = store.addUser('owner@bet.test', 'Awa Owner');
  const created = await app.organizations.create(userContext(owner), { name: 'BET Sahel', slug });
  if (!created.ok) throw new Error(created.error.message);
  const ctx = await app.organizations.resolveContext(userContext(owner), slug);
  if (!ctx.ok) throw new Error(ctx.error.message);
  return { owner, ownerCtx: ctx.value, organization: created.value };
}

async function addMember(ownerCtx: OrgContext, email: string, role: OrgRole) {
  const user = store.addUser(email);
  const invited = await app.invitations.create(ownerCtx, { email, role });
  if (!invited.ok) throw new Error(invited.error.message);
  const token = /invitation\/(\S+)/.exec(store.sentMail.at(-1)?.text ?? '')?.[1] ?? '';
  const accepted = await app.invitations.accept(userContext(user), token);
  if (!accepted.ok) throw new Error(accepted.error.message);
  const ctx = await app.organizations.resolveContext(userContext(user), ownerCtx.organization.slug);
  if (!ctx.ok) throw new Error(ctx.error.message);
  return { user, ctx: ctx.value };
}

describe('contrats', () => {
  it('les rôles des contrats API sont ceux du domaine', () => {
    expect(orgRoleSchema.options).toEqual([...ORG_ROLES]);
  });
});

describe('organisations', () => {
  it('le créateur devient propriétaire ; création auditée', async () => {
    const { owner, ownerCtx, organization } = await orgWithOwner();
    expect(organization.role).toBe('OWNER');
    expect(ownerCtx.role).toBe('OWNER');
    const mine = await app.organizations.listMine(userContext(owner));
    expect(mine.ok && mine.value.map((o) => o.slug)).toEqual(['bet-sahel']);
    expect(store.state.audit.map((a) => a.action)).toEqual(['organization.created']);
  });

  it('refuse un identifiant invalide ou déjà pris, sans écriture', async () => {
    await orgWithOwner();
    const other = store.addUser('other@x.test');
    const invalid = await app.organizations.create(userContext(other), {
      name: 'X Y',
      slug: 'X Y',
    });
    expect(invalid).toMatchObject({
      ok: false,
      error: { kind: 'VALIDATION', reason: 'ORGANIZATION_SLUG_INVALID' },
    });
    const taken = await app.organizations.create(userContext(other), {
      name: 'Autre',
      slug: 'bet-sahel',
    });
    expect(taken).toMatchObject({
      ok: false,
      error: { kind: 'CONFLICT', reason: 'ORGANIZATION_SLUG_TAKEN' },
    });
    const reserved = await app.organizations.create(userContext(other), {
      name: 'Autre',
      slug: 'api',
    });
    expect(reserved).toMatchObject({
      ok: false,
      error: { kind: 'VALIDATION', reason: 'ORGANIZATION_SLUG_RESERVED' },
    });
    expect(store.state.organizations).toHaveLength(1);
  });

  it('un non-membre ne résout pas le contexte (404, existence non révélée)', async () => {
    await orgWithOwner();
    const stranger = store.addUser('stranger@x.test');
    expect(
      await app.organizations.resolveContext(userContext(stranger), 'bet-sahel'),
    ).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
  });
});

describe('membres', () => {
  it('tout membre liste les membres', async () => {
    const { ownerCtx } = await orgWithOwner();
    const { ctx } = await addMember(ownerCtx, 'viewer@x.test', 'VIEWER');
    const list = await app.members.list(ctx);
    expect(list.ok && list.value.map((m) => m.role)).toEqual(['OWNER', 'VIEWER']);
  });

  it('changement de rôle par l’administrateur, audité, version incrémentée ; sans effet si identique', async () => {
    const { ownerCtx } = await orgWithOwner();
    const admin = await addMember(ownerCtx, 'admin@x.test', 'ADMIN');
    const tech = await addMember(ownerCtx, 'tech@x.test', 'TECHNICIAN');
    expect(await app.members.changeRole(admin.ctx, tech.ctx.membershipId, 'ENGINEER', 1)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    const before = store.state.audit.length;
    expect(await app.members.changeRole(admin.ctx, tech.ctx.membershipId, 'ENGINEER', 2)).toEqual({
      ok: true,
      value: { version: 2 },
    });
    expect(store.state.audit.length).toBe(before);
    expect(
      store.state.audit.find((a) => a.action === 'member.role_changed')?.metadata,
    ).toMatchObject({
      from: 'TECHNICIAN',
      to: 'ENGINEER',
    });
  });

  it('version périmée (modification concurrente) : refus 412, aucune écriture', async () => {
    const { ownerCtx } = await orgWithOwner();
    const tech = await addMember(ownerCtx, 'tech@x.test', 'TECHNICIAN');
    expect((await app.members.changeRole(ownerCtx, tech.ctx.membershipId, 'ENGINEER', 1)).ok).toBe(
      true,
    );
    expect(
      await app.members.changeRole(ownerCtx, tech.ctx.membershipId, 'VIEWER', 1),
    ).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED', reason: 'VERSION_MISMATCH' },
    });
    expect(await app.members.remove(ownerCtx, tech.ctx.membershipId, 1)).toMatchObject({
      ok: false,
      error: { kind: 'PRECONDITION_FAILED' },
    });
    expect(store.state.memberships.find((m) => m.id === tech.ctx.membershipId)?.role).toBe(
      'ENGINEER',
    );
  });

  it('refus : permission, membre inconnu, propriétaire protégé', async () => {
    const { ownerCtx } = await orgWithOwner();
    const admin = await addMember(ownerCtx, 'admin@x.test', 'ADMIN');
    const eng = await addMember(ownerCtx, 'eng@x.test', 'ENGINEER');
    expect(
      await app.members.changeRole(eng.ctx, admin.ctx.membershipId, 'VIEWER', 1),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });
    expect(await app.members.changeRole(admin.ctx, 'inconnu', 'VIEWER', 1)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(
      await app.members.changeRole(admin.ctx, ownerCtx.membershipId, 'VIEWER', 1),
    ).toMatchObject({
      ok: false,
      error: { kind: 'POLICY_VIOLATION', reason: 'OWNER_PROTECTED' },
    });
  });

  it('retrait d’un membre audité ; refus symétriques', async () => {
    const { ownerCtx } = await orgWithOwner();
    const eng = await addMember(ownerCtx, 'eng@x.test', 'ENGINEER');
    expect(await app.members.remove(eng.ctx, ownerCtx.membershipId, 1)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(await app.members.remove(ownerCtx, 'inconnu', 1)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.members.remove(ownerCtx, ownerCtx.membershipId, 1)).toMatchObject({
      ok: false,
      error: { reason: 'SELF_REMOVAL' },
    });
    expect((await app.members.remove(ownerCtx, eng.ctx.membershipId, 1)).ok).toBe(true);
    expect(store.state.memberships).toHaveLength(1);
    expect(store.state.audit.at(-1)?.action).toBe('member.removed');
  });
});

describe('invitations', () => {
  it('cycle complet : invitation, e-mail, acceptation, audit', async () => {
    const { ownerCtx } = await orgWithOwner();
    const { user } = await addMember(ownerCtx, 'new@x.test', 'TECHNICIAN');
    expect(store.sentMail[0]).toMatchObject({
      to: 'new@x.test',
      subject: expect.stringContaining('BET Sahel') as unknown,
    });
    expect(store.sentMail[0]?.text).toContain('Technicien');
    expect(store.state.memberships.find((m) => m.userId === user.id)?.role).toBe('TECHNICIAN');
    expect(store.state.audit.map((a) => a.action)).toEqual([
      'organization.created',
      'invitation.created',
      'invitation.accepted',
    ]);
    expect(JSON.stringify(store.state.audit)).not.toContain('token-');
  });

  it('refus à la création : permission, rôle OWNER, déjà membre, déjà invité', async () => {
    const { ownerCtx } = await orgWithOwner();
    const eng = await addMember(ownerCtx, 'eng@x.test', 'ENGINEER');
    expect(
      await app.invitations.create(eng.ctx, { email: 'a@x.test', role: 'VIEWER' }),
    ).toMatchObject({ ok: false, error: { kind: 'FORBIDDEN' } });
    expect(
      await app.invitations.create(ownerCtx, { email: 'a@x.test', role: 'OWNER' }),
    ).toMatchObject({ ok: false, error: { reason: 'ROLE_NOT_ASSIGNABLE' } });
    expect(
      await app.invitations.create(ownerCtx, { email: 'ENG@x.test ', role: 'VIEWER' }),
    ).toMatchObject({ ok: false, error: { reason: 'ALREADY_MEMBER' } });
    expect((await app.invitations.create(ownerCtx, { email: 'a@x.test', role: 'VIEWER' })).ok).toBe(
      true,
    );
    expect(
      await app.invitations.create(ownerCtx, { email: 'a@x.test', role: 'VIEWER' }),
    ).toMatchObject({ ok: false, error: { reason: 'INVITATION_PENDING' } });
  });

  it('échec d’envoi de l’e-mail : invitation annulée (transaction)', async () => {
    const { ownerCtx } = await orgWithOwner();
    store.failMail = true;
    await expect(
      app.invitations.create(ownerCtx, { email: 'a@x.test', role: 'VIEWER' }),
    ).rejects.toThrow('SMTP');
    expect(store.state.invitations).toHaveLength(0);
    expect(store.state.audit.map((a) => a.action)).toEqual(['organization.created']);
  });

  it('acceptation refusée : autre adresse, révoquée, expirée, déjà membre', async () => {
    const { ownerCtx } = await orgWithOwner();
    const invitee = store.addUser('invitee@x.test');
    const intruder = store.addUser('intruder@x.test');
    await app.invitations.create(ownerCtx, { email: 'invitee@x.test', role: 'VIEWER' });
    const token = /invitation\/(\S+)/.exec(store.sentMail.at(-1)?.text ?? '')?.[1] ?? '';

    expect(await app.invitations.accept(userContext(intruder), token)).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.invitations.accept(userContext(invitee), 'jeton-inconnu')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });

    store.now = new Date('2026-10-20T00:00:00.000Z');
    expect(await app.invitations.accept(userContext(invitee), token)).toMatchObject({
      ok: false,
      error: { reason: 'INVITATION_EXPIRED' },
    });
    store.now = new Date('2026-10-08T09:00:00.000Z');

    const pending = await app.invitations.list(ownerCtx);
    expect(pending.ok && pending.value).toHaveLength(1);
    const id = pending.ok ? (pending.value[0]?.id ?? '') : '';
    expect((await app.invitations.revoke(ownerCtx, id)).ok).toBe(true);
    expect(await app.invitations.revoke(ownerCtx, id)).toMatchObject({
      ok: false,
      error: { reason: 'INVITATION_NOT_PENDING' },
    });
    expect(await app.invitations.revoke(ownerCtx, 'inconnue')).toMatchObject({
      ok: false,
      error: { kind: 'NOT_FOUND' },
    });
    expect(await app.invitations.accept(userContext(invitee), token)).toMatchObject({
      ok: false,
      error: { kind: 'GONE' },
    });
  });

  it('acceptation par un membre existant : conflit', async () => {
    const { ownerCtx, owner } = await orgWithOwner();
    // Invitation créée directement (contourne la règle « déjà membre » pour simuler une course).
    store.state.invitations.push({
      id: 'inv-race',
      organizationId: ownerCtx.organization.id,
      email: owner.email,
      role: 'VIEWER',
      tokenHash: 'hash:race',
      status: 'PENDING',
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
      invitedById: owner.id,
      createdAt: store.now,
    });
    expect(await app.invitations.accept(userContext(owner), 'race')).toMatchObject({
      ok: false,
      error: { reason: 'ALREADY_MEMBER' },
    });
  });

  it('liste et révocation réservées aux gestionnaires', async () => {
    const { ownerCtx } = await orgWithOwner();
    const viewer = await addMember(ownerCtx, 'v@x.test', 'VIEWER');
    expect(await app.invitations.list(viewer.ctx)).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
    expect(await app.invitations.revoke(viewer.ctx, 'x')).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });
  });
});

describe('journal d’audit', () => {
  it('lecture paginée réservée à Owner et Admin', async () => {
    const { ownerCtx } = await orgWithOwner();
    const viewer = await addMember(ownerCtx, 'v@x.test', 'VIEWER');
    expect(await app.audit.list(viewer.ctx, { limit: 10 })).toMatchObject({
      ok: false,
      error: { kind: 'FORBIDDEN' },
    });

    const first = await app.audit.list(ownerCtx, { limit: 2 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.items.map((a) => a.action)).toEqual([
      'invitation.accepted',
      'invitation.created',
    ]);
    expect(first.value.nextCursor).not.toBeNull();
    const second = await app.audit.list(ownerCtx, {
      limit: 2,
      cursor: first.value.nextCursor ?? undefined,
    });
    expect(second.ok && second.value.items.map((a) => a.action)).toEqual(['organization.created']);
    expect(second.ok && second.value.nextCursor).toBeNull();
  });

  it('événements d’authentification hors organisation', async () => {
    await app.audit.recordAuthEvent({
      actorUserId: 'u1',
      action: 'auth.sign_in',
      userEmail: 'a@x.test',
      ip: '10.0.0.1',
    });
    await app.audit.recordAuthEvent({ actorUserId: null, action: 'auth.sign_in_failed' });
    expect(store.state.audit.map((a) => [a.action, a.organizationId])).toEqual([
      ['auth.sign_in', null],
      ['auth.sign_in_failed', null],
    ]);
  });
});
