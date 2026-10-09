import { z } from 'zod';

/** Rôles d'organisation (doit rester identique à `ORG_ROLES` du domaine, vérifié par test). */
export const orgRoleSchema = z.enum([
  'OWNER',
  'ADMIN',
  'ENGINEER',
  'TECHNICIAN',
  'COLLABORATOR',
  'VIEWER',
]);
export type OrgRoleDto = z.infer<typeof orgRoleSchema>;

export const uuidSchema = z.uuid();

/** Erreur API au format RFC 9457 (application/problem+json). */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string(),
  requestId: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })).optional(),
});
export type Problem = z.infer<typeof problemSchema>;

export const cursorQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.uuid().nullable() });
}
