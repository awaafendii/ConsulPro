import { DISCIPLINES } from '@consulpro/domain';
import { Badge, Callout, PageHeader } from '@consulpro/ui';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { requireProject } from '@/server/project';

import { ProjectTabs } from './project-tabs';

/** Espace d'un projet : en-tête, état, onglets. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string; projectId: string }>;
}) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const t = await getTranslations('project');
  const tStatus = await getTranslations('projectStatus');
  const tRoles = await getTranslations('roles');
  const tDisciplines = await getTranslations('disciplines');

  return (
    <>
      <PageHeader
        title={`${project.code} — ${project.name}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={project.status === 'ACTIVE' ? 'success' : 'muted'}>
              {tStatus(project.status)}
            </Badge>
            {DISCIPLINES.filter((d) => project.disciplines.includes(d)).map((d) => (
              <Badge key={d} variant="outline">
                {tDisciplines(d)}
              </Badge>
            ))}
            <span>{t('role', { role: tRoles(project.role) })}</span>
          </span>
        }
      />
      {project.status === 'ARCHIVED' && (
        <Callout tone="warning" className="mb-6">
          {t('archivedNotice')}
        </Callout>
      )}
      <ProjectTabs base={`/${ctx.organization.slug}/projets/${project.id}`} />
      {children}
    </>
  );
}
