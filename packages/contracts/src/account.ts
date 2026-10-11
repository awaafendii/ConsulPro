import { z } from 'zod';

import { cursorQuerySchema, pageSchema } from './common';

/* Compte et espace de travail : notifications, préférences, recherche, propriété (Phase 3). */

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  /** Lien interne (chemin de l'application). */
  link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

export const notificationQuerySchema = cursorQuerySchema.extend({
  unread: z.enum(['true', 'false']).optional(),
});
export const notificationPageSchema = pageSchema(notificationSchema).extend({
  unreadCount: z.number().int().nonnegative(),
});

/** Fuseau horaire IANA (ex. Africa/Abidjan), validé côté serveur. */
export const preferencesBodySchema = z.object({
  timeZone: z.string().min(1).max(64).nullable(),
});
export const preferencesSchema = z.object({
  timeZone: z.string().nullable(),
  /** Fuseau appliqué (préférence, sinon celui de l'application). */
  effectiveTimeZone: z.string(),
  twoFactorEnabled: z.boolean(),
});

export const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(100) });
export const searchResultSchema = z.object({
  items: z.array(
    z.object({
      type: z.enum(['project', 'study', 'calculation']),
      id: z.uuid(),
      title: z.string(),
      subtitle: z.string(),
      href: z.string(),
    }),
  ),
});
export type SearchResultDto = z.infer<typeof searchResultSchema>;

export const transferOwnershipBodySchema = z.object({ membershipId: z.uuid() });
