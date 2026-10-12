import { Callout, ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { btpDashboardDto } from '@/server/http/presenters-quantities';
import { requireOrganization } from '@/server/session';

import { BtpDashboardView } from './btp-dashboard-view';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('btp'))('title') };
}

/** Tableau de bord BTP : avancement des métrés, totaux par lot, alertes. */
export default async function BtpPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('btp');
  const dashboard = await getServer().infra.app.btpDashboard.get(ctx);
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
          {t('engines', {
            checked: engines.checkedCases,
            cases: engines.cases,
            verified: engines.verified,
            total: engines.total,
          })}
        </Callout>
      )}
      <BtpDashboardView
        orgSlug={ctx.organization.slug}
        dashboard={btpDashboardDto(dashboard.value)}
      />
    </>
  );
}
