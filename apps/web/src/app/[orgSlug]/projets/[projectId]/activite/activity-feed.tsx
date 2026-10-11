'use client';

import type { ActivityDto } from '@consulpro/contracts';
import { Button, EmptyState, Section, toast } from '@consulpro/ui';
import { History } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

import { api } from '@/lib/api';

interface Props {
  readonly path: string;
  readonly pageSize: number;
  readonly initialItems: readonly ActivityDto[];
  readonly initialCursor: string | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value : null);
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function ActivityFeed({ path, pageSize, initialItems, initialCursor }: Props) {
  const t = useTranslations('project.activity');
  const tTabs = useTranslations('project.tabs');
  const tRoles = useTranslations('roles');
  const tDisciplines = useTranslations('disciplines');
  const format = useFormatter();
  const [items, setItems] = useState<readonly ActivityDto[]>(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  const more = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await api<{ items: ActivityDto[]; nextCursor: string | null }>(
        `${path}?cursor=${cursor}&limit=${pageSize}`,
      );
      setItems((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const role = (value: unknown) => {
    const r = text(value);
    return r && tRoles.has(r) ? tRoles(r) : null;
  };
  const discipline = (value: unknown) => {
    const d = text(value);
    return d && tDisciplines.has(d) ? tDisciplines(d) : d;
  };

  /** Détail lisible d'un événement, à partir de son résumé. */
  const detail = (a: ActivityDto): string | null => {
    const s = a.summary;
    switch (a.type) {
      case 'project.created':
        return [text(s.code), text(s.name)].filter(Boolean).join(' — ');
      case 'project.member_added':
      case 'project.member_removed':
        return [text(s.name), role(s.role)].filter(Boolean).join(' · ');
      case 'project.member_role_changed':
        return [text(s.name), [role(s.from), role(s.to)].filter(Boolean).join(' → ')]
          .filter(Boolean)
          .join(' · ');
      case 'project.disciplines_changed':
        return list(s.to).map(discipline).join(', ');
      case 'project.standards_changed':
        return `${discipline(s.discipline) ?? ''} : ${list(s.versions).join(', ') || '—'}`;
      case 'project.parameter_overridden':
      case 'project.parameter_override_removed':
        return [
          [text(s.label), text(s.standard) && `(${text(s.standard)})`].filter(Boolean).join(' '),
          text(s.justification),
        ]
          .filter(Boolean)
          .join(' — ');
      case 'study.created':
      case 'study.updated':
      case 'dataset.created':
        return text(s.title);
      case 'dataset.revised':
        return [text(s.title), typeof s.number === 'number' ? `révision ${String(s.number)}` : null]
          .filter(Boolean)
          .join(' · ');
      case 'calculation.created':
        return [text(s.title), text(s.engine)].filter(Boolean).join(' · ');
      case 'calculation.computed':
      case 'calculation.validated':
      case 'calculation.verified':
      case 'calculation.rejected':
        return [
          text(s.title),
          typeof s.number === 'number' ? `révision ${String(s.number)}` : null,
          text(s.comment),
        ]
          .filter(Boolean)
          .join(' · ');
      default:
        return null;
    }
  };

  return (
    <Section title={tTabs('activity')} description={t('description')}>
      {items.length === 0 ? (
        <EmptyState icon={History} title={t('empty')} />
      ) : (
        <ol className="space-y-4">
          {items.map((a) => {
            const info = detail(a);
            return (
              <li key={a.id} className="flex flex-col gap-1 border-l-2 pl-4 sm:flex-row sm:gap-4">
                <time
                  dateTime={a.createdAt}
                  className="shrink-0 text-sm text-muted-foreground tabular-nums sm:w-44"
                >
                  {format.dateTime(new Date(a.createdAt), {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </time>
                <div className="min-w-0">
                  <p>
                    <span className="font-medium">{a.actorName ?? t('unknownActor')}</span>{' '}
                    {t.has(`types.${a.type}`) ? t(`types.${a.type}`) : a.type}
                  </p>
                  {info && <p className="text-sm break-words text-muted-foreground">{info}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {cursor && (
        <Button
          variant="outline"
          className="mt-6"
          loading={loading}
          onClick={() => {
            void more();
          }}
        >
          {t('more')}
        </Button>
      )}
    </Section>
  );
}
