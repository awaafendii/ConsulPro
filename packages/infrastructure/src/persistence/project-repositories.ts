import { err, ok, type ParameterSource, type ParameterValue } from '@consulpro/calc-core';
import type {
  OverrideRecord,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectRepositories,
  StandardHeader,
  StandardVersionDetail,
  VersionRef,
} from '@consulpro/application';
import type { Prisma } from '@consulpro/db';
import type { Discipline } from '@consulpro/domain';
import type { ParameterDefinition } from '@consulpro/standards';

type Tx = Prisma.TransactionClient;

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

/** Date calendaire (colonne `date`) ↔ chaîne ISO AAAA-MM-JJ. */
const toDate = (iso: string | null) => (iso === null ? null : new Date(`${iso}T00:00:00.000Z`));
const fromDate = (date: Date | null) => (date === null ? null : date.toISOString().slice(0, 10));

interface ProjectRow {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  client: string | null;
  location: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  startDate: Date | null;
  endDate: Date | null;
  version: number;
  createdById: string;
  createdAt: Date;
  archivedAt: Date | null;
}

const toProject = (p: ProjectRow): ProjectRecord => ({
  id: p.id,
  organizationId: p.organizationId,
  code: p.code,
  name: p.name,
  description: p.description,
  client: p.client,
  location: p.location,
  status: p.status,
  startDate: fromDate(p.startDate),
  endDate: fromDate(p.endDate),
  version: p.version,
  createdById: p.createdById,
  createdAt: p.createdAt,
  archivedAt: p.archivedAt,
});

const toMember = (m: ProjectMemberRecord): ProjectMemberRecord => ({
  id: m.id,
  organizationId: m.organizationId,
  projectId: m.projectId,
  userId: m.userId,
  role: m.role,
  version: m.version,
  createdAt: m.createdAt,
});

const toHeader = (s: StandardHeader): StandardHeader => ({
  id: s.id,
  organizationId: s.organizationId,
  code: s.code,
  title: s.title,
  publisher: s.publisher,
  discipline: s.discipline,
  nature: s.nature,
});

const toRef = (v: {
  id: string;
  label: string;
  standard: { code: string; title: string };
}): VersionRef => ({
  id: v.id,
  code: v.standard.code,
  label: v.label,
  title: v.standard.title,
});

const toOverride = (o: {
  id: string;
  organizationId: string;
  projectId: string | null;
  standardVersionId: string;
  key: string;
  value: Prisma.JsonValue;
  justification: string;
  createdById: string;
  version: number;
  updatedAt: Date;
}): OverrideRecord => ({
  id: o.id,
  organizationId: o.organizationId,
  projectId: o.projectId,
  standardVersionId: o.standardVersionId,
  key: o.key,
  // Valeur contrôlée à l'écriture par checkOverride (packages/standards).
  value: o.value as unknown as ParameterValue,
  justification: o.justification,
  createdById: o.createdById,
  version: o.version,
  updatedAt: o.updatedAt,
});

/**
 * Repositories des projets et des référentiels. Chaque requête filtre par organisation ou
 * projet ; la RLS restreint en plus les projets à leurs membres et aux Owner/Admin.
 */
