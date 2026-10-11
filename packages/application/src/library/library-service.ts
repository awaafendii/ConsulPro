import {
  err,
  ok,
  type ParameterSource,
  type ParameterValue,
  type Result,
} from '@consulpro/calc-core';
import { can, type Discipline } from '@consulpro/domain';
import { checkOverride, referenceValueOf, resolveParameters } from '@consulpro/standards';

import { guarded, type OrgContext, type UserContext } from '../context';
import { appError, forbidden, notFound, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps, Repositories } from '../ports';
import type {
  OverrideRecord,
  StandardRecord,
  StandardVersionDetail,
  VersionRef,
} from '../ports-projects';
import {
  appendActivity,
  inProject,
  projectDisciplines,
  type ProjectContext,
} from '../projects/project-context';
import { auditBase, contextOf, userScope } from '../scope';

export interface OverrideView extends OverrideRecord {
  readonly scope: 'ORGANIZATION' | 'PROJECT';
  readonly standardCode: string;
  readonly standardVersionLabel: string;
  readonly label: string;
  readonly referenceValue: ParameterValue;
  readonly createdByName: string;
}

/** Paramètre d'une version retenue, avec la valeur qui s'appliquera aux calculs du projet. */
export interface EffectiveParameter {
  readonly key: string;
  readonly label: string;
  readonly value: ParameterValue;
  readonly referenceValue: ParameterValue;
  readonly source: ParameterSource;
  readonly verification: 'VERIFIED' | 'TO_VERIFY';
  readonly origin: 'STANDARD' | 'ORGANIZATION' | 'PROJECT';
  readonly justification: string | null;
}

export interface ProjectStandardsView {
  readonly items: readonly { discipline: Discipline; versions: readonly VersionRef[] }[];
}

export interface OverrideInput {
  readonly standardVersionId: string;
  readonly key: string;
  /** Valeur brute : contrôlée par `checkOverride` (unité, table, type, grandeur). */
  readonly value: unknown;
  readonly justification: string;
}

const READ = { permission: 'project.read', write: false } as const;
const OVERRIDE = { permission: 'project.parameter.override', write: true } as const;

/** Les brouillons ne sont visibles que de ceux qui peuvent les publier. */
function canSeeDrafts(ctx: OrgContext, organizationId: string | null) {
  return organizationId === null
    ? ctx.actor.platformAdmin === true
    : can(ctx.role, 'library.org.manage');
}

const resolutionError = (error: { code: string; message: string }) =>
  appError('VALIDATION', error.code, error.message);

function toView(
  record: OverrideRecord & { createdByName: string },
  version: StandardVersionDetail,
): OverrideView {
  const definition = version.parameters.find((p) => p.key === record.key);
  return {
    ...record,
    scope: record.projectId === null ? 'ORGANIZATION' : 'PROJECT',
    standardCode: version.standard.code,
    standardVersionLabel: version.label,
    label: definition?.label ?? record.key,
    referenceValue: definition ? referenceValueOf(definition) : record.value,
  };
}

