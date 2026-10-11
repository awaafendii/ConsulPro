'use client';

import type { StandardSummaryDto } from '@consulpro/contracts';
import { AppLink, Badge, DataTable, EmptyState, type DataColumn } from '@consulpro/ui';
import { LibraryBig } from 'lucide-react';
import { useTranslations } from 'next-intl';

const STATUS_BADGE = { DRAFT: 'muted', PUBLISHED: 'success', DEPRECATED: 'warning' } as const;

export function StandardsTable({
  orgSlug,
  standards,
}: {
  orgSlug: string;
  standards: readonly StandardSummaryDto[];
}) {
  const t = useTranslations('library');
  const tDisciplines = useTranslations('disciplines');

  const columns: DataColumn<StandardSummaryDto>[] = [
    {
      id: 'code',
      header: t('code'),
      cell: (s) => <span className="font-mono font-medium">{s.code}</span>,
      sortValue: (s) => s.code,
      filterValue: (s) => `${s.code} ${s.title} ${s.publisher ?? ''}`,
    },
    {
      id: 'title',
      header: t('titleColumn'),
      cell: (s) => (
        <span className="block min-w-48">
          {s.title}
          {s.publisher && (
            <span className="block text-xs text-muted-foreground">{s.publisher}</span>
          )}
        </span>
      ),
      sortValue: (s) => s.title,
    },
    {
      id: 'discipline',
      header: t('discipline'),
      cell: (s) => (s.discipline ? tDisciplines(s.discipline) : t('allDisciplines')),
      sortValue: (s) => s.discipline ?? '',
    },
    {
      id: 'scope',
      header: t('scope'),
      cell: (s) => <Badge variant="outline">{t(`scopes.${s.scope}`)}</Badge>,
    },
    {
      id: 'versions',
      header: t('versions'),
      cell: (s) => (
        <ul className="space-y-1">
          {s.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2">
              <AppLink
                href={`/${orgSlug}/bibliotheque/${v.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                <span aria-hidden>{t('version', { label: v.label })}</span>
                <span className="sr-only">{t('open', { code: s.code, label: v.label })}</span>
              </AppLink>
              <Badge variant={STATUS_BADGE[v.status]}>{t(`statuses.${v.status}`)}</Badge>
              <span className="text-xs text-muted-foreground">
                {t('toVerify', { count: v.toVerifyCount })}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
  ];

  return (
    <DataTable
      caption={t('table')}
      columns={columns}
      rows={standards}
      getRowId={(s) => s.id}
      filterPlaceholder={t('filter')}
      empty={
        <EmptyState icon={LibraryBig} title={t('empty')} description={t('emptyDescription')} />
      }
    />
  );
}
