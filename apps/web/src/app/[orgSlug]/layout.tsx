import { can } from '@consulpro/domain';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { WorkspaceShell } from '@/features/shell/workspace-shell';
import { getServer } from '@/server/container';
import { requireOrganization } from '@/server/session';

/** Espace de travail d'une organisation (sidebar + en-tête + espace de travail). */
export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const mine = await getServer().infra.app.organizations.listMine(ctx);
  // État de la barre latérale mémorisé par le composant (cookie posé côté client).
  const sidebarState = (await cookies()).get('sidebar_state')?.value;

  return (
    <WorkspaceShell
      organization={{
        id: ctx.organization.id,
        slug: ctx.organization.slug,
        name: ctx.organization.name,
        role: ctx.role,
      }}
      organizations={
        mine.ok ? mine.value.map((o) => ({ id: o.id, slug: o.slug, name: o.name })) : []
      }
      user={{ name: ctx.actor.name, email: ctx.actor.email }}
      canReadAudit={can(ctx.role, 'audit.read')}
      defaultSidebarOpen={sidebarState !== 'false'}
    >
      {children}
    </WorkspaceShell>
  );
}
