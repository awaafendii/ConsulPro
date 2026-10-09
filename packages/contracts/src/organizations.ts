import { z } from 'zod';

import { cursorQuerySchema, orgRoleSchema, pageSchema } from './common';

export const meSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  emailVerified: z.boolean(),
});
export type MeDto = z.infer<typeof meSchema>;

export const createOrganizationBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(3).max(48),
});
export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;

export const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  country: z.string().nullable(),
  currency: z.string(),
  role: orgRoleSchema,
  createdAt: z.iso.datetime(),
});
export type OrganizationDto = z.infer<typeof organizationSchema>;

export const organizationListSchema = z.object({ items: z.array(organizationSchema) });

export const memberSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  name: z.string(),
  email: z.email(),
  role: orgRoleSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type MemberDto = z.infer<typeof memberSchema>;

export const memberListSchema = z.object({ items: z.array(memberSchema) });

export const updateMemberRoleBodySchema = z.object({ role: orgRoleSchema });
export type UpdateMemberRoleBody = z.infer<typeof updateMemberRoleBodySchema>;

export const createInvitationBodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: orgRoleSchema,
});
export type CreateInvitationBody = z.infer<typeof createInvitationBodySchema>;

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: orgRoleSchema,
  status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED']),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type InvitationDto = z.infer<typeof invitationSchema>;

export const invitationListSchema = z.object({ items: z.array(invitationSchema) });

export const acceptInvitationBodySchema = z.object({ token: z.string().min(20).max(200) });
export type AcceptInvitationBody = z.infer<typeof acceptInvitationBodySchema>;

export const auditLogQuerySchema = cursorQuerySchema;

export const auditLogSchema = z.object({
  id: z.uuid(),
  action: z.string(),
  actorUserId: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  requestId: z.string().nullable(),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditLogDto = z.infer<typeof auditLogSchema>;

export const auditLogPageSchema = pageSchema(auditLogSchema);
