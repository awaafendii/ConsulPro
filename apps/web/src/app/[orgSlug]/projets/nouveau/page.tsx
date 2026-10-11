import { can } from '@consulpro/domain';
import { PageHeader, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { ProjectForm } from '@/features/projects/project-form';
import { requireOrganization } from '@/server/session';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('projects'))('createTitle') };
}

export default async function NewProjectPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrganization(orgSlug);
  if (!can(ctx.role, 'project.create')) notFound();
  const t = await getTranslations('projects');
  const tSettings = await getTranslations('project.settings');

  return (
    <>
      <PageHeader title={t('createTitle')} description={t('createDescription')} />
      <Section title={tSettings('editTitle')}>
        <ProjectForm orgSlug={ctx.organization.slug} />
      </Section>
    </>
  );
}
