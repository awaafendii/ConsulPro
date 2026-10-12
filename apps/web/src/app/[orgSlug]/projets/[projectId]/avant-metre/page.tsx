import { can } from '@consulpro/domain';
import { Callout, ErrorState, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { takeoffDto } from '@/server/http/presenters-quantities';
import { requireProject } from '@/server/project';

import { TakeoffView } from './takeoff-view';

type Params = Promise<{ orgSlug: string; projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${(await getTranslations('project.tabs'))('takeoff')} — ${project.code}` };
}

/** Avant-métré du projet : structure des ouvrages et rattachement des calculs BTP. */
export default async function TakeoffPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const t = await getTranslations('takeoff');
  const tTabs = await getTranslations('project.tabs');
  if (!project.disciplines.includes('BTP')) {
    return <Callout tone="info">{t('inactive')}</Callout>;
  }
  const takeoff = await getServer().infra.app.takeoff.get(ctx, project.id);
  if (!takeoff.ok) {
    return <ErrorState message={takeoff.error.message} requestId={ctx.meta.requestId} />;
  }

  return (
    <Section title={tTabs('takeoff')} description={t('description')}>
      <TakeoffView
        orgSlug={ctx.organization.slug}
        projectId={project.id}
        canManage={project.status === 'ACTIVE' && can(project.role, 'boq.manage')}
        takeoff={takeoffDto(takeoff.value)}
      />
    </Section>
  );
}
