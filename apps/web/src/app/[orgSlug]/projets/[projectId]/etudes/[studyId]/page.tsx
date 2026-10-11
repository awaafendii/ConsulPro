import { can } from '@consulpro/domain';
import { Badge, ErrorState, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getServer } from '@/server/container';
import { calculationDto, engineDto } from '@/server/http/presenters';
import { requireProject } from '@/server/project';

import { CalculationsTable } from './calculations-table';
import { CreateCalculationForm } from './create-calculation-form';

type Params = Promise<{ orgSlug: string; projectId: string; studyId: string }>;

async function load(orgSlug: string, projectId: string, studyId: string) {
  const { ctx, project } = await requireProject(orgSlug, projectId);
  if (!z.uuid().safeParse(studyId).success) notFound();
  const study = await getServer().infra.app.studies.get(ctx, project.id, studyId);
  if (!study.ok) notFound();
  return { ctx, project, study: study.value };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId, studyId } = await params;
  const { project, study } = await load(orgSlug, projectId, studyId);
  return { title: `${study.title} — ${project.code}` };
}

export default async function StudyPage({ params }: { params: Params }) {
  const { orgSlug, projectId, studyId } = await params;
  const { ctx, project, study } = await load(orgSlug, projectId, studyId);
  const { app } = getServer().infra;
  const t = await getTranslations('calculations');
  const tDisciplines = await getTranslations('disciplines');
  const calculations = await app.calculations.listByStudy(ctx, project.id, study.id);
  if (!calculations.ok) {
    return <ErrorState message={calculations.error.message} requestId={ctx.meta.requestId} />;
  }
  const canRun = project.status === 'ACTIVE' && can(project.role, 'calculation.run');
  const engines = canRun ? await app.calculations.engines(ctx, project.id) : null;

  return (
    <div className="space-y-6">
      <Section
        title={study.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{tDisciplines(study.discipline)}</Badge>
            {study.description}
          </span>
        }
      >
        <CalculationsTable
          base={`/${ctx.organization.slug}/projets/${project.id}/calculs`}
          calculations={calculations.value.map(calculationDto)}
        />
      </Section>
      {canRun && (
        <Section title={t('createTitle')}>
          <CreateCalculationForm
            orgSlug={ctx.organization.slug}
            projectId={project.id}
            studyId={study.id}
            engines={
              engines?.ok === true
                ? engines.value.filter((e) => e.discipline === study.discipline).map(engineDto)
                : []
            }
          />
        </Section>
      )}
    </div>
  );
}
