import { ErrorState, PageHeader } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { standardSummaryDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { StandardsTable } from './standards-table';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('library'))('title') };
}

export default async function LibraryPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('library');
  const standards = await getServer().infra.app.library.listStandards(ctx);

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {standards.ok ? (
        <StandardsTable
          orgSlug={ctx.organization.slug}
          standards={standards.value.map(standardSummaryDto)}
        />
      ) : (
        <ErrorState message={standards.error.message} requestId={ctx.meta.requestId} />
      )}
    </>
  );
}
