import { ErrorState } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { activityDto } from '@/server/http/presenters';
import { requireProject } from '@/server/project';

import { ActivityFeed } from './activity-feed';

type Params = Promise<{ orgSlug: string; projectId: string }>;

const PAGE_SIZE = 30;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${(await getTranslations('project.tabs'))('activity')} — ${project.code}` };
}

export default async function ProjectActivityPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const page = await getServer().infra.app.projects.activity(ctx, project.id, {
    limit: PAGE_SIZE,
  });
  if (!page.ok) return <ErrorState message={page.error.message} requestId={ctx.meta.requestId} />;

  return (
    <ActivityFeed
      path={`/organizations/${ctx.organization.slug}/projects/${project.id}/activity`}
      pageSize={PAGE_SIZE}
      initialItems={page.value.items.map(activityDto)}
      initialCursor={page.value.nextCursor}
    />
  );
}
