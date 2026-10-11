import { can, DISCIPLINES } from '@consulpro/domain';
import { AppLink, Badge, EmptyState, ErrorState, Section } from '@consulpro/ui';
import { BookOpen } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { requireProject } from '@/server/project';

import { CreateStudyForm } from './create-study-form';

type Params = Promise<{ orgSlug: string; projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${(await getTranslations('project.tabs'))('studies')} — ${project.code}` };
}

export default async function StudiesPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const t = await getTranslations('studies');
  const tTabs = await getTranslations('project.tabs');
  const tDisciplines = await getTranslations('disciplines');
  const studies = await getServer().infra.app.studies.list(ctx, project.id);
  if (!studies.ok) {
    return <ErrorState message={studies.error.message} requestId={ctx.meta.requestId} />;
  }
  const canCreate = project.status === 'ACTIVE' && can(project.role, 'study.manage');
  const base = `/${ctx.organization.slug}/projets/${project.id}/etudes`;
  const disciplines = DISCIPLINES.filter((d) => project.disciplines.includes(d));

  return (
    <div className="space-y-6">
      <Section title={tTabs('studies')} description={t('description')}>
        {studies.value.length === 0 ? (
          <EmptyState icon={BookOpen} title={t('empty')} description={t('emptyDescription')} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {studies.value.map((s) => (
              <li key={s.id}>
                <AppLink
                  href={`${base}/${s.id}`}
                  className="flex h-full flex-col gap-2 rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{s.title}</span>
                    <Badge variant="outline">{tDisciplines(s.discipline)}</Badge>
                  </span>
                  {s.description && (
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {s.description}
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {t('calculations', { count: s.calculationCount })} ·{' '}
                    {t('by', { name: s.createdByName })}
                  </span>
                </AppLink>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {canCreate && (
        <Section title={t('createTitle')}>
          <CreateStudyForm
            orgSlug={ctx.organization.slug}
            projectId={project.id}
            disciplines={disciplines}
          />
        </Section>
      )}
    </div>
  );
}
