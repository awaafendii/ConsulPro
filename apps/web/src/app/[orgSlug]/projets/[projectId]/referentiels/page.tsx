import { can } from '@consulpro/domain';
import { ErrorState } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getServer } from '@/server/container';
import { effectiveParameterDto, overrideDto, unitsOf } from '@/server/http/presenters';
import { requireProject } from '@/server/project';

import { ProjectStandardsView, type DisciplineBlock } from './project-standards-view';

type Params = Promise<{ orgSlug: string; projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${(await getTranslations('project.tabs'))('standards')} — ${project.code}` };
}

export default async function ProjectStandardsPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const { app } = getServer().infra;
  const writable = project.status === 'ACTIVE';
  const canSelect = writable && can(project.role, 'project.update');
  const canOverride = writable && can(project.role, 'project.parameter.override');

  const selection = await app.library.projectStandards(ctx, project.id);
  const overrides = await app.library.listProjectOverrides(ctx, project.id);
  if (!selection.ok || !overrides.ok) {
    const error = !selection.ok ? selection.error : !overrides.ok ? overrides.error : null;
    return <ErrorState message={error?.message ?? ''} requestId={ctx.meta.requestId} />;
  }
  const library = canSelect ? await app.library.listStandards(ctx) : null;

  const blocks: DisciplineBlock[] = [];
  for (const item of selection.value.items) {
    const versions = [];
    for (const version of item.versions) {
      const parameters = await app.library.effectiveParameters(ctx, project.id, version.id);
      versions.push({
        ...version,
        parameters: parameters.ok ? parameters.value.map(effectiveParameterDto) : [],
        units: parameters.ok
          ? unitsOf(parameters.value.flatMap((p) => [p.value, p.referenceValue]))
          : {},
        error: parameters.ok ? null : parameters.error.message,
      });
    }
    const options =
      library?.ok === true
        ? library.value
            .filter((s) => s.discipline === null || s.discipline === item.discipline)
            .flatMap((s) =>
              s.versions
                .filter((v) => v.status === 'PUBLISHED')
                .map((v) => ({ id: v.id, code: s.code, label: v.label, title: s.title })),
            )
        : [];
    blocks.push({ discipline: item.discipline, versions, options });
  }

  return (
    <ProjectStandardsView
      orgSlug={ctx.organization.slug}
      projectId={project.id}
      canSelect={canSelect}
      canOverride={canOverride}
      blocks={blocks}
      overrides={overrides.value.map(overrideDto)}
    />
  );
}
