import { can } from '@consulpro/domain';
import { Button, ErrorState, PageHeader } from '@consulpro/ui';
import { FolderPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { projectDto } from '@/server/http/presenters';
import { requireOrganization } from '@/server/session';

import { ProjectsTable } from './projects-table';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('projects'))('title') };
}

/** Filtre d'état (segment d'URL en français) → statut de l'API. */
const FILTERS = { actifs: 'ACTIVE', archives: 'ARCHIVED', tous: 'ALL' } as const;
type Filter = keyof typeof FILTERS;

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ statut?: string }>;
}) {
  const { orgSlug } = await params;
  const { statut } = await searchParams;
  const filter: Filter = statut && statut in FILTERS ? (statut as Filter) : 'actifs';
  const ctx = await requireOrganization(orgSlug);
  const t = await getTranslations('projects');
  const canCreate = can(ctx.role, 'project.create');
  const base = `/${ctx.organization.slug}/projets`;

  const projects = await getServer().infra.app.projects.list(ctx, FILTERS[filter]);
  const createButton = canCreate ? (
    <Button asChild>
      <Link href={`${base}/nouveau`}>
        <FolderPlus aria-hidden />
        {t('new')}
      </Link>
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description', { organization: ctx.organization.name })}
        actions={createButton}
      />
      <nav aria-label={t('showLabel')} className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(FILTERS) as Filter[]).map((key) => (
          <Button key={key} asChild size="sm" variant={key === filter ? 'secondary' : 'ghost'}>
            <Link
              href={key === 'actifs' ? base : `${base}?statut=${key}`}
              aria-current={key === filter ? 'page' : undefined}
            >
              {t(`show.${FILTERS[key]}`)}
            </Link>
          </Button>
        ))}
      </nav>
      {projects.ok ? (
        <ProjectsTable
          orgSlug={ctx.organization.slug}
          projects={projects.value.map(projectDto)}
          emptyAction={createButton}
        />
      ) : (
        <ErrorState message={projects.error.message} requestId={ctx.meta.requestId} />
      )}
    </>
  );
}
