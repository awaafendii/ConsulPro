import { can, isQuantityDiscipline } from '@consulpro/domain';
import { Callout, ErrorState, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { boqSummaryDto } from '@/server/http/presenters-quantities';
import { requireProject } from '@/server/project';

import { BoqsView } from './boqs-view';

type Params = Promise<{ orgSlug: string; projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${(await getTranslations('project.tabs'))('quantities')} — ${project.code}` };
}

/** Quantitatifs (DQE) du projet. */
export default async function BoqsPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const t = await getTranslations('boq');
  const tTabs = await getTranslations('project.tabs');
  if (!project.disciplines.some(isQuantityDiscipline)) {
    return <Callout tone="info">{t('inactive')}</Callout>;
  }
  const { app } = getServer().infra;
  const boqs = await app.boqs.list(ctx, project.id);
  const takeoff = await app.takeoff.get(ctx, project.id);
  const organizations = await app.organizations.listMine(ctx);
  if (!boqs.ok || !takeoff.ok) {
    const error = !boqs.ok ? boqs.error : !takeoff.ok ? takeoff.error : null;
    return <ErrorState message={error?.message ?? ''} requestId={ctx.meta.requestId} />;
  }
  const currency =
    (organizations.ok
      ? organizations.value.find((o) => o.id === ctx.organization.id)?.currency
      : undefined) ?? 'XOF';

  return (
    <Section title={tTabs('quantities')} description={t('description')}>
      <BoqsView
        orgSlug={ctx.organization.slug}
        projectId={project.id}
        canManage={project.status === 'ACTIVE' && can(project.role, 'boq.manage')}
        hasTakeoff={takeoff.value.nodes.length > 0}
        defaultCurrency={currency}
        boqs={boqs.value.map(boqSummaryDto)}
      />
    </Section>
  );
}
