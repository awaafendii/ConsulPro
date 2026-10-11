import { can } from '@consulpro/domain';
import {
  AppLink,
  Button,
  CalculationReport,
  CalculationStatusBadge,
  Callout,
  EmptyState,
  Section,
} from '@consulpro/ui';
import { Calculator } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { WorkflowBadge } from '@/features/calculations/workflow-badge';
import { getServer } from '@/server/container';
import {
  calculationDto,
  engineDto,
  linkableOutputDto,
  revisionDto,
  revisionSummaryDto,
} from '@/server/http/presenters';
import { requireProject } from '@/server/project';

import { CalculationForm } from './calculation-form';
import { RevisionHistory } from './revision-history';
import { ReviewActions } from './review-actions';

type Params = Promise<{ orgSlug: string; projectId: string; calculationId: string }>;
type Search = Promise<{ revision?: string }>;

async function load(orgSlug: string, projectId: string, calculationId: string) {
  const { ctx, project } = await requireProject(orgSlug, projectId);
  if (!z.uuid().safeParse(calculationId).success) notFound();
  const calculation = await getServer().infra.app.calculations.get(ctx, project.id, calculationId);
  if (!calculation.ok) notFound();
  return { ctx, project, calculation: calculation.value };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orgSlug, projectId, calculationId } = await params;
  const { project, calculation } = await load(orgSlug, projectId, calculationId);
  return { title: `${calculation.title} — ${project.code}` };
}

export default async function CalculationPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { orgSlug, projectId, calculationId } = await params;
  const { revision: requested } = await searchParams;
  const { ctx, project, calculation } = await load(orgSlug, projectId, calculationId);
  const { app } = getServer().infra;
  const t = await getTranslations('calculations');
  const format = await getFormatter();
  const base = `/${ctx.organization.slug}/projets/${project.id}`;

  const study = await app.studies.get(ctx, project.id, calculation.studyId);
  const revisions = await app.calculations.revisions(ctx, project.id, calculation.id);
  const selectedId =
    requested && z.uuid().safeParse(requested).success ? requested : calculation.current?.id;
  const selected = selectedId ? await app.calculations.revision(ctx, project.id, selectedId) : null;
  if (selected && !selected.ok) notFound();
  const revision = selected?.ok ? revisionDto(selected.value) : null;

  const canRun =
    project.status === 'ACTIVE' &&
    calculation.engineAvailable &&
    can(project.role, 'calculation.run');
  const engines = await app.calculations.engines(ctx, project.id);
  const engine = engines.ok ? engines.value.find((e) => e.id === calculation.engineId) : undefined;
  const linkable = canRun
    ? await app.calculations.linkableOutputs(ctx, project.id, calculation.id)
    : null;
  // Formulaire pré-rempli avec la dernière saisie (révision courante).
  const current =
    calculation.current && calculation.current.id !== revision?.id
      ? await app.calculations.revision(ctx, project.id, calculation.current.id)
      : null;
  const lastInputs = current?.ok
    ? current.value.revision.rawInputs
    : selected?.ok
      ? selected.value.revision.rawInputs
      : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {study.ok && (
            <AppLink
              href={`${base}/etudes/${study.value.id}`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {t('backToStudy', { title: study.value.title })}
            </AppLink>
          )}
          <h2 className="text-xl font-semibold">{calculation.title}</h2>
          <p className="text-sm text-muted-foreground">{calculation.engineTitle}</p>
        </div>
        {calculation.current && (
          <span className="flex flex-wrap items-center gap-2">
            <CalculationStatusBadge status={calculation.current.resultStatus} />
            <WorkflowBadge status={calculation.current.workflowStatus} />
          </span>
        )}
      </div>

      {!calculation.engineAvailable && <Callout tone="warning">{t('engineUnavailable')}</Callout>}
      {calculation.obsolete && <Callout tone="warning">{t('obsoleteNotice')}</Callout>}

      {canRun && engine && (
        <Section title={t('inputsTitle')} description={t('inputsDescription')}>
          <CalculationForm
            orgSlug={ctx.organization.slug}
            projectId={project.id}
            calculationId={calculation.id}
            engine={engineDto(engine)}
            initialInputs={lastInputs}
            linkable={linkable?.ok === true ? linkable.value.map(linkableOutputDto) : []}
          />
        </Section>
      )}

      {revision ? (
        <Section
          title={t('resultTitle', { number: revision.number })}
          description={
            <span className="space-y-1">
              <span className="block">
                {t('meta.author', {
                  name: revision.authorName,
                  date: format.dateTime(new Date(revision.createdAt), {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  }),
                })}
              </span>
              <span className="block font-mono text-xs break-all">
                {t('meta.hash', { hash: revision.parameterSnapshotHash.slice(0, 16) })}
              </span>
            </span>
          }
          actions={
            <ReviewActions
              orgSlug={ctx.organization.slug}
              projectId={project.id}
              revision={{
                id: revision.id,
                number: revision.number,
                workflowStatus: revision.workflowStatus,
                can: revision.can,
              }}
            />
          }
        >
          <div className="space-y-6">
            {!revision.isCurrent && (
              <Callout
                tone="info"
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href={`${base}/calculs/${calculation.id}`}>{t('showCurrent')}</Link>
                  </Button>
                }
              >
                {t('olderRevision', { number: revision.number })}
              </Callout>
            )}
            {revision.dependencies.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium">{t('dependencies')}</h3>
                <ul className="list-inside list-disc text-sm">
                  {revision.dependencies.map((d) => (
                    <li key={d.input}>
                      {t('dependency', {
                        input: d.input,
                        output: d.output,
                        title: d.sourceCalculationTitle,
                        number: d.sourceRevisionNumber,
                      })}
                      {d.obsolete && (
                        <span className="ml-2 font-medium text-warning-subtle-foreground">
                          ({t('dependencyObsolete')})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <CalculationReport view={revision.view} />
            <div className="space-y-2">
              <h3 className="font-medium">{t('reviewsTitle')}</h3>
              {revision.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('reviewsEmpty')}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {revision.reviews.map((r) => (
                    <li key={r.id}>
                      {t('review', {
                        type: t(`reviewTypes.${r.type}`),
                        decision: t(`decisions.${r.decision}`),
                        name: r.reviewerName,
                        date: format.dateTime(new Date(r.createdAt), {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        }),
                      })}
                      {r.comment && (
                        <span className="block text-muted-foreground">« {r.comment} »</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Section>
      ) : (
        <EmptyState icon={Calculator} title={t('noResult')} />
      )}

      {revisions.ok && revisions.value.length > 0 && (
        <Section title={t('history')}>
          <RevisionHistory
            // Nouvelle révision : sélections de comparaison réinitialisées.
            key={revisions.value[0]?.id}
            orgSlug={ctx.organization.slug}
            projectId={project.id}
            base={`${base}/calculs/${calculation.id}`}
            currentId={calculationDto(calculation).current?.id ?? null}
            revisions={revisions.value.map(revisionSummaryDto)}
          />
        </Section>
      )}
    </div>
  );
}
