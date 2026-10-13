import { Callout, ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { elecDashboardDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { ElecDashboardView } from './elec-dashboard-view';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('elec'))('title') };
}

/** Tableau de bord Électricité : bilans de puissance, calculs non conformes, à vérifier. */
export default async function ElectricityPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('elec');
  const dashboard = await getServer().infra.app.elecDashboard.get(ctx);
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
      <ElecDashboardView
        orgSlug={ctx.organization.slug}
        dashboard={elecDashboardDto(dashboard.value)}
      />
    </>
  );
}
