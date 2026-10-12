import type {
  CalcFailure,
  Check,
  EnginePresentation,
  FieldError,
  Hypothesis,
  ParameterSnapshotEntry,
  Result,
  StandardRef,
  TraceStep,
  Warning,
} from '@consulpro/calc-core';
import type {
  DatasetRow,
  Discipline,
  ResultStatus,
  ReviewDecision,
  ReviewType,
  WorkflowStatus,
} from '@consulpro/domain';

/*
 * Ports des études, calculs, données de projet, notifications et recherche (Phase 3,
 * lots C et D). La base filtre en plus par RLS (accès au projet).
 */

export interface StudyRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly discipline: Discipline;
  readonly title: string;
  readonly description: string | null;
  readonly version: number;
  readonly createdById: string;
  readonly createdByName: string;
  readonly createdAt: Date;
  readonly calculationCount: number;
}

export interface RevisionSummary {
  readonly id: string;
  readonly calculationId: string;
  readonly number: number;
  readonly resultStatus: ResultStatus;
  readonly workflowStatus: WorkflowStatus;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: Date;
}

export interface CalculationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly studyId: string;
  readonly engineId: string;
  readonly title: string;
  readonly currentRevisionId: string | null;
  readonly version: number;
  readonly createdAt: Date;
}

export interface CalculationListItem extends CalculationRecord {
  readonly current: RevisionSummary | null;
}

/** Présentation enregistrée avec la révision (libellés des paramètres compris). */
export interface StoredPresentation extends EnginePresentation {
  readonly title: string;
  /** Cas de référence contre-vérifiés au moment du calcul (absent : révision antérieure). */
  readonly referenceCases?: { readonly total: number; readonly checked: number };
  readonly parameters: readonly { readonly key: string; readonly label: string }[];
}

export interface RevisionRecord extends RevisionSummary {
  readonly organizationId: string;
  readonly projectId: string;
  readonly engineId: string;
  readonly engineVersion: string;
  readonly standards: readonly StandardRef[];
  readonly parameterSnapshot: readonly ParameterSnapshotEntry[];
  readonly parameterSnapshotHash: string;
  readonly rawInputs: Readonly<Record<string, unknown>>;
  readonly inputs: unknown;
  readonly outputs: Readonly<Record<string, unknown>> | null;
  readonly checks: readonly Check[];
  readonly warnings: readonly Warning[];
  readonly hypotheses: readonly Hypothesis[];
  readonly trace: readonly TraceStep[];
  readonly errors: readonly FieldError[];
  readonly failure: CalcFailure | null;
  readonly presentation: StoredPresentation;
}

export type NewRevision = Omit<RevisionRecord, 'workflowStatus' | 'authorName' | 'createdAt'>;

export interface ReviewRecord {
  readonly id: string;
  readonly revisionId: string;
  readonly type: ReviewType;
  readonly decision: ReviewDecision;
  readonly comment: string | null;
  readonly reviewerId: string;
  readonly reviewerName: string;
  readonly createdAt: Date;
}

export interface DependencyEntry {
  readonly organizationId: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly input: string;
  readonly sourceCalculationId: string;
  readonly sourceRevisionId: string;
  readonly output: string;
}

export interface DependencyRecord extends DependencyEntry {
  readonly sourceCalculationTitle: string;
  readonly sourceRevisionNumber: number;
  readonly sourceCurrentRevisionId: string | null;
}

export interface DatasetRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly kind: string;
  readonly discipline: Discipline;
  readonly title: string;
  readonly currentRevisionId: string | null;
  readonly version: number;
  readonly createdAt: Date;
}

export interface DatasetRevisionRecord {
  readonly id: string;
  readonly datasetId: string;
  readonly number: number;
  readonly rows: readonly DatasetRow[];
  readonly rowCount: number;
  readonly note: string | null;
  readonly authorId: string;
  readonly authorName: string;
  readonly createdAt: Date;
}

export interface DatasetListItem extends DatasetRecord {
  readonly current: Omit<DatasetRevisionRecord, 'rows'> | null;
}

export interface NotificationEntry {
  readonly userId: string;
  readonly organizationId: string;
  readonly type: string;
  readonly title: string;
  readonly body?: string;
  readonly link?: string;
}

