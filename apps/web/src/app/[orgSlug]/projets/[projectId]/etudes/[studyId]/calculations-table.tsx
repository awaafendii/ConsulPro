'use client';

import type { CalculationDto } from '@consulpro/contracts';
import {
  AppLink,
  Badge,
  CalculationStatusBadge,
  DataTable,
  EmptyState,
  type DataColumn,
} from '@consulpro/ui';
import { Calculator } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { WorkflowBadge } from '@/features/calculations/workflow-badge';

export function CalculationsTable({
  base,
  calculations,
}: {
  base: string;
  calculations: readonly CalculationDto[];
}) {
  const t = useTranslations('calculations');
  const format = useFormatter();

  const columns: DataColumn<CalculationDto>[] = [
    {
      id: 'title',
      header: t('title'),
      cell: (c) => (
        <span className="flex flex-wrap items-center gap-2">
          <AppLink
            href={`${base}/${c.id}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {c.title}
          </AppLink>
          {c.obsolete && <Badge variant="warning">{t('obsolete')}</Badge>}
        </span>
      ),
      sortValue: (c) => c.title,
      filterValue: (c) => `${c.title} ${c.engineTitle}`,
    },
    {
      id: 'engine',
      header: t('engine'),
      cell: (c) => c.engineTitle,
      sortValue: (c) => c.engineTitle,
    },
    {
      id: 'status',
      header: t('status'),
      cell: (c) =>
        c.current ? (
          <CalculationStatusBadge status={c.current.resultStatus} />
        ) : (
          <span className="text-muted-foreground">{t('none')}</span>
        ),
    },
    {
      id: 'workflow',
      header: t('workflow'),
      cell: (c) => (c.current ? <WorkflowBadge status={c.current.workflowStatus} /> : '—'),
    },
    {
      id: 'revision',
      header: t('revision'),
      cell: (c) =>
        c.current
          ? `${String(c.current.number)} · ${format.dateTime(new Date(c.current.createdAt), { dateStyle: 'short' })}`
          : '—',
      sortValue: (c) => c.current?.createdAt ?? '',
    },
    { id: 'author', header: t('author'), cell: (c) => c.current?.authorName ?? '—' },
  ];

  return (
    <DataTable
      caption={t('table')}
      columns={columns}
      rows={calculations}
      getRowId={(c) => c.id}
      empty={<EmptyState icon={Calculator} title={t('empty')} />}
    />
  );
}
