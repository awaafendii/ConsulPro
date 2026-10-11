import { err, ok, type Result } from '@consulpro/calc-core';
import {
  DATASET_KINDS,
  isDatasetKind,
  validateRows,
  validateTitle,
  type DatasetKind,
} from '@consulpro/domain';

import type { OrgContext } from '../context';
import { appError, fromDomain, notFound, reread, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps } from '../ports';
import type { DatasetListItem, DatasetRecord, DatasetRevisionRecord } from '../ports-calculations';
import { appendActivity, inProject, projectDisciplines } from '../projects/project-context';
import { auditBase } from '../scope';

const READ = { permission: 'project.read', write: false } as const;
const WRITE = { permission: 'dataset.write', write: true } as const;

export function createDatasetService({ uow, ids }: Pick<ApplicationDeps, 'uow' | 'ids'>) {
  return {
    /** Types de jeux de données disponibles pour les métiers activés du projet. */
    async kinds(ctx: OrgContext, projectId: string): Promise<Result<DatasetKind[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const disciplines = await projectDisciplines(repos, projectId);
        return ok(
          Object.values<DatasetKind>(DATASET_KINDS).filter((k) =>
            disciplines.includes(k.discipline),
          ),
        );
      });
    },

    async list(ctx: OrgContext, projectId: string): Promise<Result<DatasetListItem[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) =>
        ok(await repos.datasets.list(ctx.organization.id, projectId)),
      );
    },

    async create(
      ctx: OrgContext,
      projectId: string,
      input: { kind: string; title: string },
    ): Promise<Result<DatasetRecord, AppError>> {
      return inProject(uow, ctx, projectId, WRITE, async (pctx, repos) => {
        if (!isDatasetKind(input.kind)) {
          return err(appError('VALIDATION', 'DATASET_KIND_UNKNOWN', 'Type de données inconnu.'));
        }
        const kind: DatasetKind = DATASET_KINDS[input.kind];
        if (!(await projectDisciplines(repos, projectId)).includes(kind.discipline)) {
          return err(
            appError(
              'VALIDATION',
              'DATASET_DISCIPLINE_INACTIVE',
              'Le métier de ce type de données n’est pas activé sur le projet.',
            ),
          );
        }
        const title = validateTitle(input.title, 'DATASET_TITLE_INVALID');
        if (!title.ok) return err(fromDomain(title.error));
        const id = ids.next();
        await repos.datasets.create({
          id,
          organizationId: ctx.organization.id,
          projectId,
          kind: kind.id,
          discipline: kind.discipline,
          title: title.value,
          createdById: ctx.actor.userId,
        });
        await appendActivity(
          repos,
          pctx,
          'dataset.created',
          { title: title.value, kind: kind.label },
          { type: 'dataset', id },
        );
        return ok(
          reread(
            await repos.datasets.findById(ctx.organization.id, projectId, id),
            'Jeu de données',
          ),
        );
      });
    },

    /** Enregistre une nouvelle révision (immuable) des lignes, validées par le type du jeu. */
    async saveRevision(
      ctx: OrgContext,
      projectId: string,
      datasetId: string,
      input: { rows: readonly Readonly<Record<string, unknown>>[]; note?: string | undefined },
      expectedVersion: number,
    ): Promise<Result<DatasetRevisionRecord, AppError>> {
      return inProject(uow, ctx, projectId, WRITE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const dataset = await repos.datasets.findById(orgId, projectId, datasetId);
        if (!dataset) return err(notFound('Jeu de données'));
        if (dataset.version !== expectedVersion) return err(staleVersion());
        if (!isDatasetKind(dataset.kind)) {
          return err(appError('VALIDATION', 'DATASET_KIND_UNKNOWN', 'Type de données inconnu.'));
        }
        const rows = validateRows(dataset.kind, input.rows);
        if (!rows.ok) {
          return err(
            appError(
              'VALIDATION',
              'DATASET_ROWS_INVALID',
              'Certaines lignes sont invalides : rien n’a été enregistré.',
              rows.error.map((e) => ({
                path: `rows.${String(e.row)}.${e.column}`,
                code: 'ROW_INVALID',
                message: `Ligne ${String(e.row)} — ${e.message}`,
              })),
            ),
          );
        }
        const id = ids.next();
        const number = await repos.datasets.nextRevisionNumber(datasetId);
        const note = input.note?.trim() ? input.note.trim() : null;
        const created = await repos.datasets.createRevision({
          id,
          organizationId: orgId,
          projectId,
          datasetId,
          number,
          rows: rows.value,
          note,
          authorId: ctx.actor.userId,
        });
        if (!created.ok) return err(staleVersion());
        if (!(await repos.datasets.setCurrentRevision(orgId, datasetId, id, expectedVersion))) {
          return err(staleVersion());
        }
        await appendActivity(
          repos,
          pctx,
          'dataset.revised',
          { title: dataset.title, number, rows: rows.value.length },
          { type: 'dataset', id: datasetId },
        );
        await repos.audit.append({
          ...auditBase(ctx, orgId),
          action: 'dataset.revision_created',
          targetType: 'dataset_revision',
          targetId: id,
          metadata: { datasetId, projectId, number, rows: rows.value.length },
        });
        return ok(reread(await repos.datasets.findRevision(orgId, datasetId, id), 'Révision'));
      });
    },

    /** Révision demandée, sinon la révision courante (null si aucune). */
    async revision(
      ctx: OrgContext,
      projectId: string,
      datasetId: string,
      revisionId?: string,
    ): Promise<
      Result<{ dataset: DatasetRecord; revision: DatasetRevisionRecord | null }, AppError>
    > {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const orgId = ctx.organization.id;
        const dataset = await repos.datasets.findById(orgId, projectId, datasetId);
        if (!dataset) return err(notFound('Jeu de données'));
        const id = revisionId ?? dataset.currentRevisionId;
        const revision = id ? await repos.datasets.findRevision(orgId, datasetId, id) : null;
        if (revisionId && !revision) return err(notFound('Révision'));
        return ok({ dataset, revision });
      });
    },

    async revisions(
      ctx: OrgContext,
      projectId: string,
      datasetId: string,
    ): Promise<Result<Omit<DatasetRevisionRecord, 'rows'>[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const dataset = await repos.datasets.findById(ctx.organization.id, projectId, datasetId);
        if (!dataset) return err(notFound('Jeu de données'));
        return ok(await repos.datasets.listRevisions(ctx.organization.id, datasetId));
      });
    },
  };
}

export type DatasetService = ReturnType<typeof createDatasetService>;
