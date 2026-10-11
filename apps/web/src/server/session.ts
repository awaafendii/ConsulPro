import { randomUUID } from 'node:crypto';

import type { OrgContext, UserContext } from '@consulpro/application';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { actorFromSession } from './actor';
import { getServer } from './container';

/** Utilisateur de la session courante (Server Components), ou `null`. */
export async function currentUserContext(): Promise<UserContext | null> {
  const requestHeaders = await headers();
  const session = await getServer().infra.auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return {
    actor: actorFromSession(session.user),
    meta: {
      requestId: randomUUID(),
      ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: requestHeaders.get('user-agent'),
    },
  };
}

export async function requireUser(redirectTo?: string): Promise<UserContext> {
  const ctx = await currentUserContext();
  if (!ctx)
    redirect(redirectTo ? `/connexion?redirect=${encodeURIComponent(redirectTo)}` : '/connexion');
  return ctx;
}

/** Contexte d'organisation ; un non-membre obtient une page 404. */
export async function requireOrganization(slug: string): Promise<OrgContext> {
  const user = await requireUser(`/${slug}/tableau-de-bord`);
  const resolved = await getServer().infra.app.organizations.resolveContext(user, slug);
  if (!resolved.ok) notFound();
  return resolved.value;
}
