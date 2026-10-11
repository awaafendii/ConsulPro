'use client';

import type { ComparisonDto, RevisionSummaryDto } from '@consulpro/contracts';
import {
  AppLink,
  Badge,
  Button,
  CalculationStatusBadge,
  DataTable,
  formatAuto,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  type DataColumn,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { GitCompare } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import { WorkflowBadge } from '@/features/calculations/workflow-badge';
import { api } from '@/lib/api';

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly base: string;
  readonly currentId: string | null;
  readonly revisions: readonly RevisionSummaryDto[];
}

type Difference = ComparisonDto['differences'][number];

const shown = (value: Difference['before']) =>
  value === undefined || value === null
    ? '—'
    : typeof value === 'number'
      ? formatAuto(value, 6)
      : String(value);

export function RevisionHistory({ orgSlug, projectId, base, currentId, revisions }: Props) {
  const t = useTranslations('calculations');
  const format = useFormatter();
  const [before, setBefore] = useState(revisions[1]?.id ?? revisions[0]?.id ?? '');
  const [after, setAfter] = useState(revisions[0]?.id ?? '');

  const compare = useMutation({
    mutationFn: () =>
      api<ComparisonDto>(
        `/organizations/${orgSlug}/projects/${projectId}/revisions/${after}/compare?with=${before}`,
      ),
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const columns: DataColumn<RevisionSummaryDto>[] = [
    {
      id: 'number',
      header: t('revision'),
      cell: (r) => (
        <span className="flex items-center gap-2">
          <AppLink
            href={`${base}?revision=${r.id}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            <span aria-hidden>{r.number}</span>
            <span className="sr-only">{t('show', { number: r.number })}</span>
          </AppLink>
          {r.id === currentId && <Badge variant="outline">{t('current')}</Badge>}
        </span>
      ),
      sortValue: (r) => r.number,
    },
    {
      id: 'date',
      header: t('date'),
      cell: (r) =>
        format.dateTime(new Date(r.createdAt), { dateStyle: 'short', timeStyle: 'short' }),
    },
    { id: 'author', header: t('author'), cell: (r) => r.authorName },
    {
      id: 'status',
      header: t('status'),
      cell: (r) => <CalculationStatusBadge status={r.resultStatus} />,
    },
    {
      id: 'workflow',
      header: t('workflow'),
      cell: (r) => <WorkflowBadge status={r.workflowStatus} />,
    },
  ];

  const diffColumns: DataColumn<Difference & { id: string }>[] = [
    { id: 'section', header: t('section'), cell: (d) => t(`sections.${d.section}`) },
    {
      id: 'path',
      header: t('path'),
      cell: (d) => <span className="font-mono text-sm">{d.path}</span>,
    },
    {
      id: 'before',
      header: t('before'),
      cell: (d) => <span className="tabular-nums">{shown(d.before)}</span>,
    },
    {
      id: 'after',
      header: t('after'),
      cell: (d) => <span className="tabular-nums">{shown(d.after)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        caption={t('historyTable')}
        columns={columns}
        rows={revisions}
        getRowId={(r) => r.id}
      />
      {revisions.length > 1 && (
        <div className="space-y-4">
          <h3 className="font-medium">{t('compareTitle')}</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {(
              [
                ['compare-before', t('compareBefore'), before, setBefore],
                ['compare-after', t('compareAfter'), after, setAfter],
              ] as const
            ).map(([id, label, value, setValue]) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={id}>{label}</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger id={id} className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {revisions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {t('revision')} {r.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <Button
              variant="outline"
              loading={compare.isPending}
              onClick={() => {
                compare.mutate();
              }}
            >
              <GitCompare aria-hidden />
              {t('compare')}
            </Button>
          </div>
          {compare.data &&
            (compare.data.differences.length === 0 ? (
              <p className="text-sm text-muted-foreground" role="status">
                {t('compareEmpty')}
              </p>
            ) : (
              <DataTable
                caption={t('compareTable')}
                columns={diffColumns}
                rows={compare.data.differences.map((d) => ({ ...d, id: `${d.section}:${d.path}` }))}
                getRowId={(d) => d.id}
              />
            ))}
        </div>
      )}
    </div>
  );
}
