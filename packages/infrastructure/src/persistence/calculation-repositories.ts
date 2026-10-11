import { err, ok } from '@consulpro/calc-core';
import type {
  CalculationListItem,
  CalculationRecord,
  CalculationRepositories,
  DatasetRecord,
  DatasetRevisionRecord,
  RevisionRecord,
  RevisionSummary,
  SearchHit,
  StudyRecord,
} from '@consulpro/application';
import type { Prisma } from '@consulpro/db';
import type { DatasetRow } from '@consulpro/domain';

type Tx = Prisma.TransactionClient;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

const json = (value: unknown) => value as Prisma.InputJsonValue;
const jsonOrNull = (value: unknown) =>
  (value === null || value === undefined
    ? (null as unknown as Prisma.NullableJsonNullValueInput)
    : value) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

const summarySelect = {
  id: true,
  calculationId: true,
  number: true,
  resultStatus: true,
  workflowStatus: true,
  authorId: true,
  createdAt: true,
  author: { select: { name: true } },
} as const;

type SummaryRow = {
  id: string;
  calculationId: string;
  number: number;
  resultStatus: RevisionSummary['resultStatus'];
  workflowStatus: RevisionSummary['workflowStatus'];
  authorId: string;
  createdAt: Date;
  author: { name: string };
};

const toSummary = (r: SummaryRow): RevisionSummary => ({
  id: r.id,
  calculationId: r.calculationId,
  number: r.number,
  resultStatus: r.resultStatus,
  workflowStatus: r.workflowStatus,
  authorId: r.authorId,
  authorName: r.author.name,
  createdAt: r.createdAt,
});

const toCalculation = (c: CalculationRecord): CalculationRecord => ({
  id: c.id,
  organizationId: c.organizationId,
  projectId: c.projectId,
  studyId: c.studyId,
  engineId: c.engineId,
  title: c.title,
  currentRevisionId: c.currentRevisionId,
  version: c.version,
  createdAt: c.createdAt,
});

const toDataset = (d: DatasetRecord): DatasetRecord => ({
  id: d.id,
  organizationId: d.organizationId,
  projectId: d.projectId,
  kind: d.kind,
  discipline: d.discipline,
  title: d.title,
  currentRevisionId: d.currentRevisionId,
  version: d.version,
  createdAt: d.createdAt,
});

/** Échappe les jokers de LIKE (la recherche est une simple sous-chaîne). */
const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Repositories des études, calculs, données, notifications et recherche. Les écritures sur
 * les révisions et les avis sont des insertions seules ; la base refuse toute modification.
 */
