/**
 * Implémentation en mémoire des ports Études / Calculs / Données / Notifications (tests
 * unitaires). Elle reproduit la transition de statut opérée en base par le trigger des avis.
 */
import { err, ok } from '@consulpro/calc-core';

import type {
  CalculationRecord,
  CalculationRepositories,
  DatasetLinkEntry,
  DatasetRecord,
  DatasetRevisionRecord,
  DependencyEntry,
  NotificationEntry,
  NotificationRecord,
  ReviewRecord,
  RevisionRecord,
  StudyRecord,
} from '../ports-calculations';
import type { ProjectState } from './in-memory-projects';

export interface CalculationState {
  users: (ProjectState['users'][number] & {
    timeZone?: string | null;
    twoFactorEnabled?: boolean;
  })[];
  studies: Omit<StudyRecord, 'createdByName' | 'calculationCount'>[];
  calculations: CalculationRecord[];
  revisions: Omit<RevisionRecord, 'authorName'>[];
  reviews: (Omit<ReviewRecord, 'reviewerName'> & { organizationId: string; projectId: string })[];
  dependencies: DependencyEntry[];
  datasetLinks: DatasetLinkEntry[];
  datasets: DatasetRecord[];
  datasetRevisions: Omit<DatasetRevisionRecord, 'authorName'>[];
  notifications: (Omit<NotificationEntry, 'body' | 'link'> & NotificationRecord)[];
}

