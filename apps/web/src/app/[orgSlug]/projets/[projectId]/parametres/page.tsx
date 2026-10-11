import { can } from '@consulpro/domain';
import { Callout, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ProjectForm } from '@/features/projects/project-form';
import { projectDto } from '@/server/http/presenters';
import { requireProject } from '@/server/project';

import { ArchiveControl } from './archive-control';

type Params = Promise<{ orgSlug: string; projectId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId } = await params;
  const { project } = await requireProject(orgSlug, projectId);
  return { title: `${(await getTranslations('project.tabs'))('settings')} — ${project.code}` };
}

export default async function ProjectSettingsPage({ params }: { params: Params }) {
  const { orgSlug, projectId } = await params;
  const { ctx, project } = await requireProject(orgSlug, projectId);
  const t = await getTranslations('project.settings');
  const canUpdate = can(project.role, 'project.update');
  const canArchive = can(project.role, 'project.archive');
  const dto = projectDto(project);

  return (
    <div className="space-y-6">
      {!canUpdate && <Callout>{t('readOnly')}</Callout>}
      <Section title={t('editTitle')}>
        <ProjectForm
          orgSlug={ctx.organization.slug}
          project={dto}
          disabled={!canUpdate || project.status === 'ARCHIVED'}
        />
      </Section>
      {canArchive && (
        <Section title={t('archiveTitle')} description={t('archiveDescription')}>
          <ArchiveControl orgSlug={ctx.organization.slug} project={dto} />
        </Section>
      )}
    </div>
  );
}