export function createCalculationRepositories(tx: Tx): CalculationRepositories {
  const calculationItems = async (where: Prisma.CalculationWhereInput) => {
    const rows = await tx.calculation.findMany({
      where,
      include: { currentRevision: { select: summarySelect } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((c): CalculationListItem => ({
      ...toCalculation(c),
      current: c.currentRevision ? toSummary(c.currentRevision) : null,
    }));
  };

  return {
    studies: {
      async list(organizationId, projectId) {
        const rows = await tx.study.findMany({
          where: { organizationId, projectId },
          include: {
            createdBy: { select: { name: true } },
            _count: { select: { calculations: true } },
          },
          orderBy: [{ discipline: 'asc' }, { createdAt: 'asc' }],
        });
        return rows.map((s): StudyRecord => ({
          id: s.id,
          organizationId: s.organizationId,
          projectId: s.projectId,
          discipline: s.discipline,
          title: s.title,
          description: s.description,
          version: s.version,
          createdById: s.createdById,
          createdByName: s.createdBy.name,
          createdAt: s.createdAt,
          calculationCount: s._count.calculations,
        }));
      },
      async findById(organizationId, projectId, id) {
        const s = await tx.study.findFirst({
          where: { organizationId, projectId, id },
          include: {
            createdBy: { select: { name: true } },
            _count: { select: { calculations: true } },
          },
        });
        return s
          ? {
              id: s.id,
              organizationId: s.organizationId,
              projectId: s.projectId,
              discipline: s.discipline,
              title: s.title,
              description: s.description,
              version: s.version,
              createdById: s.createdById,
              createdByName: s.createdBy.name,
              createdAt: s.createdAt,
              calculationCount: s._count.calculations,
            }
          : null;
      },
      async create(input) {
        await tx.study.createMany({ data: [input] });
      },
      async update(organizationId, projectId, id, fields, version) {
        const { count } = await tx.study.updateMany({
          where: { organizationId, projectId, id, version },
          data: { ...fields, version: { increment: 1 } },
        });
        return count === 1;
      },
    },

    calculations: {
      listByStudy: (organizationId, studyId) => calculationItems({ organizationId, studyId }),
      listByProject: (organizationId, projectId) => calculationItems({ organizationId, projectId }),
      async findById(organizationId, projectId, id) {
        const c = await tx.calculation.findFirst({ where: { organizationId, projectId, id } });
        return c ? toCalculation(c) : null;
      },
      async create(input) {
        await tx.calculation.createMany({ data: [input] });
      },
      async setCurrentRevision(organizationId, id, revisionId, version) {
        const { count } = await tx.calculation.updateMany({
          where: { organizationId, id, version },
          data: { currentRevisionId: revisionId, version: { increment: 1 } },
        });
        return count === 1;
      },
      async obsolete(organizationId, calculationIds) {
        const rows = await tx.calculationDependency.findMany({
          where: {
            organizationId,
            revision: { currentOf: { id: { in: [...calculationIds] } } },
          },
          select: {
            sourceRevisionId: true,
            sourceCalculation: { select: { currentRevisionId: true } },
            revision: { select: { calculationId: true } },
          },
        });
        return new Set(
          rows
            .filter((d) => d.sourceCalculation.currentRevisionId !== d.sourceRevisionId)
            .map((d) => d.revision.calculationId),
        );
      },
    },

    revisions: {
      async nextNumber(calculationId) {
        const { _max } = await tx.calculationRevision.aggregate({
          where: { calculationId },
          _max: { number: true },
        });
        return (_max.number ?? 0) + 1;
      },
      async create(r) {
        try {
          await tx.calculationRevision.createMany({
            data: [
              {
                id: r.id,
                organizationId: r.organizationId,
                projectId: r.projectId,
                calculationId: r.calculationId,
                number: r.number,
                engineId: r.engineId,
                engineVersion: r.engineVersion,
                standards: json(r.standards),
                parameterSnapshot: json(r.parameterSnapshot),
                parameterSnapshotHash: r.parameterSnapshotHash,
                rawInputs: json(r.rawInputs),
                inputs: jsonOrNull(r.inputs),
                outputs: jsonOrNull(r.outputs),
                checks: json(r.checks),
                warnings: json(r.warnings),
                hypotheses: json(r.hypotheses),
                trace: json(r.trace),
                errors: json(r.errors),
                failure: jsonOrNull(r.failure),
                presentation: json(r.presentation),
                resultStatus: r.resultStatus,
                authorId: r.authorId,
              },
            ],
          });
          return ok(undefined);
        } catch (error) {
          if (isUniqueViolation(error)) return err('NUMBER_TAKEN' as const);
          throw error;
        }
      },
      async findById(organizationId, projectId, id) {
        const r = await tx.calculationRevision.findFirst({
          where: { organizationId, projectId, id },
          include: { author: { select: { name: true } } },
        });
        if (!r) return null;
        // Contenu enregistré par l'application à partir du CalculationResult du moteur.
        return {
          ...toSummary(r),
          organizationId: r.organizationId,
          projectId: r.projectId,
          engineId: r.engineId,
          engineVersion: r.engineVersion,
          standards: r.standards as unknown as RevisionRecord['standards'],
          parameterSnapshot: r.parameterSnapshot as unknown as RevisionRecord['parameterSnapshot'],
          parameterSnapshotHash: r.parameterSnapshotHash,
          rawInputs: r.rawInputs as RevisionRecord['rawInputs'],
          inputs: r.inputs,
          outputs: r.outputs as RevisionRecord['outputs'],
          checks: r.checks as unknown as RevisionRecord['checks'],
          warnings: r.warnings as unknown as RevisionRecord['warnings'],
          hypotheses: r.hypotheses as unknown as RevisionRecord['hypotheses'],
          trace: r.trace as unknown as RevisionRecord['trace'],
          errors: r.errors as unknown as RevisionRecord['errors'],
          failure: r.failure as unknown as RevisionRecord['failure'],
          presentation: r.presentation as unknown as RevisionRecord['presentation'],
        };
      },
      async list(organizationId, calculationId) {
        const rows = await tx.calculationRevision.findMany({
          where: { organizationId, calculationId },
          select: summarySelect,
          orderBy: { number: 'desc' },
        });
        return rows.map(toSummary);
      },
    },

    reviews: {
      async create(input) {
        // Le trigger apply_calculation_review revérifie les règles et met à jour le statut.
        await tx.calculationReview.createMany({ data: [input] });
      },
      async list(organizationId, revisionId) {
        const rows = await tx.calculationReview.findMany({
          where: { organizationId, revisionId },
          include: { reviewer: { select: { name: true } } },
          orderBy: { id: 'asc' },
        });
        return rows.map((r) => ({
          id: r.id,
          revisionId: r.revisionId,
          type: r.type,
          decision: r.decision,
          comment: r.comment,
          reviewerId: r.reviewerId,
          reviewerName: r.reviewer.name,
          createdAt: r.createdAt,
        }));
      },
    },

    dependencies: {
      async create(entries) {
        if (entries.length > 0) await tx.calculationDependency.createMany({ data: [...entries] });
      },
      async listForRevision(organizationId, revisionId) {
        const rows = await tx.calculationDependency.findMany({
          where: { organizationId, revisionId },
          include: {
            sourceCalculation: { select: { title: true, currentRevisionId: true } },
            sourceRevision: { select: { number: true } },
          },
          orderBy: { input: 'asc' },
        });
        return rows.map((d) => ({
          organizationId: d.organizationId,
          projectId: d.projectId,
          revisionId: d.revisionId,
          input: d.input,
          sourceCalculationId: d.sourceCalculationId,
          sourceRevisionId: d.sourceRevisionId,
          output: d.output,
          sourceCalculationTitle: d.sourceCalculation.title,
          sourceRevisionNumber: d.sourceRevision.number,
          sourceCurrentRevisionId: d.sourceCalculation.currentRevisionId,
        }));
      },
    },

    datasets: {
      async list(organizationId, projectId) {
        const rows = await tx.dataset.findMany({
          where: { organizationId, projectId },
          include: {
            currentRevision: {
              select: {
                id: true,
                datasetId: true,
                number: true,
                rowCount: true,
                note: true,
                authorId: true,
                createdAt: true,
                author: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        });
        return rows.map((d) => ({
          ...toDataset(d),
          current: d.currentRevision
            ? {
                id: d.currentRevision.id,
                datasetId: d.currentRevision.datasetId,
                number: d.currentRevision.number,
                rowCount: d.currentRevision.rowCount,
                note: d.currentRevision.note,
                authorId: d.currentRevision.authorId,
                authorName: d.currentRevision.author.name,
                createdAt: d.currentRevision.createdAt,
              }
            : null,
        }));
      },
      async findById(organizationId, projectId, id) {
        const d = await tx.dataset.findFirst({ where: { organizationId, projectId, id } });
        return d ? toDataset(d) : null;
      },
      async create(input) {
        await tx.dataset.createMany({ data: [input] });
      },
      async setCurrentRevision(organizationId, id, revisionId, version) {
        const { count } = await tx.dataset.updateMany({
          where: { organizationId, id, version },
          data: { currentRevisionId: revisionId, version: { increment: 1 } },
        });
        return count === 1;
      },
      async nextRevisionNumber(datasetId) {
        const { _max } = await tx.datasetRevision.aggregate({
          where: { datasetId },
          _max: { number: true },
        });
        return (_max.number ?? 0) + 1;
      },
      async createRevision(input) {
        try {
          await tx.datasetRevision.createMany({
            data: [{ ...input, rows: json(input.rows), rowCount: input.rows.length }],
          });
          return ok(undefined);
        } catch (error) {
          if (isUniqueViolation(error)) return err('NUMBER_TAKEN' as const);
          throw error;
        }
      },
      async findRevision(organizationId, datasetId, id) {
        const r = await tx.datasetRevision.findFirst({
          where: { organizationId, datasetId, id },
          include: { author: { select: { name: true } } },
        });
        return r
          ? {
              id: r.id,
              datasetId: r.datasetId,
              number: r.number,
              rows: r.rows as unknown as DatasetRow[],
              rowCount: r.rowCount,
              note: r.note,
              authorId: r.authorId,
              authorName: r.author.name,
              createdAt: r.createdAt,
            }
          : null;
      },
      async listRevisions(organizationId, datasetId) {
        const rows = await tx.datasetRevision.findMany({
          where: { organizationId, datasetId },
          select: {
            id: true,
            datasetId: true,
            number: true,
            rowCount: true,
            note: true,
            authorId: true,
            createdAt: true,
            author: { select: { name: true } },
          },
          orderBy: { number: 'desc' },
        });
        return rows.map((r): Omit<DatasetRevisionRecord, 'rows'> => ({
          id: r.id,
          datasetId: r.datasetId,
          number: r.number,
          rowCount: r.rowCount,
          note: r.note,
          authorId: r.authorId,
          authorName: r.author.name,
          createdAt: r.createdAt,
        }));
      },
    },

    notifications: {
      async create(entries) {
        if (entries.length === 0) return;
        await tx.notification.createMany({
          data: entries.map((e) => ({
            userId: e.userId,
            organizationId: e.organizationId,
            type: e.type,
            title: e.title,
            body: e.body ?? null,
            link: e.link ?? null,
          })),
        });
      },
      async list(userId, { cursor, limit, unreadOnly }) {
        const rows = await tx.notification.findMany({
          where: {
            userId,
            ...(unreadOnly ? { readAt: null } : {}),
            ...(cursor ? { id: { lt: cursor } } : {}),
          },
          orderBy: { id: 'desc' },
          take: limit,
        });
        return rows.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          link: n.link,
          readAt: n.readAt,
          createdAt: n.createdAt,
        }));
      },
      async countUnread(userId) {
        return tx.notification.count({ where: { userId, readAt: null } });
      },
      async markRead(userId, ids, at) {
        const { count } = await tx.notification.updateMany({
          where: { userId, readAt: null, ...(ids ? { id: { in: [...ids] } } : {}) },
          data: { readAt: at },
        });
        return count;
      },
    },

    search: {
      async run(organizationId, text, limit) {
        const pattern = `%${likeEscape(text)}%`;
        const rows = await tx.$queryRaw<
          {
            type: SearchHit['type'];
            id: string;
            project_id: string;
            study_id: string | null;
            title: string;
            subtitle: string;
          }[]
        >`
          SELECT * FROM (
            SELECT 'project' AS type, p.id, p.id AS project_id, NULL::uuid AS study_id,
                   p.code || ' — ' || p.name AS title, coalesce(p.client, '') AS subtitle, 0 AS rank
              FROM projects p
             WHERE p.organization_id = ${organizationId}::uuid
               AND app_search_text(p.code || ' ' || p.name || ' ' || coalesce(p.client, ''))
                   LIKE app_search_text(${pattern}) ESCAPE '\\'
            UNION ALL
            SELECT 'study', s.id, s.project_id, s.id, s.title, p.code, 1
              FROM studies s JOIN projects p ON p.id = s.project_id
             WHERE s.organization_id = ${organizationId}::uuid
               AND app_search_text(s.title) LIKE app_search_text(${pattern}) ESCAPE '\\'
            UNION ALL
            SELECT 'calculation', c.id, c.project_id, c.study_id, c.title, p.code, 2
              FROM calculations c JOIN projects p ON p.id = c.project_id
             WHERE c.organization_id = ${organizationId}::uuid
               AND app_search_text(c.title) LIKE app_search_text(${pattern}) ESCAPE '\\'
          ) hits
          ORDER BY rank, title
          LIMIT ${limit}`;
        return rows.map((r) => ({
          type: r.type,
          id: r.id,
          projectId: r.project_id,
          studyId: r.study_id,
          title: r.title,
          subtitle: r.subtitle,
        }));
      },
    },

    users: {
      async preferences(userId) {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { timeZone: true, twoFactorEnabled: true },
        });
        return user ?? null;
      },
      async setTimeZone(userId, timeZone) {
        await tx.user.update({ where: { id: userId }, data: { timeZone } });
      },
    },
  };
}