export function createLibraryService({ uow, ids }: Pick<ApplicationDeps, 'uow' | 'ids'>) {
  async function views(repos: Repositories, organizationId: string, projectId: string | null) {
    const records = await repos.overrides.list(organizationId, projectId);
    const versions = new Map<string, StandardVersionDetail | null>();
    const out: OverrideView[] = [];
    for (const record of records) {
      if (!versions.has(record.standardVersionId)) {
        versions.set(
          record.standardVersionId,
          await repos.standards.findVersion(record.standardVersionId),
        );
      }
      const version = versions.get(record.standardVersionId);
      if (version) out.push(toView(record, version));
    }
    return out;
  }

  /** Version publiée, paramètre existant, valeur conforme : préalables de toute surcharge. */
  async function checkedOverride(
    repos: Repositories,
    standardVersionId: string,
    key: string,
    value: unknown,
    justification: string,
  ): Promise<Result<{ version: StandardVersionDetail; value: ParameterValue }, AppError>> {
    const version = await repos.standards.findVersion(standardVersionId);
    if (!version || version.status === 'DRAFT') return err(notFound('Version de référentiel'));
    if (version.status !== 'PUBLISHED') {
      return err(
        appError(
          'POLICY_VIOLATION',
          'STANDARD_VERSION_DEPRECATED',
          'Cette version de référentiel est dépréciée : elle n’accepte plus de nouvelle surcharge.',
        ),
      );
    }
    const definition = version.parameters.find((p) => p.key === key);
    if (!definition) return err(notFound('Paramètre'));
    const checked = checkOverride(definition, value, justification);
    if (!checked.ok) return err(resolutionError(checked.error));
    return ok({ version, value: checked.value });
  }

  async function createOverride(
    repos: Repositories,
    ctx: OrgContext,
    pctx: ProjectContext | null,
    input: OverrideInput,
  ): Promise<Result<OverrideView, AppError>> {
    const orgId = ctx.organization.id;
    const projectId = pctx?.project.id ?? null;
    if (pctx) {
      const selected = await repos.projectStandards.list(pctx.project.id);
      if (!selected.some((v) => v.id === input.standardVersionId)) {
        return err(
          appError(
            'POLICY_VIOLATION',
            'STANDARD_NOT_SELECTED',
            'Ce référentiel n’est pas retenu pour le projet.',
          ),
        );
      }
    }
    const checked = await checkedOverride(
      repos,
      input.standardVersionId,
      input.key,
      input.value,
      input.justification,
    );
    if (!checked.ok) return checked;
    if (await repos.overrides.findSame(orgId, projectId, input.standardVersionId, input.key)) {
      return err(
        appError(
          'CONFLICT',
          'OVERRIDE_EXISTS',
          'Ce paramètre est déjà surchargé à ce niveau : modifiez la surcharge existante.',
        ),
      );
    }
    const record = await repos.overrides.create({
      id: ids.next(),
      organizationId: orgId,
      projectId,
      standardVersionId: input.standardVersionId,
      key: input.key,
      value: checked.value.value,
      justification: input.justification.trim(),
      createdById: ctx.actor.userId,
    });
    const view = toView({ ...record, createdByName: ctx.actor.name }, checked.value.version);
    await traceOverride(repos, ctx, pctx, 'set', view);
    return ok(view);
  }

  async function traceOverride(
    repos: Repositories,
    ctx: OrgContext,
    pctx: ProjectContext | null,
    kind: 'set' | 'removed',
    view: OverrideView,
  ) {
    const summary = {
      standard: `${view.standardCode} ${view.standardVersionLabel}`,
      key: view.key,
      label: view.label,
      ...(kind === 'set' ? { value: view.value, referenceValue: view.referenceValue } : {}),
      justification: view.justification,
    };
    if (pctx) {
      await appendActivity(
        repos,
        pctx,
        kind === 'set' ? 'project.parameter_overridden' : 'project.parameter_override_removed',
        summary,
        { type: 'parameter_override', id: view.id },
      );
    }
    await repos.audit.append({
      ...auditBase(ctx, ctx.organization.id),
      action: kind === 'set' ? 'parameter.overridden' : 'parameter.override_removed',
      targetType: 'parameter_override',
      targetId: view.id,
      metadata: {
        ...summary,
        projectId: view.projectId,
        standardVersionId: view.standardVersionId,
      },
    });
  }

  /** Surcharge du bon niveau (organisation ou ce projet), à la version attendue. */
  async function locateOverride(
    repos: Repositories,
    ctx: OrgContext,
    pctx: ProjectContext | null,
    overrideId: string,
    expectedVersion: number,
  ): Promise<Result<OverrideView, AppError>> {
    const current = await repos.overrides.findById(ctx.organization.id, overrideId);
    if (!current || current.projectId !== (pctx?.project.id ?? null)) {
      return err(notFound('Surcharge'));
    }
    if (current.version !== expectedVersion) return err(staleVersion());
    const version = await repos.standards.findVersion(current.standardVersionId);
    if (!version) return err(notFound('Version de référentiel'));
    return ok(toView(current, version));
  }

  async function updateOverride(
    repos: Repositories,
    ctx: OrgContext,
    pctx: ProjectContext | null,
    overrideId: string,
    change: { value: unknown; justification: string },
    expectedVersion: number,
  ): Promise<Result<OverrideView, AppError>> {
    const located = await locateOverride(repos, ctx, pctx, overrideId, expectedVersion);
    if (!located.ok) return located;
    const before = located.value;
    const checked = await checkedOverride(
      repos,
      before.standardVersionId,
      before.key,
      change.value,
      change.justification,
    );
    if (!checked.ok) return checked;
    const justification = change.justification.trim();
    const value = checked.value.value;
    if (
      !(await repos.overrides.update(
        ctx.organization.id,
        overrideId,
        { value, justification },
        expectedVersion,
      ))
    ) {
      return err(staleVersion());
    }
    const after: OverrideView = { ...before, value, justification, version: expectedVersion + 1 };
    await traceOverride(repos, ctx, pctx, 'set', after);
    return ok(after);
  }

  async function deleteOverride(
    repos: Repositories,
    ctx: OrgContext,
    pctx: ProjectContext | null,
    overrideId: string,
    expectedVersion: number,
  ): Promise<Result<void, AppError>> {
    const located = await locateOverride(repos, ctx, pctx, overrideId, expectedVersion);
    if (!located.ok) return located;
    if (!(await repos.overrides.delete(ctx.organization.id, overrideId, expectedVersion))) {
      return err(staleVersion());
    }
    await traceOverride(repos, ctx, pctx, 'removed', located.value);
    return ok(undefined);
  }

  return {
    /** Référentiels système et de l'organisation, versions visibles par l'utilisateur. */
    async listStandards(ctx: OrgContext): Promise<Result<StandardRecord[], AppError>> {
      return guarded(ctx, 'library.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const standards = await repos.standards.list();
          return ok(
            standards
              .map((s) => ({
                ...s,
                versions: canSeeDrafts(ctx, s.organizationId)
                  ? s.versions
                  : s.versions.filter((v) => v.status !== 'DRAFT'),
              }))
              .filter((s) => s.versions.length > 0),
          );
        }),
      );
    },

    async getVersion(
      ctx: OrgContext,
      versionId: string,
    ): Promise<Result<StandardVersionDetail, AppError>> {
      return guarded(ctx, 'library.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const version = await repos.standards.findVersion(versionId);
          if (!version) return err(notFound('Version de référentiel'));
          if (version.status === 'DRAFT' && !canSeeDrafts(ctx, version.standard.organizationId)) {
            return err(notFound('Version de référentiel'));
          }
          return ok(version);
        }),
      );
    },

    /** Publication ou dépréciation d'un référentiel système (administrateur de la plateforme). */
    async setSystemVersionStatus(
      ctx: UserContext,
      versionId: string,
      target: 'PUBLISHED' | 'DEPRECATED',
    ): Promise<Result<void, AppError>> {
      if (ctx.actor.platformAdmin !== true) return err(forbidden());
      return uow.run(userScope(ctx), async (repos) => {
        const done =
          target === 'PUBLISHED'
            ? await repos.standards.publishSystem(versionId)
            : await repos.standards.deprecateSystem(versionId);
        if (!done.ok) {
          return err(done.error === 'FORBIDDEN' ? forbidden() : notFound('Version de référentiel'));
        }
        await repos.audit.append({
          ...auditBase(ctx, null),
          action: target === 'PUBLISHED' ? 'standard.published' : 'standard.deprecated',
          targetType: 'standard_version',
          targetId: versionId,
        });
        return ok(undefined);
      });
    },

    // --- Surcharges d'organisation ---------------------------------------------------------

    async listOrgOverrides(ctx: OrgContext): Promise<Result<OverrideView[], AppError>> {
      return guarded(ctx, 'library.read', () =>
        uow.run(contextOf(ctx), async (repos) => ok(await views(repos, ctx.organization.id, null))),
      );
    },

    async createOrgOverride(
      ctx: OrgContext,
      input: OverrideInput,
    ): Promise<Result<OverrideView, AppError>> {
      return guarded(ctx, 'library.org.manage', () =>
        uow.run(contextOf(ctx), (repos) => createOverride(repos, ctx, null, input)),
      );
    },

    async updateOrgOverride(
      ctx: OrgContext,
      overrideId: string,
      change: { value: unknown; justification: string },
      expectedVersion: number,
    ): Promise<Result<OverrideView, AppError>> {
      return guarded(ctx, 'library.org.manage', () =>
        uow.run(contextOf(ctx), (repos) =>
          updateOverride(repos, ctx, null, overrideId, change, expectedVersion),
        ),
      );
    },

    async deleteOrgOverride(
      ctx: OrgContext,
      overrideId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      return guarded(ctx, 'library.org.manage', () =>
        uow.run(contextOf(ctx), (repos) =>
          deleteOverride(repos, ctx, null, overrideId, expectedVersion),
        ),
      );
    },

    // --- Projet : référentiels retenus, surcharges, paramètres effectifs --------------------

    async projectStandards(
      ctx: OrgContext,
      projectId: string,
    ): Promise<Result<ProjectStandardsView, AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const disciplines = await projectDisciplines(repos, projectId);
        const selected = await repos.projectStandards.list(projectId);
        return ok({
          items: disciplines.map((discipline) => ({
            discipline,
            versions: selected
              .filter((v) => v.discipline === discipline)
              .map(({ id, code, label, title }) => ({ id, code, label, title })),
          })),
        });
      });
    },

    /** Sélectionne les versions de référentiels d'un métier du projet (publiées, du bon métier). */
    async setProjectStandards(
      ctx: OrgContext,
      projectId: string,
      discipline: Discipline,
      standardVersionIds: readonly string[],
    ): Promise<Result<void, AppError>> {
      return inProject(
        uow,
        ctx,
        projectId,
        { permission: 'project.update', write: true },
        async (pctx, repos) => {
          const disciplines = await projectDisciplines(repos, projectId);
          if (!disciplines.includes(discipline)) {
            return err(
              appError(
                'VALIDATION',
                'DISCIPLINE_INACTIVE',
                'Ce métier n’est pas activé sur le projet.',
              ),
            );
          }
          const ids = [...new Set(standardVersionIds)];
          const versions: StandardVersionDetail[] = [];
          for (const id of ids) {
            const version = await repos.standards.findVersion(id);
            if (!version || version.status === 'DRAFT')
              return err(notFound('Version de référentiel'));
            if (version.status !== 'PUBLISHED') {
              return err(
                appError(
                  'VALIDATION',
                  'STANDARD_VERSION_DEPRECATED',
                  `${version.standard.code} ${version.label} est dépréciée : choisissez une version publiée.`,
                ),
              );
            }
            if (
              version.standard.discipline !== null &&
              version.standard.discipline !== discipline
            ) {
              return err(
                appError(
                  'VALIDATION',
                  'STANDARD_DISCIPLINE_MISMATCH',
                  `${version.standard.code} ne s’applique pas à ce métier.`,
                ),
              );
            }
            if (versions.some((v) => v.standard.id === version.standard.id)) {
              return err(
                appError(
                  'VALIDATION',
                  'STANDARD_VERSION_DUPLICATE',
                  `Une seule version de ${version.standard.code} peut être retenue.`,
                ),
              );
            }
            versions.push(version);
          }
          await repos.projectStandards.set(ctx.organization.id, projectId, discipline, ids);
          const summary = {
            discipline,
            versions: versions.map((v) => `${v.standard.code} ${v.label}`),
          };
          await appendActivity(repos, pctx, 'project.standards_changed', summary);
          await repos.audit.append({
            ...auditBase(ctx, ctx.organization.id),
            action: 'project.standards_changed',
            targetType: 'project',
            targetId: projectId,
            metadata: { ...summary, standardVersionIds: ids },
          });
          return ok(undefined);
        },
      );
    },

    async listProjectOverrides(
      ctx: OrgContext,
      projectId: string,
    ): Promise<Result<OverrideView[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) =>
        ok(await views(repos, ctx.organization.id, projectId)),
      );
    },

    async createProjectOverride(
      ctx: OrgContext,
      projectId: string,
      input: OverrideInput,
    ): Promise<Result<OverrideView, AppError>> {
      return inProject(uow, ctx, projectId, OVERRIDE, (pctx, repos) =>
        createOverride(repos, ctx, pctx, input),
      );
    },

    async updateProjectOverride(
      ctx: OrgContext,
      projectId: string,
      overrideId: string,
      change: { value: unknown; justification: string },
      expectedVersion: number,
    ): Promise<Result<OverrideView, AppError>> {
      return inProject(uow, ctx, projectId, OVERRIDE, (pctx, repos) =>
        updateOverride(repos, ctx, pctx, overrideId, change, expectedVersion),
      );
    },

    async deleteProjectOverride(
      ctx: OrgContext,
      projectId: string,
      overrideId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      return inProject(uow, ctx, projectId, OVERRIDE, (pctx, repos) =>
        deleteOverride(repos, ctx, pctx, overrideId, expectedVersion),
      );
    },

    /**
     * Paramètres d'une version retenue par le projet, avec la valeur effective et son origine,
     * résolus par la même fonction que les calculs (projet > organisation > référentiel).
     */
    async effectiveParameters(
      ctx: OrgContext,
      projectId: string,
      standardVersionId: string,
    ): Promise<Result<EffectiveParameter[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const selected = await repos.projectStandards.list(projectId);
        const version = selected.some((v) => v.id === standardVersionId)
          ? await repos.standards.findVersion(standardVersionId)
          : null;
        if (!version) return err(notFound('Référentiel retenu'));
        const orgId = ctx.organization.id;
        const overrides = [
          ...(await repos.overrides.list(orgId, null)).map((o) => ({
            ...o,
            scope: 'ORGANIZATION' as const,
          })),
          ...(await repos.overrides.list(orgId, projectId)).map((o) => ({
            ...o,
            scope: 'PROJECT' as const,
          })),
        ].filter((o) => o.standardVersionId === standardVersionId);
        const resolved = resolveParameters(
          [
            {
              ref: { standardVersionId, code: version.standard.code, version: version.label },
              parameters: version.parameters,
            },
          ],
          overrides,
          version.parameters.map((p) => ({ key: p.key, kind: p.kind, description: p.label })),
        );
        if (!resolved.ok) {
          return err(
            appError(
              'VALIDATION',
              'PARAMETERS_UNRESOLVABLE',
              resolved.error.map((e) => `${e.key} : ${e.message}`).join(' '),
            ),
          );
        }
        return ok(
          version.parameters.flatMap((definition): EffectiveParameter[] => {
            const parameter = resolved.value.get(definition.key);
            if (!parameter) return [];
            const { key, source, verification, override, ...value } = parameter;
            return [
              {
                key,
                label: definition.label,
                value,
                referenceValue: referenceValueOf(definition),
                source,
                verification,
                origin: override?.scope ?? 'STANDARD',
                justification: override?.justification ?? null,
              },
            ];
          }),
        );
      });
    },
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