export interface NotificationRecord {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly body: string | null;
  readonly link: string | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface SearchHit {
  readonly type: 'project' | 'study' | 'calculation';
  readonly id: string;
  readonly projectId: string;
  readonly studyId: string | null;
  readonly title: string;
  readonly subtitle: string;
}

export interface CalculationRepositories {
  readonly studies: {
    list(organizationId: string, projectId: string): Promise<StudyRecord[]>;
    findById(organizationId: string, projectId: string, id: string): Promise<StudyRecord | null>;
    create(input: {
      id: string;
      organizationId: string;
      projectId: string;
      discipline: Discipline;
      title: string;
      description: string | null;
      createdById: string;
    }): Promise<void>;
    update(
      organizationId: string,
      projectId: string,
      id: string,
      fields: { title: string; description: string | null },
      expectedVersion: number,
    ): Promise<boolean>;
  };
  readonly calculations: {
    listByStudy(organizationId: string, studyId: string): Promise<CalculationListItem[]>;
    listByProject(organizationId: string, projectId: string): Promise<CalculationListItem[]>;
    findById(
      organizationId: string,
      projectId: string,
      id: string,
    ): Promise<CalculationRecord | null>;
    create(input: {
      id: string;
      organizationId: string;
      projectId: string;
      studyId: string;
      engineId: string;
      title: string;
      createdById: string;
    }): Promise<void>;
    /** `false` si la version attendue ne correspond plus. */
    setCurrentRevision(
      organizationId: string,
      id: string,
      revisionId: string,
      expectedVersion: number,
    ): Promise<boolean>;
    /** Calculs dont la révision courante reprend une révision remplacée. */
    obsolete(organizationId: string, calculationIds: readonly string[]): Promise<Set<string>>;
  };
  readonly revisions: {
    nextNumber(calculationId: string): Promise<number>;
    create(revision: NewRevision): Promise<Result<void, 'NUMBER_TAKEN'>>;
    findById(organizationId: string, projectId: string, id: string): Promise<RevisionRecord | null>;
    list(organizationId: string, calculationId: string): Promise<RevisionSummary[]>;
  };
  readonly reviews: {
    create(input: {
      organizationId: string;
      projectId: string;
      revisionId: string;
      type: ReviewType;
      decision: ReviewDecision;
      comment: string | null;
      reviewerId: string;
    }): Promise<void>;
    list(organizationId: string, revisionId: string): Promise<ReviewRecord[]>;
  };
  readonly dependencies: {
    create(entries: readonly DependencyEntry[]): Promise<void>;
    listForRevision(organizationId: string, revisionId: string): Promise<DependencyRecord[]>;
  };
  readonly datasets: {
    list(organizationId: string, projectId: string): Promise<DatasetListItem[]>;
    findById(organizationId: string, projectId: string, id: string): Promise<DatasetRecord | null>;
    create(
      input: Omit<DatasetRecord, 'currentRevisionId' | 'version' | 'createdAt'> & {
        createdById: string;
      },
    ): Promise<void>;
    setCurrentRevision(
      organizationId: string,
      id: string,
      revisionId: string,
      expectedVersion: number,
    ): Promise<boolean>;
    nextRevisionNumber(datasetId: string): Promise<number>;
    createRevision(input: {
      id: string;
      organizationId: string;
      projectId: string;
      datasetId: string;
      number: number;
      rows: readonly DatasetRow[];
      note: string | null;
      authorId: string;
    }): Promise<Result<void, 'NUMBER_TAKEN'>>;
    findRevision(
      organizationId: string,
      datasetId: string,
      id: string,
    ): Promise<DatasetRevisionRecord | null>;
    listRevisions(
      organizationId: string,
      datasetId: string,
    ): Promise<Omit<DatasetRevisionRecord, 'rows'>[]>;
  };
  readonly notifications: {
    create(entries: readonly NotificationEntry[]): Promise<void>;
    list(
      userId: string,
      page: { cursor?: string | undefined; limit: number; unreadOnly: boolean },
    ): Promise<NotificationRecord[]>;
    countUnread(userId: string): Promise<number>;
    /** Marque comme lues (toutes si `ids` est null) ; renvoie le nombre de lignes marquées. */
    markRead(userId: string, ids: readonly string[] | null, at: Date): Promise<number>;
  };
  readonly search: {
    /** Projets, études et calculs accessibles (RLS) dont l'intitulé contient le texte. */
    run(organizationId: string, text: string, limit: number): Promise<SearchHit[]>;
  };
  readonly users: {
    preferences(
      userId: string,
    ): Promise<{ timeZone: string | null; twoFactorEnabled: boolean } | null>;
    setTimeZone(userId: string, timeZone: string | null): Promise<void>;
  };
}
