import { Callout, ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { plumbingDashboardDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { PlumbingDashboardView } from './plumbing-dashboard-view';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('plumbing'))('title') };
}

/** Tableau de bord Plomberie : débits de pointe, réseaux non conformes, calculs à vérifier. */
export default async function PlumbingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('plumbing');
  const dashboard = await getServer().infra.app.plumbingDashboard.get(ctx);
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
      <PlumbingDashboardView
        orgSlug={ctx.organization.slug}
        dashboard={plumbingDashboardDto(dashboard.value)}
      />
    </>
  );
}
