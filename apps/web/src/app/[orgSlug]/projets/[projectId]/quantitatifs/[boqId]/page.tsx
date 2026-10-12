import { can } from '@consulpro/domain';
import { ErrorState } from '@consulpro/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getServer } from '@/server/container';
import { boqDto, materialRowDto, priceLibraryDto } from '@/server/http/presenters-quantities';
import { requireProject } from '@/server/project';

import { BoqView } from './boq-view';

type Params = Promise<{ orgSlug: string; projectId: string; boqId: string }>;

const boqId = z.uuid();

async function load(orgSlug: string, projectId: string, id: string) {
  const { ctx, project } = await requireProject(orgSlug, projectId);
  if (!boqId.safeParse(id).success || !project.disciplines.includes('BTP')) notFound();
  const boq = await getServer().infra.app.boqs.get(ctx, project.id, id);
  if (!boq.ok && boq.error.kind === 'NOT_FOUND') notFound();
  return { ctx, project, boq };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId, boqId: id } = await params;
  const { project, boq } = await load(orgSlug, projectId, id);
  const t = await getTranslations('project.tabs');
  return { title: `${boq.ok ? boq.value.boq.title : t('quantities')} — ${project.code}` };
}

/** Devis quantitatif : lignes par lot, prix facultatifs, décomposition en matériaux. */
export default async function BoqPage({ params }: { params: Params }) {
  const { orgSlug, projectId, boqId: id } = await params;
  const { ctx, project, boq } = await load(orgSlug, projectId, id);
  if (!boq.ok) return <ErrorState message={boq.error.message} requestId={ctx.meta.requestId} />;
  const { app } = getServer().infra;
  const materials = await app.boqs.materials(ctx, project.id, id);
  const libraries = await app.prices.list(ctx);

  return (
    <BoqView
      orgSlug={ctx.organization.slug}
      projectId={project.id}
      canManage={project.status === 'ACTIVE' && can(project.role, 'boq.manage')}
      boq={boqDto(boq.value)}
      materials={materials.ok ? materials.value.map(materialRowDto) : []}
      libraries={libraries.ok ? libraries.value.map(priceLibraryDto) : []}
    />
  );
}
