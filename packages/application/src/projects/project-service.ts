import { err, ok, type Result } from '@consulpro/calc-core';
import {
  asProjectRole,
  effectiveProjectRole,
  validateProject,
  type Discipline,
  type NewProject,
  type OrgRole,
  type ProjectRole,
  type ProjectStatus,
} from '@consulpro/domain';

import { guarded, type OrgContext } from '../context';
import { appError, fromDomain, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps, Repositories } from '../ports';
import type { ActivityRecord, ProjectFields, ProjectRecord } from '../ports-projects';
import { auditBase, contextOf } from '../scope';
import { appendActivity, inProject, isOrgManager, projectDisciplines } from './project-context';

export interface ProjectView extends ProjectRecord {
  readonly disciplines: readonly Discipline[];
  /** Rôle effectif de l'utilisateur courant sur le projet. */
  readonly role: OrgRole;
}

const codeTaken = () =>
  appError(
    'CONFLICT',
    'PROJECT_CODE_TAKEN',
    'Ce code de projet est déjà utilisé dans l’organisation.',
  );

const fieldsOf = (input: NewProject): ProjectFields => ({
  code: input.code,
  name: input.name,
  description: input.description ?? null,
  client: input.client ?? null,
  location: input.location ?? null,
  startDate: input.startDate ?? null,
  endDate: input.endDate ?? null,
});

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Retient par défaut, pour chaque métier sans sélection, la dernière version publiée de
 * chaque référentiel du métier. La sélection reste visible et modifiable (onglet Référentiels).
 */
async function applyDefaultStandards(
  repos: Repositories,
  organizationId: string,
  projectId: string,
  disciplines: readonly Discipline[],
) {
  const current = await repos.projectStandards.list(projectId);
  const selected: string[] = [];
  for (const discipline of disciplines) {
    if (current.some((v) => v.discipline === discipline)) continue;
    const latest = await repos.standards.latestPublished(discipline);
    if (latest.length === 0) continue;
    await repos.projectStandards.set(
      organizationId,
      projectId,
      discipline,
      latest.map((v) => v.id),
    );
    selected.push(...latest.map((v) => `${v.code} ${v.label}`));
  }
  return selected;
}

