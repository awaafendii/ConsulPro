'use client';

import type { ProjectDto } from '@consulpro/contracts';
import { DISCIPLINES } from '@consulpro/domain';
import { AppLink, Badge, DataTable, EmptyState, type DataColumn } from '@consulpro/ui';
import { FolderKanban } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface Props {
  readonly orgSlug: string;
  readonly projects: readonly ProjectDto[];
  readonly emptyAction: ReactNode;
}

export function ProjectsTable({ orgSlug, projects, emptyAction }: Props) {
  const t = useTranslations('projects');
  const tDisciplines = useTranslations('disciplines');
  const tStatus = useTranslations('projectStatus');
  const tRoles = useTranslations('roles');
  const format = useFormatter();

  const columns: DataColumn<ProjectDto>[] = [
    {
      id: 'code',
      header: t('code'),
      cell: (p) => (
        <AppLink
          href={`/${orgSlug}/projets/${p.id}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {p.code}
        </AppLink>
      ),
      sortValue: (p) => p.code,
      filterValue: (p) => `${p.code} ${p.name} ${p.client ?? ''}`,
    },
    { id: 'name', header: t('name'), cell: (p) => p.name, sortValue: (p) => p.name },
    {
      id: 'client',
      header: t('client'),
      cell: (p) => p.client ?? '—',
      sortValue: (p) => p.client ?? '',
    },
    {
      id: 'disciplines',
      header: t('disciplines'),
      cell: (p) => (
        <span className="flex flex-wrap gap-1">
          {DISCIPLINES.filter((d) => p.disciplines.includes(d)).map((d) => (
            <Badge key={d} variant="outline">
              {tDisciplines(d)}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('status'),
      cell: (p) => (
        <Badge variant={p.status === 'ACTIVE' ? 'success' : 'muted'}>{tStatus(p.status)}</Badge>
      ),
      sortValue: (p) => p.status,
    },
    { id: 'role', header: t('role'), cell: (p) => tRoles(p.role) },
    {
      id: 'createdAt',
      header: t('createdAt'),
      cell: (p) => format.dateTime(new Date(p.createdAt), { dateStyle: 'medium' }),
      sortValue: (p) => p.createdAt,
    },
  ];

  return (
    <DataTable
      caption={t('table')}
      columns={columns}
      rows={projects}
      getRowId={(p) => p.id}
      filterPlaceholder={t('filter')}
      empty={
        <EmptyState
          icon={FolderKanban}
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={emptyAction}
        />
      }
    />
  );
}
