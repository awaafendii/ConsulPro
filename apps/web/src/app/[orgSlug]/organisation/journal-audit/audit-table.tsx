'use client';

import type { AuditLogDto } from '@consulpro/contracts';
import { DataTable, EmptyState, type DataColumn } from '@consulpro/ui';
import { ClipboardList } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

interface Props {
  readonly entries: readonly AuditLogDto[];
  readonly actorNames: Readonly<Record<string, string>>;
  readonly cursor: string | null;
  readonly stack: readonly string[];
  readonly nextCursor: string | null;
}

const FIRST_PAGE = '-';

export function AuditTable({ entries, actorNames, cursor, stack, nextCursor }: Props) {
  const t = useTranslations('audit');
  // Fuseau configuré (next-intl) : rendu identique côté serveur et côté navigateur.
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();

  const go = (target: string | null, nextStack: readonly string[]) => {
    const query = new URLSearchParams();
    if (target) query.set('cursor', target);
    if (nextStack.length > 0) query.set('stack', nextStack.join(','));
    const qs = query.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const actionLabel = (action: string) =>
    t.has(`actions.${action}`) ? t(`actions.${action}`) : action;
  const actorLabel = (id: string | null) =>
    id === null ? '—' : (actorNames[id] ?? t('unknownActor', { id: id.slice(0, 8) }));

  const columns: DataColumn<AuditLogDto>[] = [
    {
      id: 'date',
      header: t('date'),
      cell: (a) => (
        <span className="whitespace-nowrap tabular-nums">
          {format.dateTime(new Date(a.createdAt), { dateStyle: 'short', timeStyle: 'medium' })}
        </span>
      ),
    },
    {
      id: 'action',
      header: t('action'),
      cell: (a) => actionLabel(a.action),
      filterValue: (a) => actionLabel(a.action),
    },
    {
      id: 'actor',
      header: t('actor'),
      cell: (a) => actorLabel(a.actorUserId),
      filterValue: (a) => actorLabel(a.actorUserId),
    },
    {
      id: 'details',
      header: t('details'),
      cell: (a) => (
        <code className="font-mono text-xs break-all text-muted-foreground">
          {JSON.stringify(a.metadata)}
        </code>
      ),
      filterValue: (a) => JSON.stringify(a.metadata),
    },
  ];

  return (
    <DataTable
      caption={t('table')}
      columns={columns}
      rows={entries}
      getRowId={(a) => a.id}
      empty={<EmptyState icon={ClipboardList} title={t('empty')} />}
      pagination={{
        hasPrevious: cursor !== null,
        hasNext: nextCursor !== null,
        onPrevious: () => {
          const previous = stack.at(-1);
          go(
            previous === undefined || previous === FIRST_PAGE ? null : previous,
            stack.slice(0, -1),
          );
        },
        onNext: () => {
          go(nextCursor, [...stack, cursor ?? FIRST_PAGE]);
        },
      }}
    />
  );
}