/** Copie sans certaines propriétés. */
function without<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !(keys as readonly PropertyKey[]).includes(key)),
  ) as Omit<T, K>;
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function calculationRepositories(
  s: CalculationState & Pick<ProjectState, 'projects'>,
  now: () => Date,
  nextId: () => string,
): CalculationRepositories {
  const nameOf = (id: string) => s.users.find((u) => u.id === id)?.name ?? '';
  const summary = (r: Omit<RevisionRecord, 'authorName'>) => ({
    id: r.id,
    calculationId: r.calculationId,
    number: r.number,
    resultStatus: r.resultStatus,
    workflowStatus: r.workflowStatus,
    authorId: r.authorId,
    authorName: nameOf(r.authorId),
    createdAt: r.createdAt,
  });
  const listItem = (c: CalculationRecord) => {
    const current = s.revisions.find((r) => r.id === c.currentRevisionId);
    return { ...c, current: current ? summary(current) : null };
  };
  const study = (x: CalculationState['studies'][number]): StudyRecord => ({
    ...x,
    createdByName: nameOf(x.createdById),
    calculationCount: s.calculations.filter((c) => c.studyId === x.id).length,
  });
  const datasetRevision = (r: CalculationState['datasetRevisions'][number]) => ({
    ...r,
    authorName: nameOf(r.authorId),
  });

  return {
    studies: {
      list: async (organizationId, projectId) =>
        s.studies
          .filter((x) => x.organizationId === organizationId && x.projectId === projectId)
          .map(study),
      findById: async (organizationId, projectId, id) => {
        const x = s.studies.find(
          (y) => y.organizationId === organizationId && y.projectId === projectId && y.id === id,
        );
        return x ? study(x) : null;
      },
      create: async (input) => {
        s.studies.push({ ...input, version: 1, createdAt: now() });
      },
      update: async (organizationId, projectId, id, fields, version) => {
        const match = (x: CalculationState['studies'][number]) =>
          x.organizationId === organizationId &&
          x.projectId === projectId &&
          x.id === id &&
          x.version === version;
        const found = s.studies.some(match);
        s.studies = s.studies.map((x) =>
          match(x) ? { ...x, ...fields, version: x.version + 1 } : x,
        );
        return found;
      },
    },
    calculations: {
      listByStudy: async (organizationId, studyId) =>
        s.calculations
          .filter((c) => c.organizationId === organizationId && c.studyId === studyId)
          .map(listItem),
      listByProject: async (organizationId, projectId) =>
        s.calculations
          .filter((c) => c.organizationId === organizationId && c.projectId === projectId)
          .map(listItem),
      findById: async (organizationId, projectId, id) =>
        s.calculations.find(
          (c) => c.organizationId === organizationId && c.projectId === projectId && c.id === id,
        ) ?? null,
      create: async (input) => {
        s.calculations.push({
          ...without(input, 'createdById'),
          currentRevisionId: null,
          version: 1,
          createdAt: now(),
        });
      },
      setCurrentRevision: async (organizationId, id, revisionId, version) => {
        const match = (c: CalculationRecord) =>
          c.organizationId === organizationId && c.id === id && c.version === version;
        const found = s.calculations.some(match);
        s.calculations = s.calculations.map((c) =>
          match(c) ? { ...c, currentRevisionId: revisionId, version: c.version + 1 } : c,
        );
        return found;
      },
      obsolete: async (_organizationId, ids) =>
        new Set(
          s.calculations
            .filter((c) => ids.includes(c.id))
            .filter(
              (c) =>
                s.dependencies.some(
                  (d) =>
                    d.revisionId === c.currentRevisionId &&
                    s.calculations.find((x) => x.id === d.sourceCalculationId)
                      ?.currentRevisionId !== d.sourceRevisionId,
                ) ||
                s.datasetLinks.some(
                  (l) =>
                    l.revisionId === c.currentRevisionId &&
                    s.datasets.find((x) => x.id === l.datasetId)?.currentRevisionId !==
                      l.datasetRevisionId,
                ),
            )
            .map((c) => c.id),
        ),
    },
    revisions: {
      nextNumber: async (calculationId) =>
        Math.max(
          0,
          ...s.revisions.filter((r) => r.calculationId === calculationId).map((r) => r.number),
        ) + 1,
      create: async (input) => {
        if (
          s.revisions.some(
            (r) => r.calculationId === input.calculationId && r.number === input.number,
          )
        ) {
          return err('NUMBER_TAKEN');
        }
        s.revisions.push({ ...input, workflowStatus: 'COMPUTED', createdAt: now() });
        return ok(undefined);
      },
      findById: async (organizationId, projectId, id) => {
        const r = s.revisions.find(
          (x) => x.organizationId === organizationId && x.projectId === projectId && x.id === id,
        );
        return r ? { ...r, authorName: nameOf(r.authorId) } : null;
      },
      list: async (organizationId, calculationId) =>
        s.revisions
          .filter((r) => r.organizationId === organizationId && r.calculationId === calculationId)
          .sort((a, b) => b.number - a.number)
          .map(summary),
    },
    reviews: {
      create: async (input) => {
        s.reviews.push({ ...input, id: nextId(), createdAt: now() });
        // Comme le trigger apply_calculation_review (règles contrôlées avant par le domaine).
        const next =
          input.type === 'VALIDATION'
            ? 'VALIDATED'
            : input.decision === 'APPROVED'
              ? 'VERIFIED'
              : 'REJECTED';
        s.revisions = s.revisions.map((r) =>
          r.id === input.revisionId ? { ...r, workflowStatus: next } : r,
        );
      },
      list: async (organizationId, revisionId) =>
        s.reviews
          .filter((r) => r.organizationId === organizationId && r.revisionId === revisionId)
          .map((r) => ({ ...r, reviewerName: nameOf(r.reviewerId) })),
    },
    dependencies: {
      create: async (entries) => {
        s.dependencies.push(...entries);
      },
      listForRevision: async (organizationId, revisionId) =>
        s.dependencies
          .filter((d) => d.organizationId === organizationId && d.revisionId === revisionId)
          .map((d) => {
            const source = s.calculations.find((c) => c.id === d.sourceCalculationId);
            return {
              ...d,
              sourceCalculationTitle: source?.title ?? '',
              sourceRevisionNumber:
                s.revisions.find((r) => r.id === d.sourceRevisionId)?.number ?? 0,
              sourceCurrentRevisionId: source?.currentRevisionId ?? null,
            };
          }),
    },
    datasetLinks: {
      create: async (entries) => {
        s.datasetLinks.push(...entries);
      },
      listForRevision: async (organizationId, revisionId) =>
        s.datasetLinks
          .filter((l) => l.organizationId === organizationId && l.revisionId === revisionId)
          .map((l) => {
            const dataset = s.datasets.find((d) => d.id === l.datasetId);
            const revision = s.datasetRevisions.find((r) => r.id === l.datasetRevisionId);
            return {
              ...l,
              datasetTitle: dataset?.title ?? '',
              datasetRevisionNumber: revision?.number ?? 0,
              rowCount: revision?.rowCount ?? 0,
              datasetCurrentRevisionId: dataset?.currentRevisionId ?? null,
            };
          }),
    },
    datasets: {
      list: async (organizationId, projectId) =>
        s.datasets
          .filter((d) => d.organizationId === organizationId && d.projectId === projectId)
          .map((d) => {
            const current = s.datasetRevisions.find((r) => r.id === d.currentRevisionId);
            return { ...d, current: current ? without(datasetRevision(current), 'rows') : null };
          }),
      findById: async (organizationId, projectId, id) =>
        s.datasets.find(
          (d) => d.organizationId === organizationId && d.projectId === projectId && d.id === id,
        ) ?? null,
      create: async (input) => {
        s.datasets.push({
          ...without(input, 'createdById'),
          currentRevisionId: null,
          version: 1,
          createdAt: now(),
        });
      },
      setCurrentRevision: async (organizationId, id, revisionId, version) => {
        const match = (d: DatasetRecord) =>
          d.organizationId === organizationId && d.id === id && d.version === version;
        const found = s.datasets.some(match);
        s.datasets = s.datasets.map((d) =>
          match(d) ? { ...d, currentRevisionId: revisionId, version: d.version + 1 } : d,
        );
        return found;
      },
      nextRevisionNumber: async (datasetId) =>
        Math.max(
          0,
          ...s.datasetRevisions.filter((r) => r.datasetId === datasetId).map((r) => r.number),
        ) + 1,
      createRevision: async (full) => {
        const input = without(full, 'organizationId', 'projectId');
        if (
          s.datasetRevisions.some(
            (r) => r.datasetId === input.datasetId && r.number === input.number,
          )
        ) {
          return err('NUMBER_TAKEN');
        }
        s.datasetRevisions.push({ ...input, rowCount: input.rows.length, createdAt: now() });
        return ok(undefined);
      },
      findRevision: async (_organizationId, datasetId, id) => {
        const r = s.datasetRevisions.find((x) => x.datasetId === datasetId && x.id === id);
        return r ? datasetRevision(r) : null;
      },
      listRevisions: async (_organizationId, datasetId) =>
        s.datasetRevisions
          .filter((r) => r.datasetId === datasetId)
          .sort((a, b) => b.number - a.number)
          .map((r) => without(datasetRevision(r), 'rows')),
    },
    notifications: {
      create: async (entries) => {
        for (const e of entries) {
          s.notifications.push({
            ...e,
            id: nextId(),
            body: e.body ?? null,
            link: e.link ?? null,
            readAt: null,
            createdAt: now(),
          });
        }
      },
      list: async (userId, { cursor, limit, unreadOnly }) =>
        s.notifications
          .filter(
            (n) =>
              n.userId === userId &&
              (!unreadOnly || n.readAt === null) &&
              (cursor === undefined || n.id < cursor),
          )
          .sort((a, b) => (a.id < b.id ? 1 : -1))
          .slice(0, limit),
      countUnread: async (userId) =>
        s.notifications.filter((n) => n.userId === userId && n.readAt === null).length,
      markRead: async (userId, ids, at) => {
        let count = 0;
        s.notifications = s.notifications.map((n) => {
          if (n.userId !== userId || n.readAt !== null || (ids && !ids.includes(n.id))) return n;
          count += 1;
          return { ...n, readAt: at };
        });
        return count;
      },
    },
    search: {
      run: async (organizationId, text, limit) => {
        const q = fold(text);
        const projects = s.projects.filter((p) => p.organizationId === organizationId);
        return [
          ...projects
            .filter((p) => fold(`${p.code} ${p.name}`).includes(q))
            .map((p) => ({
              type: 'project' as const,
              id: p.id,
              projectId: p.id,
              studyId: null,
              title: `${p.code} — ${p.name}`,
              subtitle: p.client ?? '',
            })),
          ...s.studies
            .filter((x) => x.organizationId === organizationId && fold(x.title).includes(q))
            .map((x) => ({
              type: 'study' as const,
              id: x.id,
              projectId: x.projectId,
              studyId: x.id,
              title: x.title,
              subtitle: projects.find((p) => p.id === x.projectId)?.code ?? '',
            })),
          ...s.calculations
            .filter((c) => c.organizationId === organizationId && fold(c.title).includes(q))
            .map((c) => ({
              type: 'calculation' as const,
              id: c.id,
              projectId: c.projectId,
              studyId: c.studyId,
              title: c.title,
              subtitle: projects.find((p) => p.id === c.projectId)?.code ?? '',
            })),
        ].slice(0, limit);
      },
    },
    users: {
      preferences: async (userId) => {
        const user = s.users.find((u) => u.id === userId);
        return user
          ? { timeZone: user.timeZone ?? null, twoFactorEnabled: user.twoFactorEnabled ?? false }
          : null;
      },
      setTimeZone: async (userId, timeZone) => {
        s.users = s.users.map((u) => (u.id === userId ? { ...u, timeZone } : u));
      },
    },
  };
}
