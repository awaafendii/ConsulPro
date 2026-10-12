import { can } from '@consulpro/domain';
import { ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getServer } from '@/server/container';
import { priceLibraryDetailDto } from '@/server/http/presenters-quantities';
import { requireOrganization } from '@/server/session';

import { LibraryTabs } from '../../library-tabs';
import { PriceLibraryView } from './price-library-view';

type Params = Promise<{ orgSlug: string; libraryId: string }>;

const libraryId = z.uuid();

async function load(orgSlug: string, id: string) {
  const ctx = await requireOrganization(orgSlug);
  if (!libraryId.safeParse(id).success) notFound();
  const library = await getServer().infra.app.prices.get(ctx, id);
  if (!library.ok && library.error.kind === 'NOT_FOUND') notFound();
  return { ctx, library };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, libraryId: id } = await params;
  const { library } = await load(orgSlug, id);
  const t = await getTranslations('prices');
  return { title: library.ok ? `${library.value.library.name} — ${t('title')}` : t('title') };
}

/** Bibliothèque de prix : articles, ouvrages liés, devise et validité. */
export default async function PriceLibraryPage({ params }: { params: Params }) {
  const { orgSlug, libraryId: id } = await params;
  const { ctx, library } = await load(orgSlug, id);
  const tLibrary = await getTranslations('library');
  const t = await getTranslations('prices');
  const { app } = getServer().infra;

  return (
    <>
      <PageHeader title={tLibrary('title')} description={t('description')} />
      <LibraryTabs orgSlug={ctx.organization.slug} />
      {library.ok ? (
        <PriceLibraryView
          orgSlug={ctx.organization.slug}
          canManage={can(ctx.role, 'price.manage')}
          library={priceLibraryDetailDto(library.value, app.prices.works())}
        />
      ) : (
        <ErrorState message={library.error.message} requestId={ctx.meta.requestId} />
      )}
    </>
  );
}
