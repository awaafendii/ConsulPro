import { err, ok } from '@consulpro/calc-core';
import type {
  AuditRecord,
  InvitationRecord,
  MembershipRecord,
  MyOrganization,
  OrganizationRecord,
  Repositories,
} from '@consulpro/application';
import type { Prisma } from '@consulpro/db';

import { createCalculationRepositories } from './calculation-repositories';
import { createProjectRepositories } from './project-repositories';

type Tx = Prisma.TransactionClient;

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  currency: string;
  createdAt: Date;
}

const toOrganization = (o: OrganizationRow): OrganizationRecord => ({
  id: o.id,
  name: o.name,
  slug: o.slug,
  country: o.country,
  currency: o.currency,
  createdAt: o.createdAt,
});

const toMembership = (m: MembershipRecord): MembershipRecord => ({
  id: m.id,
  organizationId: m.organizationId,
  userId: m.userId,
  role: m.role,
  version: m.version,
  createdAt: m.createdAt,
});

const toMyOrganization = (
  m: MembershipRecord & { organization: OrganizationRow },
): MyOrganization => ({
  ...toOrganization(m.organization),
  role: m.role,
  membershipId: m.id,
});

const toInvitation = (i: InvitationRecord): InvitationRecord => ({
  id: i.id,
  organizationId: i.organizationId,
  email: i.email,
  role: i.role,
  tokenHash: i.tokenHash,
  status: i.status,
  expiresAt: i.expiresAt,
  invitedById: i.invitedById,
  createdAt: i.createdAt,
});

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/**
 * Repositories liés à une transaction. Chaque requête filtre explicitement
 * par organisation ; la RLS de PostgreSQL constitue la seconde barrière.
 */
export function createRepositories(tx: Tx): Repositories {
  return {
    ...createProjectRepositories(tx),
    ...createCalculationRepositories(tx),
    organizations: {
      async create({ id, name, slug }) {
        try {
          return ok(toOrganization(await tx.organization.create({ data: { id, name, slug } })));
        } catch (error) {
          if (isUniqueViolation(error)) return err('SLUG_TAKEN' as const);
          throw error;
        }
      },
      async findById(id) {
        const o = await tx.organization.findUnique({ where: { id } });
        return o ? toOrganization(o) : null;
      },
    },

    memberships: {
      async listOrganizationsOfUser(userId) {
        const rows = await tx.membership.findMany({
          where: { userId },
          include: { organization: true },
          orderBy: { organization: { name: 'asc' } },
        });
        return rows.map(toMyOrganization);
      },
      async findOrganizationOfUserBySlug(userId, slug) {
        const m = await tx.membership.findFirst({
          where: { userId, organization: { slug } },
          include: { organization: true },
        });
        return m ? toMyOrganization(m) : null;
      },
      async listMembers(organizationId) {
        const rows = await tx.membership.findMany({
          where: { organizationId },
          include: { user: { select: { name: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        });
        return rows.map((m) => ({ ...toMembership(m), name: m.user.name, email: m.user.email }));
      },
      async findById(organizationId, id) {
        const m = await tx.membership.findFirst({ where: { organizationId, id } });
        return m ? toMembership(m) : null;
      },
      async findByUserId(organizationId, userId) {
        const m = await tx.membership.findFirst({ where: { organizationId, userId } });
        return m ? toMembership(m) : null;
      },
      async findByEmail(organizationId, email) {
        const m = await tx.membership.findFirst({ where: { organizationId, user: { email } } });
        return m ? toMembership(m) : null;
      },
      async create(input) {
        return toMembership(await tx.membership.create({ data: input }));
      },
      async updateRole(organizationId, id, role, version) {
        const { count } = await tx.membership.updateMany({
          where: { organizationId, id, version },
          data: { role, version: { increment: 1 } },
        });
        return count === 1;
      },
      async delete(organizationId, id, version) {
        const { count } = await tx.membership.deleteMany({
          where: { organizationId, id, version },
        });
        return count === 1;
      },
    },

    invitations: {
      async create(input) {
        return toInvitation(await tx.invitation.create({ data: input }));
      },
      async listPending(organizationId, now) {
        const rows = await tx.invitation.findMany({
          where: { organizationId, status: 'PENDING', expiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map(toInvitation);
      },
      async findById(organizationId, id) {
        const i = await tx.invitation.findFirst({ where: { organizationId, id } });
        return i ? toInvitation(i) : null;
      },
      async findPendingByEmail(organizationId, email, now) {
        const i = await tx.invitation.findFirst({
          where: { organizationId, email, status: 'PENDING', expiresAt: { gt: now } },
        });
        return i ? toInvitation(i) : null;
      },
      async findByTokenHash(tokenHash) {
        const i = await tx.invitation.findUnique({ where: { tokenHash } });
        return i ? toInvitation(i) : null;
      },
      async setStatus(organizationId, id, status, at) {
        await tx.invitation.updateMany({
          where: { organizationId, id },
          data: { status, statusAt: at },
        });
      },
    },

    audit: {
      async append(entry) {
        // createMany : pas de RETURNING, la ligne n'a pas à être relisible par l'auteur
        // (une ligne hors organisation n'est lisible par personne via le rôle applicatif).
        await tx.auditLog.createMany({
          data: [
            {
              organizationId: entry.organizationId,
              actorUserId: entry.actorUserId,
              action: entry.action,
              targetType: entry.targetType ?? null,
              targetId: entry.targetId ?? null,
              metadata: (entry.metadata ?? {}) as Prisma.InputJsonObject,
              requestId: entry.requestId ?? null,
              ip: entry.ip ?? null,
              userAgent: entry.userAgent ?? null,
            },
          ],
        });
      },
      async list(organizationId, { cursor, limit }) {
        const rows = await tx.auditLog.findMany({
          where: { organizationId, ...(cursor ? { id: { lt: cursor } } : {}) },
          orderBy: { id: 'desc' },
          take: limit,
        });
        return rows.map((a): AuditRecord => ({
          id: a.id,
          organizationId: a.organizationId,
          actorUserId: a.actorUserId,
          action: a.action,
          targetType: a.targetType,
          targetId: a.targetId,
          metadata: (a.metadata ?? {}) as Record<string, unknown>,
          requestId: a.requestId,
          ip: a.ip,
          createdAt: a.createdAt,
        }));
      },
    },
  };
}
