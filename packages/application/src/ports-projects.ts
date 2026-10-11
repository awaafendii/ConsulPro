import type { ParameterValue, Result } from '@consulpro/calc-core';
import type {
  ActivityType,
  Discipline,
  OrgRole,
  ProjectRole,
  ProjectStatus,
} from '@consulpro/domain';
import type { ParameterDefinition } from '@consulpro/standards';

/*
 * Ports des projets et des référentiels (Phase 3). La base filtre en plus par RLS :
 * un projet inaccessible est simplement introuvable.
 */

export interface ProjectRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly client: string | null;
  readonly location: string | null;
  readonly status: ProjectStatus;
  /** Date ISO (AAAA-MM-JJ). */
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly version: number;
  readonly createdById: string;
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
}

export type ProjectFields = Pick<
  ProjectRecord,
  'code' | 'name' | 'description' | 'client' | 'location' | 'startDate' | 'endDate'
>;

export interface ProjectMemberRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly role: ProjectRole;
  readonly version: number;
  readonly createdAt: Date;
}

export interface ProjectMemberView extends ProjectMemberRecord {
  readonly name: string;
  readonly email: string;
  readonly organizationRole: OrgRole;
}

export interface ActivityEntry {
  readonly organizationId: string;
  readonly projectId: string;
  readonly actorUserId: string | null;
  readonly type: ActivityType;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly summary?: Readonly<Record<string, unknown>>;
}

export interface ActivityRecord {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly type: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly summary: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

export type StandardVersionStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';

export interface StandardHeader {
  readonly id: string;
  readonly organizationId: string | null;
  readonly code: string;
  readonly title: string;
  readonly publisher: string | null;
  readonly discipline: Discipline | null;
  readonly nature: 'NORM' | 'GUIDE' | 'PRACTICE' | 'CUSTOM';
}

export interface StandardRecord extends StandardHeader {
  readonly versions: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: StandardVersionStatus;
    readonly publishedAt: Date | null;
    readonly parameterCount: number;
    readonly toVerifyCount: number;
  }[];
}

export interface StandardVersionDetail {
  readonly id: string;
  readonly label: string;
  readonly status: StandardVersionStatus;
  readonly sourceNotes: string | null;
  readonly publishedAt: Date | null;
  readonly standard: StandardHeader;
  readonly parameters: readonly ParameterDefinition[];
  readonly rules: readonly {
    readonly code: string;
    readonly description: string;
    readonly severity: 'BLOCKING' | 'WARNING' | 'INFO';
    readonly clause: string | null;
    readonly parameterKeys: readonly string[];
    readonly implementation: string;
  }[];
}

export interface VersionRef {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly title: string;
}

export interface OverrideRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly standardVersionId: string;
  readonly key: string;
  readonly value: ParameterValue;
  readonly justification: string;
  readonly createdById: string;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface ProjectRepositories {
  readonly projects: {
    /** Projets accessibles à l'utilisateur courant (filtrage RLS). */
    list(organizationId: string, status: ProjectStatus | 'ALL'): Promise<ProjectRecord[]>;
    findById(organizationId: string, id: string): Promise<ProjectRecord | null>;
    create(
      input: ProjectFields & { id: string; organizationId: string; createdById: string },
    ): Promise<Result<void, 'CODE_TAKEN'>>;
    update(
      organizationId: string,
      id: string,
      fields: ProjectFields,
      expectedVersion: number,
    ): Promise<Result<boolean, 'CODE_TAKEN'>>;
    setStatus(
      organizationId: string,
      id: string,
      status: ProjectStatus,
      expectedVersion: number,
      at: Date,
    ): Promise<boolean>;
    disciplines(projectIds: readonly string[]): Promise<Map<string, Discipline[]>>;
    setDisciplines(
      organizationId: string,
      projectId: string,
      disciplines: readonly Discipline[],
      newId: () => string,
    ): Promise<void>;
  };
  readonly projectMembers: {
    list(organizationId: string, projectId: string): Promise<ProjectMemberView[]>;
    findById(
      organizationId: string,
      projectId: string,
      id: string,
    ): Promise<ProjectMemberRecord | null>;
    findByUserId(
      organizationId: string,
      projectId: string,
      userId: string,
    ): Promise<ProjectMemberRecord | null>;
    /** Rôles de l'utilisateur sur les projets où il est membre. */
    rolesOfUser(organizationId: string, userId: string): Promise<Map<string, ProjectRole>>;
    add(input: {
      id: string;
      organizationId: string;
      projectId: string;
      userId: string;
      role: ProjectRole;
    }): Promise<ProjectMemberRecord>;
    updateRole(
      organizationId: string,
      projectId: string,
      id: string,
      role: ProjectRole,
      expectedVersion: number,
    ): Promise<boolean>;
    remove(
      organizationId: string,
      projectId: string,
      id: string,
      expectedVersion: number,
    ): Promise<boolean>;
  };
  readonly activity: {
    append(entry: ActivityEntry): Promise<void>;
    list(
      organizationId: string,
      projectId: string,
      page: { cursor?: string | undefined; limit: number },
    ): Promise<ActivityRecord[]>;
  };
  readonly standards: {
    /** Référentiels système et de l'organisation courante. */
    list(): Promise<StandardRecord[]>;
    findVersion(id: string): Promise<StandardVersionDetail | null>;
    /** Dernière version publiée de chaque référentiel d'une discipline. */
    latestPublished(discipline: Discipline): Promise<VersionRef[]>;
    publishSystem(versionId: string): Promise<Result<void, 'FORBIDDEN' | 'NOT_FOUND'>>;
    deprecateSystem(versionId: string): Promise<Result<void, 'FORBIDDEN' | 'NOT_FOUND'>>;
  };
  readonly projectStandards: {
    list(projectId: string): Promise<(VersionRef & { discipline: Discipline })[]>;
    set(
      organizationId: string,
      projectId: string,
      discipline: Discipline,
      standardVersionIds: readonly string[],
    ): Promise<void>;
  };
  readonly overrides: {
    /** `projectId` null : surcharges d'organisation ; sinon celles du projet. */
    list(
      organizationId: string,
      projectId: string | null,
    ): Promise<(OverrideRecord & { createdByName: string })[]>;
    findById(
      organizationId: string,
      id: string,
    ): Promise<(OverrideRecord & { createdByName: string }) | null>;
    findSame(
      organizationId: string,
      projectId: string | null,
      standardVersionId: string,
      key: string,
    ): Promise<OverrideRecord | null>;
    create(input: Omit<OverrideRecord, 'version' | 'updatedAt'>): Promise<OverrideRecord>;
    update(
      organizationId: string,
      id: string,
      change: { value: ParameterValue; justification: string },
      expectedVersion: number,
    ): Promise<boolean>;
    delete(organizationId: string, id: string, expectedVersion: number): Promise<boolean>;
  };
}
