import { z } from 'zod';

import { cursorQuerySchema, orgRoleSchema, pageSchema } from './common';

export const disciplineSchema = z.enum(['BTP', 'ELEC', 'PLUMBING', 'TOPO']);
export type DisciplineDto = z.infer<typeof disciplineSchema>;

export const projectRoleSchema = z.enum(['ENGINEER', 'TECHNICIAN', 'COLLABORATOR', 'VIEWER']);
export type ProjectRoleDto = z.infer<typeof projectRoleSchema>;

export const projectStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);

const isoDate = z.iso.date();
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const projectBodySchema = z.object({
  code: z.string().trim().min(2).max(24),
  name: z.string().trim().min(2).max(160),
  description: optionalText(2000),
  client: optionalText(200),
  location: optionalText(200),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  disciplines: z.array(disciplineSchema).min(1),
});
export type ProjectBody = z.infer<typeof projectBodySchema>;

export const projectListQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
});

export const projectSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  client: z.string().nullable(),
  location: z.string().nullable(),
  status: projectStatusSchema,
  startDate: isoDate.nullable(),
  endDate: isoDate.nullable(),
  disciplines: z.array(disciplineSchema),
  /** Rôle effectif de l'utilisateur courant sur ce projet. */
  role: orgRoleSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const projectListSchema = z.object({ items: z.array(projectSchema) });

export const projectMemberSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: projectRoleSchema,
  organizationRole: orgRoleSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type ProjectMemberDto = z.infer<typeof projectMemberSchema>;

export const projectMemberListSchema = z.object({ items: z.array(projectMemberSchema) });

export const addProjectMemberBodySchema = z.object({
  userId: z.string().min(1),
  role: projectRoleSchema,
});
export const updateProjectMemberBodySchema = z.object({ role: projectRoleSchema });

export const activitySchema = z.object({
  id: z.uuid(),
  type: z.string(),
  actorUserId: z.string().nullable(),
  actorName: z.string().nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  summary: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type ActivityDto = z.infer<typeof activitySchema>;

export const activityQuerySchema = cursorQuerySchema;
export const activityPageSchema = pageSchema(activitySchema);
