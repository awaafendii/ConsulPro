import { err, ok, type Result } from '@consulpro/calc-core';
import {
  DATASET_KINDS,
  isDatasetKind,
  validateRows,
  validateTitle,
  type DatasetKind,
} from '@consulpro/domain';
import {
  autoMap,
  detectFormat,
  gridToRows,
  readGrid,
  type ColumnMapping,
  type Delimiter,
  type SourceFormat,
} from '@consulpro/importers';

import type { OrgContext } from '../context';
import { appError, fromDomain, notFound, reread, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps, Repositories } from '../ports';
import type { DatasetListItem, DatasetRecord, DatasetRevisionRecord } from '../ports-calculations';
import {
  appendActivity,
  inProject,
  projectDisciplines,
  type ProjectContext,
} from '../projects/project-context';
import { auditBase } from '../scope';

const READ = { permission: 'project.read', write: false } as const;
const WRITE = { permission: 'dataset.write', write: true } as const;
/** Prévisualisation d'import : vérifie la permission d'écriture sans ouvrir de transaction d'écriture. */
const IMPORT = { permission: 'dataset.write', write: false } as const;

/** Nombre de lignes et d'erreurs renvoyées dans un aperçu d'import (le reste est résumé par le total). */
const PREVIEW_SAMPLE = 20;
const PREVIEW_ERRORS = 200;

/** Entrée commune aux opérations d'import : octets source et choix de lecture/rapprochement. */
export interface ImportInput {
  readonly content: Uint8Array;
  readonly delimiter?: Delimiter | undefined;
  readonly mapping?: readonly ColumnMapping[] | undefined;
  readonly units?: Readonly<Record<string, string>> | undefined;
  readonly note?: string | undefined;
}

/** Aperçu d'un import avant enregistrement : rapprochement proposé, échantillon et validation. */
export interface ImportPreview {
  readonly format: SourceFormat;
  readonly headers: readonly string[];
  readonly mapping: readonly ColumnMapping[];
  readonly rowCount: number;
  readonly sample: readonly Readonly<Record<string, unknown>>[];
  readonly errors: readonly {
    readonly row: number;
    readonly column: string;
    readonly message: string;
  }[];
  readonly valid: boolean;
}

export function createDatasetService({ uow, ids }: Pick<ApplicationDeps, 'uow' | 'ids'>) {
  /** Valide les lignes brutes et enregistre une révision immuable : cœur partagé saisie/import. */
  async function writeRevision(
    pctx: ProjectContext,
    repos: Repositories,
    projectId: string,
    datasetId: string,
    dataset: DatasetRecord,
    rawRows: readonly Readonly<Record<string, unknown>>[],
    note: string | undefined,
    expectedVersion: number,
  ): Promise<Result<DatasetRevisionRecord, AppError>> {
    const orgId = pctx.organization.id;
    if (!isDatasetKind(dataset.kind)) {
      return err(appError('VALIDATION', 'DATASET_KIND_UNKNOWN', 'Type de données inconnu.'));
    }
    const rows = validateRows(dataset.kind, rawRows);
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
    const trimmed = note?.trim() ? note.trim() : null;
    const created = await repos.datasets.createRevision({
      id,
      organizationId: orgId,
      projectId,
      datasetId,
      number,
      rows: rows.value,
      note: trimmed,
      authorId: pctx.actor.userId,
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
      ...auditBase(pctx, orgId),
      action: 'dataset.revision_created',
      targetType: 'dataset_revision',
      targetId: id,
      metadata: { datasetId, projectId, number, rows: rows.value.length },
    });
    return ok(reread(await repos.datasets.findRevision(orgId, datasetId, id), 'Révision'));
  }

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
        const dataset = await repos.datasets.findById(ctx.organization.id, projectId, datasetId);
        if (!dataset) return err(notFound('Jeu de données'));
        if (dataset.version !== expectedVersion) return err(staleVersion());
        return writeRevision(
          pctx,
          repos,
          projectId,
          datasetId,
          dataset,
          input.rows,
          input.note,
          expectedVersion,
        );
      });
    },

    /** Aperçu d'un import (fichier CSV/TSV/XLSX ou collage) : lu, rapproché, coercé et validé, sans rien enregistrer. */
    async importPreview(
      ctx: OrgContext,
      projectId: string,
      datasetId: string,
      input: Pick<ImportInput, 'content' | 'delimiter' | 'mapping' | 'units'>,
    ): Promise<Result<ImportPreview, AppError>> {
      return inProject(uow, ctx, projectId, IMPORT, async (_pctx, repos) => {
        const dataset = await repos.datasets.findById(ctx.organization.id, projectId, datasetId);
        if (!dataset) return err(notFound('Jeu de données'));
        if (!isDatasetKind(dataset.kind)) {
          return err(appError('VALIDATION', 'DATASET_KIND_UNKNOWN', 'Type de données inconnu.'));
        }
        const columns = DATASET_KINDS[dataset.kind].columns;
        const format = detectFormat(input.content);
        let grid;
        try {
          grid = readGrid(input.content, input.delimiter);
        } catch {
          return err(
            appError(
              'VALIDATION',
              'IMPORT_UNREADABLE',
              'Fichier illisible : format non reconnu ou corrompu.',
            ),
          );
        }
        const mapping = input.mapping ?? autoMap(columns, grid.headers);
        const coerced = gridToRows(columns, grid, mapping, input.units ?? {});
        const validation = validateRows(dataset.kind, coerced);
        const sample = (validation.ok ? validation.value : coerced).slice(0, PREVIEW_SAMPLE);
        const errors = validation.ok ? [] : validation.error.slice(0, PREVIEW_ERRORS);
        return ok({
          format,
          headers: grid.headers,
          mapping,
          rowCount: grid.rows.length,
          sample,
          errors,
          valid: validation.ok,
        });
      });
    },

    /** Enregistre une révision à partir d'un import, jusqu'à `maxRows` du type (pas le plafond de saisie). */
    async importCommit(
      ctx: OrgContext,
      projectId: string,
      datasetId: string,
      input: ImportInput,
      expectedVersion: number,
    ): Promise<Result<DatasetRevisionRecord, AppError>> {
      return inProject(uow, ctx, projectId, WRITE, async (pctx, repos) => {
        const dataset = await repos.datasets.findById(ctx.organization.id, projectId, datasetId);
        if (!dataset) return err(notFound('Jeu de données'));
        if (dataset.version !== expectedVersion) return err(staleVersion());
        if (!isDatasetKind(dataset.kind)) {
          return err(appError('VALIDATION', 'DATASET_KIND_UNKNOWN', 'Type de données inconnu.'));
        }
        const columns = DATASET_KINDS[dataset.kind].columns;
        let grid;
        try {
          grid = readGrid(input.content, input.delimiter);
        } catch {
          return err(
            appError(
              'VALIDATION',
              'IMPORT_UNREADABLE',
              'Fichier illisible : format non reconnu ou corrompu.',
            ),
          );
        }
        const mapping = input.mapping ?? autoMap(columns, grid.headers);
        const rawRows = gridToRows(columns, grid, mapping, input.units ?? {});
        return writeRevision(
          pctx,
          repos,
          projectId,
          datasetId,
          dataset,
          rawRows,
          input.note,
          expectedVersion,
        );
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
