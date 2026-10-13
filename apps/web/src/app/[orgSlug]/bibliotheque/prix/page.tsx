import { can } from '@consulpro/domain';
import { ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { priceLibraryDto } from '@/server/http/presenters-quantities';
import { requireOrganization } from '@/server/session';

import { LibraryTabs } from '../library-tabs';
import { PriceLibrariesView } from './price-libraries-view';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('prices'))('title') };
}

/** Bibliothèques de prix unitaires de l'organisation (facultatives). */
export default async function PricesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('prices');
  const tLibrary = await getTranslations('library');
  const { app } = getServer().infra;
  const libraries = await app.prices.list(ctx);
  // Devise proposée : celle de l'organisation (paramètres), modifiable à la création.
  const organization = await app.organizations.current(ctx);

  return (
    <>
      <PageHeader title={tLibrary('title')} description={t('description')} />
      <LibraryTabs orgSlug={ctx.organization.slug} />
      {libraries.ok ? (
        <PriceLibrariesView
          orgSlug={ctx.organization.slug}
          canManage={can(ctx.role, 'price.manage')}
          defaultCurrency={organization.ok ? organization.value.currency : 'XOF'}
          libraries={libraries.value.map(priceLibraryDto)}
        />
      ) : (
        <ErrorState message={libraries.error.message} requestId={ctx.meta.requestId} />
      )}
    </>
  );
}
