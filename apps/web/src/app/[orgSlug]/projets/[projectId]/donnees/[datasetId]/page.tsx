import { can } from '@consulpro/domain';
import { AppLink, Button, Callout, ErrorState, Section } from '@consulpro/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getServer } from '@/server/container';
import { datasetKindDto, datasetRevisionDto } from '@/server/http/presenters';
import { requireProject } from '@/server/project';

import { DatasetEditor } from './dataset-editor';

type Params = Promise<{ orgSlug: string; projectId: string; datasetId: string }>;
type Search = Promise<{ revision?: string }>;

async function load(orgSlug: string, projectId: string, datasetId: string, revision?: string) {
  const { ctx, project } = await requireProject(orgSlug, projectId);
  if (!z.uuid().safeParse(datasetId).success) notFound();
  const requested = revision && z.uuid().safeParse(revision).success ? revision : undefined;
  const result = await getServer().infra.app.datasets.revision(
    ctx,
    project.id,
    datasetId,
    requested,
  );
  if (!result.ok) notFound();
  return { ctx, project, ...result.value };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId, datasetId } = await params;
  const { project, dataset } = await load(orgSlug, projectId, datasetId);
  return { title: `${dataset.title} — ${project.code}` };
}

export default async function DatasetPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { orgSlug, projectId, datasetId } = await params;
  const { revision: requested } = await searchParams;
  const { ctx, project, dataset, revision } = await load(orgSlug, projectId, datasetId, requested);
  const { app } = getServer().infra;
  const t = await getTranslations('datasets');
  const format = await getFormatter();
  const kinds = await app.datasets.kinds(ctx, project.id);
  const kind = kinds.ok ? kinds.value.find((k) => k.id === dataset.kind) : undefined;
  const revisions = await app.datasets.revisions(ctx, project.id, dataset.id);
  if (!kind) return <ErrorState message={t('noKind')} requestId={ctx.meta.requestId} />;

  const older = revision && revision.id !== dataset.currentRevisionId ? revision : null;
  const editable = !older && project.status === 'ACTIVE' && can(project.role, 'dataset.write');
  const base = `/${ctx.organization.slug}/projets/${project.id}/donnees/${dataset.id}`;

  return (
    <div className="space-y-6">
      <Section title={dataset.title} description={kind.label}>
        <div className="space-y-4">
          {older && (
            <Callout
              tone="info"
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href={base}>{t('backToCurrent')}</Link>
                </Button>
              }
            >
              {t('viewing', { number: older.number })}
            </Callout>
          )}
          <DatasetEditor
            orgSlug={ctx.organization.slug}
            projectId={project.id}
            datasetId={dataset.id}
            version={dataset.version}
            kind={datasetKindDto(kind)}
            revision={revision ? datasetRevisionDto(revision) : null}
            editable={editable}
          />
        </div>
      </Section>
      {revisions.ok && revisions.value.length > 0 && (
        <Section title={t('history')}>
          <ul className="space-y-1 text-sm">
            {revisions.value.map((r) => (
              <li key={r.id}>
                <AppLink
                  href={`${base}?revision=${r.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {t('historyItem', {
                    number: r.number,
                    rows: r.rowCount,
                    name: r.authorName,
                    date: format.dateTime(r.createdAt, { dateStyle: 'short', timeStyle: 'short' }),
                  })}
                </AppLink>
                {r.note && <span className="text-muted-foreground"> — {r.note}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
