import type {
  AuditRecord,
  InvitationRecord,
  MemberView,
  MyOrganization,
  OrganizationRecord,
} from '@consulpro/application';
import type { AuditLogDto, InvitationDto, MemberDto, OrganizationDto } from '@consulpro/contracts';

/** Conversion des enregistrements applicatifs en DTO d'API (dates ISO 8601 UTC). */

export const organizationDto = (o: MyOrganization): OrganizationDto => ({
  id: o.id,
  name: o.name,
  slug: o.slug,
  country: o.country,
  currency: o.currency,
  role: o.role,
  createdAt: o.createdAt.toISOString(),
});

export const organizationRefDto = (o: OrganizationRecord) => ({
  id: o.id,
  name: o.name,
  slug: o.slug,
});

export const memberDto = (m: MemberView): MemberDto => ({
  id: m.id,
  userId: m.userId,
  name: m.name,
  email: m.email,
  role: m.role,
  version: m.version,
  createdAt: m.createdAt.toISOString(),
});

export const invitationDto = (i: InvitationRecord): InvitationDto => ({
  id: i.id,
  email: i.email,
  role: i.role,
  status: i.status,
  expiresAt: i.expiresAt.toISOString(),
  createdAt: i.createdAt.toISOString(),
});

export const auditLogDto = (a: AuditRecord): AuditLogDto => ({
  id: a.id,
  action: a.action,
  actorUserId: a.actorUserId,
  targetType: a.targetType,
  targetId: a.targetId,
  metadata: { ...a.metadata },
  requestId: a.requestId,
  ip: a.ip,
  createdAt: a.createdAt.toISOString(),
});