export function createProjectService({
  uow,
  ids,
  clock,
}: Pick<ApplicationDeps, 'uow' | 'ids' | 'clock'>) {
  const view = async (
    repos: Repositories,
    project: ProjectRecord,
    role: OrgRole,
  ): Promise<ProjectView> => {
    return { ...project, role, disciplines: await projectDisciplines(repos, project.id) };
  };
  /** Relit le projet après écriture (version et horodatages à jour). */
  const reload = async (repos: Repositories, organizationId: string, id: string, role: OrgRole) => {
    const saved = await repos.projects.findById(organizationId, id);
    if (!saved) throw new Error('Projet introuvable après écriture');
    return view(repos, saved, role);
  };

  return {
    /** Projets visibles par l'utilisateur : tous pour Owner/Admin, sinon ceux dont il est membre. */
    async list(
      ctx: OrgContext,
      status: ProjectStatus | 'ALL',
    ): Promise<Result<ProjectView[], AppError>> {
      return guarded(ctx, 'project.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const projects = await repos.projects.list(ctx.organization.id, status);
          const roles = isOrgManager(ctx.role)
            ? new Map<string, ProjectRole>()
            : await repos.projectMembers.rolesOfUser(ctx.organization.id, ctx.actor.userId);
          const visible = projects.flatMap((project) => {
            const role = effectiveProjectRole(ctx.role, roles.get(project.id) ?? null);
            return role ? [{ project, role }] : [];
          });
          const disciplines = await repos.projects.disciplines(visible.map((v) => v.project.id));
          return ok(
            visible.map(({ project, role }) => ({
              ...project,
              role,
              disciplines: disciplines.get(project.id) ?? [],
            })),
          );
        }),
      );
    },

    async create(ctx: OrgContext, input: NewProject): Promise<Result<ProjectView, AppError>> {
      return guarded(ctx, 'project.create', async () => {
        const valid = validateProject(input);
        if (!valid.ok) return err(fromDomain(valid.error));
        const project = valid.value;
        const organizationId = ctx.organization.id;
        return uow.run(contextOf(ctx), async (repos) => {
          const id = ids.next();
          const created = await repos.projects.create({
            ...fieldsOf(project),
            id,
            organizationId,
            createdById: ctx.actor.userId,
          });
          if (!created.ok) return err(codeTaken());
          // Owner et Admin accèdent à tous les projets ; les autres créateurs en deviennent membres.
          const creatorRole = asProjectRole(ctx.role);
          if (creatorRole) {
            await repos.projectMembers.add({
              id: ids.next(),
              organizationId,
              projectId: id,
              userId: ctx.actor.userId,
              role: creatorRole,
            });
          }
          await repos.projects.setDisciplines(organizationId, id, project.disciplines, () =>
            ids.next(),
          );
          const standards = await applyDefaultStandards(
            repos,
            organizationId,
            id,
            project.disciplines,
          );
          await appendActivity(repos, { ...ctx, project: { id } }, 'project.created', {
            code: project.code,
            name: project.name,
            disciplines: project.disciplines,
            standards,
          });
          await repos.audit.append({
            ...auditBase(ctx, organizationId),
            action: 'project.created',
            targetType: 'project',
            targetId: id,
            metadata: { code: project.code, disciplines: project.disciplines },
          });
          return ok(await reload(repos, organizationId, id, creatorRole ?? ctx.role));
        });
      });
    },

    async get(ctx: OrgContext, projectId: string): Promise<Result<ProjectView, AppError>> {
      return inProject(
        uow,
        ctx,
        projectId,
        { permission: 'project.read', write: false },
        async (pctx, repos) => ok(await view(repos, pctx.project, pctx.projectRole)),
      );
    },

    async update(
      ctx: OrgContext,
      projectId: string,
      input: NewProject,
      expectedVersion: number,
    ): Promise<Result<ProjectView, AppError>> {
      const valid = validateProject(input);
      return inProject(
        uow,
        ctx,
        projectId,
        { permission: 'project.update', write: true },
        async (pctx, repos) => {
          if (pctx.project.version !== expectedVersion) return err(staleVersion());
          if (!valid.ok) return err(fromDomain(valid.error));
          const next = valid.value;
          const fields = fieldsOf(next);
          const changed = (Object.keys(fields) as (keyof ProjectFields)[]).filter(
            (key) => fields[key] !== pctx.project[key],
          );
          const before = await projectDisciplines(repos, projectId);
          const disciplinesChanged = !sameSet(before, next.disciplines);
          if (changed.length === 0 && !disciplinesChanged) {
            return ok(await view(repos, pctx.project, pctx.projectRole));
          }

          const updated = await repos.projects.update(
            ctx.organization.id,
            projectId,
            fields,
            expectedVersion,
          );
          if (!updated.ok) return err(codeTaken());
          if (!updated.value) return err(staleVersion());
          if (changed.length > 0) {
            await appendActivity(repos, pctx, 'project.updated', { fields: changed });
          }
          if (disciplinesChanged) {
            await repos.projects.setDisciplines(
              ctx.organization.id,
              projectId,
              next.disciplines,
              () => ids.next(),
            );
            const standards = await applyDefaultStandards(
              repos,
              ctx.organization.id,
              projectId,
              next.disciplines,
            );
            await appendActivity(repos, pctx, 'project.disciplines_changed', {
              from: before,
              to: next.disciplines,
              standards,
            });
          }
          await repos.audit.append({
            ...auditBase(ctx, ctx.organization.id),
            action: 'project.updated',
            targetType: 'project',
            targetId: projectId,
            metadata: {
              fields: changed,
              ...(disciplinesChanged
                ? { disciplines: { from: before, to: next.disciplines } }
                : {}),
            },
          });
          return ok(await reload(repos, ctx.organization.id, projectId, pctx.projectRole));
        },
      );
    },

    async archive(ctx: OrgContext, projectId: string, expectedVersion: number) {
      return setStatus(ctx, projectId, expectedVersion, 'ARCHIVED');
    },

    async unarchive(ctx: OrgContext, projectId: string, expectedVersion: number) {
      return setStatus(ctx, projectId, expectedVersion, 'ACTIVE');
    },

    async activity(
      ctx: OrgContext,
      projectId: string,
      page: { cursor?: string | undefined; limit: number },
    ): Promise<Result<{ items: ActivityRecord[]; nextCursor: string | null }, AppError>> {
      return inProject(
        uow,
        ctx,
        projectId,
        { permission: 'project.read', write: false },
        async (_pctx, repos) => {
          const rows = await repos.activity.list(ctx.organization.id, projectId, {
            ...page,
            limit: page.limit + 1,
          });
          const items = rows.slice(0, page.limit);
          return ok({
            items,
            nextCursor: rows.length > page.limit ? (items.at(-1)?.id ?? null) : null,
          });
        },
      );
    },
  };

  function setStatus(
    ctx: OrgContext,
    projectId: string,
    expectedVersion: number,
    status: ProjectStatus,
  ): Promise<Result<{ version: number }, AppError>> {
    return inProject(
      uow,
      ctx,
      projectId,
      { permission: 'project.archive', write: false },
      async (pctx, repos) => {
        if (pctx.project.version !== expectedVersion) return err(staleVersion());
        if (pctx.project.status === status) {
          return err(
            appError(
              'CONFLICT',
              status === 'ARCHIVED' ? 'PROJECT_ALREADY_ARCHIVED' : 'PROJECT_NOT_ARCHIVED',
              status === 'ARCHIVED'
                ? 'Ce projet est déjà archivé.'
                : 'Ce projet n’est pas archivé.',
            ),
          );
        }
        if (
          !(await repos.projects.setStatus(
            ctx.organization.id,
            projectId,
            status,
            expectedVersion,
            clock.now(),
          ))
        ) {
          return err(staleVersion());
        }
        const action = status === 'ARCHIVED' ? 'project.archived' : 'project.unarchived';
        await appendActivity(repos, pctx, action, {});
        await repos.audit.append({
          ...auditBase(ctx, ctx.organization.id),
          action,
          targetType: 'project',
          targetId: projectId,
          metadata: { code: pctx.project.code },
        });
        return ok({ version: expectedVersion + 1 });
      },
    );
  }
}

export type ProjectService = ReturnType<typeof createProjectService>;
