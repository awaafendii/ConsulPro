/** Clés TanStack Query centralisées (05-conventions §7). */
export const queryKeys = {
  members: (orgSlug: string) => ['organization', orgSlug, 'members'] as const,
  invitations: (orgSlug: string) => ['organization', orgSlug, 'invitations'] as const,
};
