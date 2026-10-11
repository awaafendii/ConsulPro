import { can } from '@consulpro/domain';
import { ErrorState } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { projectMemberDto } from '@/server/http/presenters';
import { requireProject } from '@/server/project';

import { ProjectMembersView } from './project-members-view';

type Params = Promise<{ orgSlug: string; projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${(await getTranslations('project.tabs'))('members')} — ${project.code}` };
}

export default async function ProjectMembersPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const { app } = getServer().infra;
  const canManage = can(project.role, 'project.member.manage') && project.status === 'ACTIVE';

  const members = await app.projectMembers.list(ctx, project.id);
  if (!members.ok) {
    return <ErrorState message={members.error.message} requestId={ctx.meta.requestId} />;
  }
  const organization = canManage ? await app.members.list(ctx) : null;
  const assigned = new Set(members.value.map((m) => m.userId));
  // Owner et Admin voient déjà tous les projets : ils ne sont pas proposés.
  const candidates =
    organization?.ok === true
      ? organization.value
          .filter((m) => m.role !== 'OWNER' && m.role !== 'ADMIN' && !assigned.has(m.userId))
          .map((m) => ({ userId: m.userId, name: m.name, email: m.email, role: m.role }))
      : [];

  return (
    <ProjectMembersView
      orgSlug={ctx.organization.slug}
      projectId={project.id}
      canManage={canManage}
      members={members.value.map(projectMemberDto)}
      candidates={candidates}
    />
  );
}
