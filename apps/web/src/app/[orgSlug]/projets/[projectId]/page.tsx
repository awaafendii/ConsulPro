import { DISCIPLINES } from '@consulpro/domain';
import { Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { requireProject } from '@/server/project';

type Params = Promise<{ orgSlug: string; projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${project.code} — ${project.name}` };
}

export default async function ProjectOverviewPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  const t = await getTranslations('project.overview');
  const tDisciplines = await getTranslations('disciplines');
  const format = await getFormatter();
  // Dates calendaires (sans heure) : affichées telles quelles, sans conversion de fuseau.
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' });

  const period =
    project.startDate && project.endDate
      ? t('range', { start: day(project.startDate), end: day(project.endDate) })
      : project.startDate
        ? t('from', { date: day(project.startDate) })
        : project.endDate
          ? t('until', { date: day(project.endDate) })
          : null;

  const rows: [string, ReactNode][] = [
    [t('client'), project.client],
    [t('location'), project.location],
    [t('period'), period],
    [
      t('disciplines'),
      DISCIPLINES.filter((d) => project.disciplines.includes(d))
        .map((d) => tDisciplines(d))
        .join(', '),
    ],
    [t('createdAt'), format.dateTime(project.createdAt, { dateStyle: 'long' })],
  ];

  return (
    <Section title={t('details')}>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 space-y-1">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="break-words">
              {value ?? <span className="text-muted-foreground">{t('none')}</span>}
            </dd>
          </div>
        ))}
        <div className="min-w-0 space-y-1 sm:col-span-2">
          <dt className="text-sm text-muted-foreground">{t('description')}</dt>
          <dd className="break-words whitespace-pre-line">
            {project.description ?? <span className="text-muted-foreground">{t('none')}</span>}
          </dd>
        </div>
      </dl>
    </Section>
  );
}
