import { can } from '@consulpro/domain';
import { ErrorState, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { datasetDto, datasetKindDto } from '@/server/http/presenters';
import { requireProject } from '@/server/project';

import { DatasetsView } from './datasets-view';

type Params = Promise<{ orgSlug: string; projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${(await getTranslations('project.tabs'))('data')} — ${project.code}` };
}

export default async function DatasetsPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const { app } = getServer().infra;
  const t = await getTranslations('datasets');
  const tTabs = await getTranslations('project.tabs');
  const datasets = await app.datasets.list(ctx, project.id);
  const kinds = await app.datasets.kinds(ctx, project.id);
  if (!datasets.ok || !kinds.ok) {
    const error = !datasets.ok ? datasets.error : !kinds.ok ? kinds.error : null;
    return <ErrorState message={error?.message ?? ''} requestId={ctx.meta.requestId} />;
  }

  return (
    <Section title={tTabs('data')} description={t('description')}>
      <DatasetsView
        orgSlug={ctx.organization.slug}
        projectId={project.id}
        canCreate={project.status === 'ACTIVE' && can(project.role, 'dataset.write')}
        datasets={datasets.value.map(datasetDto)}
        kinds={kinds.value.map(datasetKindDto)}
      />
    </Section>
  );
}