export function createProjectRepositories(tx: Tx): ProjectRepositories {
  /** Version système, contrôles préalables lisibles (la fonction SQL revérifie tout). */
  async function setSystemStatus(versionId: string, from: 'DRAFT' | 'PUBLISHED') {
    const [admin] = await tx.$queryRaw<{ allowed: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM users WHERE id = app_current_user()
                      AND platform_role = 'PLATFORM_ADMIN') AS allowed`;
    if (!admin?.allowed) return err('FORBIDDEN' as const);
    const version = await tx.standardVersion.findFirst({
      where: { id: versionId, organizationId: null, status: from },
      select: { id: true },
    });
    if (!version) return err('NOT_FOUND' as const);
    if (from === 'DRAFT') {
      await tx.$executeRaw`SELECT publish_system_standard_version(${versionId}::uuid)`;
    } else {
      await tx.$executeRaw`SELECT deprecate_system_standard_version(${versionId}::uuid)`;
    }
    return ok(undefined);
  }

  return {
    projects: {
      async list(organizationId, status) {
        const rows = await tx.project.findMany({
          where: { organizationId, ...(status === 'ALL' ? {} : { status }) },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        return rows.map(toProject);
      },
      async findById(organizationId, id) {
        const p = await tx.project.findFirst({ where: { organizationId, id } });
        return p ? toProject(p) : null;
      },
      async create(input) {
        // createMany : pas de RETURNING. Le créateur non administrateur ne peut relire le
        // projet qu'après son ajout comme membre (politique RLS de lecture).
        try {
          await tx.project.createMany({
            data: [
              {
                id: input.id,
                organizationId: input.organizationId,
                createdById: input.createdById,
                code: input.code,
                name: input.name,
                description: input.description,
                client: input.client,
                location: input.location,
                startDate: toDate(input.startDate),
                endDate: toDate(input.endDate),
              },
            ],
          });
          return ok(undefined);
        } catch (error) {
          if (isUniqueViolation(error)) return err('CODE_TAKEN' as const);
          throw error;
        }
      },
      async update(organizationId, id, fields, version) {
        try {
          const { count } = await tx.project.updateMany({
            where: { organizationId, id, version },
            data: {
              ...fields,
              startDate: toDate(fields.startDate),
              endDate: toDate(fields.endDate),
              version: { increment: 1 },
            },
          });
          return ok(count === 1);
        } catch (error) {
          if (isUniqueViolation(error)) return err('CODE_TAKEN' as const);
          throw error;
        }
      },
      async setStatus(organizationId, id, status, version, at) {
        const { count } = await tx.project.updateMany({
          where: { organizationId, id, version },
          data: {
            status,
            archivedAt: status === 'ARCHIVED' ? at : null,
            version: { increment: 1 },
          },
        });
        return count === 1;
      },
      async disciplines(projectIds) {
        const rows = await tx.projectDiscipline.findMany({
          where: { projectId: { in: [...projectIds] } },
          orderBy: { discipline: 'asc' },
        });
        const map = new Map<string, Discipline[]>();
        for (const row of rows)
          map.set(row.projectId, [...(map.get(row.projectId) ?? []), row.discipline]);
        return map;
      },
      async setDisciplines(organizationId, projectId, disciplines, newId) {
        await tx.projectDiscipline.deleteMany({
          where: { projectId, discipline: { notIn: [...disciplines] } },
        });
        await tx.projectDiscipline.createMany({
          data: disciplines.map((discipline) => ({
            id: newId(),
            organizationId,
            projectId,
            discipline,
          })),
          skipDuplicates: true,
        });
      },
    },

    projectMembers: {
      async list(organizationId, projectId) {
        const rows = await tx.projectMember.findMany({
          where: { organizationId, projectId },
          include: {
            user: {
              select: {
                name: true,
                email: true,
                memberships: { where: { organizationId }, select: { role: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        });
        return rows.flatMap((m) => {
          const membership = m.user.memberships[0];
          return membership
            ? [
                {
                  ...toMember(m),
                  name: m.user.name,
                  email: m.user.email,
                  organizationRole: membership.role,
                },
              ]
            : [];
        });
      },
      async findById(organizationId, projectId, id) {
        const m = await tx.projectMember.findFirst({ where: { organizationId, projectId, id } });
        return m ? toMember(m) : null;
      },
      async findByUserId(organizationId, projectId, userId) {
        const m = await tx.projectMember.findFirst({
          where: { organizationId, projectId, userId },
        });
        return m ? toMember(m) : null;
      },
      async rolesOfUser(organizationId, userId) {
        const rows = await tx.projectMember.findMany({
          where: { organizationId, userId },
          select: { projectId: true, role: true },
        });
        return new Map(rows.map((r) => [r.projectId, r.role]));
      },
      async add(input) {
        // Insertion sans RETURNING (amorçage par le créateur, voir projects.create), puis relecture.
        await tx.projectMember.createMany({ data: [input] });
        const m = await tx.projectMember.findFirstOrThrow({
          where: { organizationId: input.organizationId, id: input.id },
        });
        return toMember(m);
      },
      async updateRole(organizationId, projectId, id, role, version) {
        const { count } = await tx.projectMember.updateMany({
          where: { organizationId, projectId, id, version },
          data: { role, version: { increment: 1 } },
        });
        return count === 1;
      },
      async remove(organizationId, projectId, id, version) {
        const { count } = await tx.projectMember.deleteMany({
          where: { organizationId, projectId, id, version },
        });
        return count === 1;
      },
    },

    activity: {
      async append(entry) {
        await tx.activityEvent.createMany({
          data: [
            {
              organizationId: entry.organizationId,
              projectId: entry.projectId,
              actorUserId: entry.actorUserId,
              type: entry.type,
              targetType: entry.targetType ?? null,
              targetId: entry.targetId ?? null,
              summary: (entry.summary ?? {}) as Prisma.InputJsonObject,
            },
          ],
        });
      },
      async list(organizationId, projectId, { cursor, limit }) {
        const rows = await tx.activityEvent.findMany({
          where: { organizationId, projectId, ...(cursor ? { id: { lt: cursor } } : {}) },
          orderBy: { id: 'desc' },
          take: limit,
        });
        const actorIds = [...new Set(rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])))];
        const actors = await tx.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        });
        const names = new Map(actors.map((a) => [a.id, a.name]));
        return rows.map((r) => ({
          id: r.id,
          actorUserId: r.actorUserId,
          actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
          type: r.type,
          targetType: r.targetType,
          targetId: r.targetId,
          summary: (r.summary ?? {}) as Record<string, unknown>,
          createdAt: r.createdAt,
        }));
      },
    },

    standards: {
      async list() {
        const standards = await tx.standard.findMany({
          include: { versions: { orderBy: { createdAt: 'desc' } } },
          orderBy: [{ organizationId: { sort: 'asc', nulls: 'first' } }, { code: 'asc' }],
        });
        const counts = await tx.parameter.groupBy({
          by: ['standardVersionId', 'verification'],
          _count: { _all: true },
        });
        const count = (versionId: string, toVerify: boolean) =>
          counts
            .filter(
              (c) =>
                c.standardVersionId === versionId && (!toVerify || c.verification === 'TO_VERIFY'),
            )
            .reduce((sum, c) => sum + c._count._all, 0);
        return standards.map((s) => ({
          ...toHeader(s),
          versions: s.versions.map((v) => ({
            id: v.id,
            label: v.label,
            status: v.status,
            publishedAt: v.publishedAt,
            parameterCount: count(v.id, false),
            toVerifyCount: count(v.id, true),
          })),
        }));
      },
      async findVersion(id) {
        const v = await tx.standardVersion.findUnique({
          where: { id },
          include: {
            standard: true,
            parameters: { orderBy: { id: 'asc' } },
            rules: { orderBy: { id: 'asc' } },
          },
        });
        if (!v) return null;
        return {
          id: v.id,
          label: v.label,
          status: v.status,
          sourceNotes: v.sourceNotes,
          publishedAt: v.publishedAt,
          standard: toHeader(v.standard),
          parameters: v.parameters.map(
            (p) =>
              ({
                // Valeur et source validées au chargement (standardFileSchema).
                ...(p.value as unknown as ParameterValue),
                key: p.key,
                label: p.label,
                source: p.source as unknown as ParameterSource,
                verification: p.verification,
              }) as ParameterDefinition,
          ),
          rules: v.rules.map((r) => ({
            code: r.code,
            description: r.description,
            severity: r.severity,
            clause: r.clause,
            parameterKeys: r.parameterKeys,
            implementation: r.implementation,
          })),
        } satisfies StandardVersionDetail;
      },
      async latestPublished(discipline) {
        const rows = await tx.standardVersion.findMany({
          where: { status: 'PUBLISHED', standard: { discipline } },
          include: { standard: { select: { code: true, title: true } } },
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        });
        const seen = new Set<string>();
        return rows.filter((v) => !seen.has(v.standardId) && seen.add(v.standardId)).map(toRef);
      },
      publishSystem: (versionId) => setSystemStatus(versionId, 'DRAFT'),
      deprecateSystem: (versionId) => setSystemStatus(versionId, 'PUBLISHED'),
    },

    projectStandards: {
      async list(projectId) {
        const rows = await tx.projectStandardVersion.findMany({
          where: { projectId },
          include: {
            standardVersion: { include: { standard: { select: { code: true, title: true } } } },
          },
          orderBy: [{ discipline: 'asc' }, { standardVersion: { standard: { code: 'asc' } } }],
        });
        return rows.map((r) => ({ ...toRef(r.standardVersion), discipline: r.discipline }));
      },
      async set(organizationId, projectId, discipline, standardVersionIds) {
        await tx.projectStandardVersion.deleteMany({ where: { projectId, discipline } });
        await tx.projectStandardVersion.createMany({
          data: standardVersionIds.map((standardVersionId) => ({
            organizationId,
            projectId,
            discipline,
            standardVersionId,
          })),
        });
      },
    },

    overrides: {
      async list(organizationId, projectId) {
        const rows = await tx.parameterOverride.findMany({
          where: { organizationId, projectId },
          include: { createdBy: { select: { name: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return rows.map((o) => ({ ...toOverride(o), createdByName: o.createdBy.name }));
      },
      async findById(organizationId, id) {
        const o = await tx.parameterOverride.findFirst({
          where: { organizationId, id },
          include: { createdBy: { select: { name: true } } },
        });
        return o ? { ...toOverride(o), createdByName: o.createdBy.name } : null;
      },
      async findSame(organizationId, projectId, standardVersionId, key) {
        const o = await tx.parameterOverride.findFirst({
          where: { organizationId, projectId, standardVersionId, key },
        });
        return o ? toOverride(o) : null;
      },
      async create(input) {
        return toOverride(
          await tx.parameterOverride.create({
            data: { ...input, value: input.value as unknown as Prisma.InputJsonObject },
          }),
        );
      },
      async update(organizationId, id, change, version) {
        const { count } = await tx.parameterOverride.updateMany({
          where: { organizationId, id, version },
          data: {
            value: change.value as unknown as Prisma.InputJsonObject,
            justification: change.justification,
            version: { increment: 1 },
          },
        });
        return count === 1;
      },
      async delete(organizationId, id, version) {
        const { count } = await tx.parameterOverride.deleteMany({
          where: { organizationId, id, version },
        });
        return count === 1;
      },
    },
  };
}
