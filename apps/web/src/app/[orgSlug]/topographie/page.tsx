import { Callout, ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { topographyDashboardDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { TopographyDashboardView } from './topo-dashboard-view';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('topography'))('title') };
}

/** Tableau de bord Topographie : jeux de points, cheminements, fermetures hors tolérance. */
export default async function TopographyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('topography');
  const dashboard = await getServer().infra.app.topographyDashboard.get(ctx);
  if (!dashboard.ok) {
    return (
      <>
        <PageHeader title={t('title')} description={t('description')} />
        <ErrorState message={dashboard.error.message} requestId={ctx.meta.requestId} />
      </>
    );
  }
  const { engines } = dashboard.value;

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {engines.checkedCases < engines.cases && (
        <Callout tone="warning" title={t('enginesTitle')} className="mb-6">
          <p>
            {t('engines', {
              checked: engines.checkedCases,
              cases: engines.cases,
              verified: engines.verified,
              total: engines.total,
            })}
          </p>
          <p className="mt-2">{t('standardsNotice')}</p>
        </Callout>
      )}
      <TopographyDashboardView
        orgSlug={ctx.organization.slug}
        dashboard={topographyDashboardDto(dashboard.value)}
      />
    </>
  );
}
