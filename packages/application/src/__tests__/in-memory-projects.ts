/**
 * Implémentation en mémoire des ports Projets et Référentiels (tests unitaires).
 * Le filtrage RLS n'est pas reproduit : l'application doit contrôler l'accès elle-même ;
 * la base l'applique en plus, ce que vérifient les tests d'intégration.
 */
import { err, ok } from '@consulpro/calc-core';
import type { Discipline, OrgRole } from '@consulpro/domain';

import type {
  ActivityRecord,
  OverrideRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectRepositories,
  StandardVersionDetail,
} from '../ports-projects';

export interface ProjectState {
  users: { id: string; email: string; name: string; platformAdmin?: boolean }[];
  memberships: { organizationId: string; userId: string; role: OrgRole }[];
  projects: ProjectRecord[];
  projectMembers: ProjectMemberRecord[];
  projectDisciplines: { projectId: string; discipline: Discipline }[];
  projectStandards: { projectId: string; discipline: Discipline; standardVersionId: string }[];
  activity: (ActivityRecord & { projectId: string; organizationId: string })[];
  standardVersions: StandardVersionDetail[];
  overrides: OverrideRecord[];
}

export function projectRepositories(
  s: ProjectState,
  now: () => Date,
  nextId: () => string,
  currentUserId: () => string | null,
): ProjectRepositories {
  const userOf = (id: string) => s.users.find((u) => u.id === id);
  const ref = (v: StandardVersionDetail) => ({
    id: v.id,
    code: v.standard.code,
    label: v.label,
    title: v.standard.title,
  });
  const setSystemStatus = (versionId: string, from: string, to: 'PUBLISHED' | 'DEPRECATED') => {
    if (!userOf(currentUserId() ?? '')?.platformAdmin) return err('FORBIDDEN' as const);
    const version = s.standardVersions.find(
      (v) => v.id === versionId && v.standard.organizationId === null && v.status === from,
    );
    if (!version) return err('NOT_FOUND' as const);
    s.standardVersions = s.standardVersions.map((v) =>
      v.id === versionId
        ? { ...v, status: to, publishedAt: to === 'PUBLISHED' ? now() : v.publishedAt }
        : v,
    );
    return ok(undefined);
  };

  return {
    projects: {
      list: async (organizationId, status) =>
        s.projects
          .filter(
            (p) => p.organizationId === organizationId && (status === 'ALL' || p.status === status),
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)),
      findById: async (organizationId, id) =>
        s.projects.find((p) => p.organizationId === organizationId && p.id === id) ?? null,
      create: async (input) => {
        if (
          s.projects.some((p) => p.organizationId === input.organizationId && p.code === input.code)
        ) {
          return err('CODE_TAKEN');
        }
        s.projects.push({
          ...input,
          status: 'ACTIVE',
          version: 1,
          createdAt: now(),
          archivedAt: null,
        });
        return ok(undefined);
      },
      update: async (organizationId, id, fields, version) => {
        if (
          s.projects.some(
            (p) => p.organizationId === organizationId && p.code === fields.code && p.id !== id,
          )
        ) {
          return err('CODE_TAKEN');
        }
        const match = (p: ProjectRecord) =>
          p.organizationId === organizationId && p.id === id && p.version === version;
        const found = s.projects.some(match);
        s.projects = s.projects.map((p) =>
          match(p) ? { ...p, ...fields, version: p.version + 1 } : p,
        );
        return ok(found);
      },
      setStatus: async (organizationId, id, status, version, at) => {
        const match = (p: ProjectRecord) =>
          p.organizationId === organizationId && p.id === id && p.version === version;
        const found = s.projects.some(match);
        s.projects = s.projects.map((p) =>
          match(p)
            ? {
                ...p,
                status,
                version: p.version + 1,
                archivedAt: status === 'ARCHIVED' ? at : null,
              }
            : p,
        );
        return found;
      },
      disciplines: async (projectIds) => {
        const map = new Map<string, Discipline[]>();
        for (const d of s.projectDisciplines) {
          if (projectIds.includes(d.projectId))
            map.set(d.projectId, [...(map.get(d.projectId) ?? []), d.discipline]);
        }
        return map;
      },
      setDisciplines: async (_organizationId, projectId, disciplines) => {
        s.projectDisciplines = [
          ...s.projectDisciplines.filter((d) => d.projectId !== projectId),
          ...disciplines.map((discipline) => ({ projectId, discipline })),
        ];
      },
    },
    projectMembers: {
      list: async (organizationId, projectId) =>
        s.projectMembers
          .filter((m) => m.organizationId === organizationId && m.projectId === projectId)
          .flatMap((m) => {
            const membership = s.memberships.find(
              (x) => x.organizationId === organizationId && x.userId === m.userId,
            );
            const user = userOf(m.userId);
            return membership && user
              ? [{ ...m, name: user.name, email: user.email, organizationRole: membership.role }]
              : [];
          }),
      findById: async (organizationId, projectId, id) =>
        s.projectMembers.find(
          (m) => m.organizationId === organizationId && m.projectId === projectId && m.id === id,
        ) ?? null,
      findByUserId: async (organizationId, projectId, userId) =>
        s.projectMembers.find(
          (m) =>
            m.organizationId === organizationId && m.projectId === projectId && m.userId === userId,
        ) ?? null,
      rolesOfUser: async (organizationId, userId) =>
        new Map(
          s.projectMembers
            .filter((m) => m.organizationId === organizationId && m.userId === userId)
            .map((m) => [m.projectId, m.role]),
        ),
      add: async (input) => {
        const record = { ...input, version: 1, createdAt: now() };
        s.projectMembers.push(record);
        return record;
      },
      updateRole: async (organizationId, projectId, id, role, version) => {
        const match = (m: ProjectMemberRecord) =>
          m.organizationId === organizationId &&
          m.projectId === projectId &&
          m.id === id &&
          m.version === version;
        const found = s.projectMembers.some(match);
        s.projectMembers = s.projectMembers.map((m) =>
          match(m) ? { ...m, role, version: m.version + 1 } : m,
        );
        return found;
      },
      remove: async (organizationId, projectId, id, version) => {
        const before = s.projectMembers.length;
        s.projectMembers = s.projectMembers.filter(
          (m) =>
            !(
              m.organizationId === organizationId &&
              m.projectId === projectId &&
              m.id === id &&
              m.version === version
            ),
        );
        return s.projectMembers.length < before;
      },
    },
    activity: {
      append: async (entry) => {
        s.activity.push({
          id: nextId(),
          organizationId: entry.organizationId,
          projectId: entry.projectId,
          actorUserId: entry.actorUserId,
          actorName: entry.actorUserId ? (userOf(entry.actorUserId)?.name ?? null) : null,
          type: entry.type,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          summary: entry.summary ?? {},
          createdAt: now(),
        });
      },
      list: async (organizationId, projectId, { cursor, limit }) =>
        s.activity
          .filter(
            (a) =>
              a.organizationId === organizationId &&
              a.projectId === projectId &&
              (cursor === undefined || a.id < cursor),
          )
          .sort((a, b) => (a.id < b.id ? 1 : -1))
          .slice(0, limit),
    },
    standards: {
      list: async () => {
        const byStandard = new Map<string, StandardVersionDetail[]>();
        for (const v of s.standardVersions) {
          byStandard.set(v.standard.id, [...(byStandard.get(v.standard.id) ?? []), v]);
        }
        return [...byStandard.values()].map((versions) => ({
          ...versions[0]!.standard,
          versions: versions.map((v) => ({
            id: v.id,
            label: v.label,
            status: v.status,
            publishedAt: v.publishedAt,
            parameterCount: v.parameters.length,
            toVerifyCount: v.parameters.filter((p) => p.verification === 'TO_VERIFY').length,
          })),
        }));
      },
      findVersion: async (id) => s.standardVersions.find((v) => v.id === id) ?? null,
      latestPublished: async (discipline) => {
        const latest = new Map<string, StandardVersionDetail>();
        for (const v of s.standardVersions) {
          if (v.status !== 'PUBLISHED' || v.standard.discipline !== discipline) continue;
          const current = latest.get(v.standard.id);
          if (!current || (v.publishedAt ?? 0) > (current.publishedAt ?? 0))
            latest.set(v.standard.id, v);
        }
        return [...latest.values()].map(ref);
      },
      publishSystem: async (versionId) => setSystemStatus(versionId, 'DRAFT', 'PUBLISHED'),
      deprecateSystem: async (versionId) => setSystemStatus(versionId, 'PUBLISHED', 'DEPRECATED'),
    },
    projectStandards: {
      list: async (projectId) =>
        s.projectStandards
          .filter((p) => p.projectId === projectId)
          .flatMap((p) => {
            const version = s.standardVersions.find((v) => v.id === p.standardVersionId);
            return version ? [{ ...ref(version), discipline: p.discipline }] : [];
          }),
      set: async (_organizationId, projectId, discipline, ids) => {
        s.projectStandards = [
          ...s.projectStandards.filter(
            (p) => !(p.projectId === projectId && p.discipline === discipline),
          ),
          ...ids.map((standardVersionId) => ({ projectId, discipline, standardVersionId })),
        ];
      },
    },
    overrides: {
      list: async (organizationId, projectId) =>
        s.overrides
          .filter((o) => o.organizationId === organizationId && o.projectId === projectId)
          .map((o) => ({ ...o, createdByName: userOf(o.createdById)?.name ?? '' })),
      findById: async (organizationId, id) => {
        const o = s.overrides.find((x) => x.organizationId === organizationId && x.id === id);
        return o ? { ...o, createdByName: userOf(o.createdById)?.name ?? '' } : null;
      },
      findSame: async (organizationId, projectId, standardVersionId, key) =>
        s.overrides.find(
          (o) =>
            o.organizationId === organizationId &&
            o.projectId === projectId &&
            o.standardVersionId === standardVersionId &&
            o.key === key,
        ) ?? null,
      create: async (input) => {
        const record = { ...input, version: 1, updatedAt: now() };
        s.overrides.push(record);
        return record;
      },
      update: async (organizationId, id, change, version) => {
        const match = (o: OverrideRecord) =>
          o.organizationId === organizationId && o.id === id && o.version === version;
        const found = s.overrides.some(match);
        s.overrides = s.overrides.map((o) =>
          match(o) ? { ...o, ...change, version: o.version + 1, updatedAt: now() } : o,
        );
        return found;
      },
      delete: async (organizationId, id, version) => {
        const before = s.overrides.length;
        s.overrides = s.overrides.filter(
          (o) => !(o.organizationId === organizationId && o.id === id && o.version === version),
        );
        return s.overrides.length < before;
      },
    },
  };
}
