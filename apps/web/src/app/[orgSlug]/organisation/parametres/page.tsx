import { can } from '@consulpro/domain';
import { Callout, ErrorState, PageHeader, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { organizationDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { OrganizationSettingsForm } from './organization-settings-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('organizationSettings'))('title') };
}

/** Paramètres de l'organisation : nom, pays et devise des nouveaux quantitatifs (Q3). */
export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('organizationSettings');
  const organization = await getServer().infra.app.organizations.current(ctx);
  const canUpdate = can(ctx.role, 'org.update');

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {organization.ok ? (
        <div className="max-w-2xl space-y-6">
          {!canUpdate && <Callout>{t('readOnly')}</Callout>}
          <Section title={t('general')}>
            <OrganizationSettingsForm
              organization={organizationDto({
                ...organization.value,
                role: ctx.role,
                membershipId: ctx.membershipId,
              })}
              disabled={!canUpdate}
            />
          </Section>
        </div>
      ) : (
        <ErrorState message={organization.error.message} requestId={ctx.meta.requestId} />
      )}
    </>
  );
}
