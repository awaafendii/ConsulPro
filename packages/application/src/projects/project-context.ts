import { err, ok, type Result } from '@consulpro/calc-core';
import {
  checkProjectWritable,
  effectiveProjectRole,
  grantFor,
  type ActivityType,
  type OrgRole,
  type Permission,
} from '@consulpro/domain';

import { authorize, type OrgContext } from '../context';
import { forbidden, fromDomain, notFound, type AppError } from '../errors';
import type { Repositories, UnitOfWork } from '../ports';
import type { ProjectRecord } from '../ports-projects';
import { contextOf } from '../scope';

/** Contexte d'un utilisateur agissant sur un projet (résolu côté serveur). */
export interface ProjectContext extends OrgContext {
  readonly project: ProjectRecord;
  /** Rôle effectif : rôle d'organisation, borné par le rôle sur le projet. */
  readonly projectRole: OrgRole;
}

export const isOrgManager = (role: OrgRole) => role === 'OWNER' || role === 'ADMIN';

/**
 * Charge le projet et le rôle effectif. Un projet auquel l'utilisateur n'a pas accès
 * est « introuvable » : la réponse ne révèle pas son existence.
 */
export async function loadProject(
  repos: Repositories,
  ctx: OrgContext,
  projectId: string,
): Promise<Result<ProjectContext, AppError>> {
  const project = await repos.projects.findById(ctx.organization.id, projectId);
  if (!project) return err(notFound('Projet'));
  const member = isOrgManager(ctx.role)
    ? null
    : await repos.projectMembers.findByUserId(ctx.organization.id, projectId, ctx.actor.userId);
  const projectRole = effectiveProjectRole(ctx.role, member?.role ?? null);
  if (projectRole === null) return err(notFound('Projet'));
  return ok({ ...ctx, project, projectRole });
}

export function authorizeProject(
  ctx: ProjectContext,
  permission: Permission,
  options?: { isOwnResource?: boolean },
): Result<void, AppError> {
  return authorize({ ...ctx, role: ctx.projectRole }, permission, options);
}

export interface ProjectAccess {
  readonly permission: Permission;
  /** Action d'écriture : refusée sur un projet archivé. */
  readonly write: boolean;
}

/**
 * Exécute `work` dans une transaction, sur un projet accessible, avec la permission requise.
 * Ordre des contrôles : rôle d'organisation (403, sans lien avec le projet visé), accès au
 * projet (404), rôle effectif sur le projet (403), puis projet modifiable (archivage).
 */
export function inProject<T>(
  uow: UnitOfWork,
  ctx: OrgContext,
  projectId: string,
  access: ProjectAccess,
  work: (pctx: ProjectContext, repos: Repositories) => Promise<Result<T, AppError>>,
): Promise<Result<T, AppError>> {
  if (grantFor(ctx.role, access.permission) === 'NONE') {
    return Promise.resolve(err(forbidden()));
  }
  return uow.run(contextOf(ctx), async (repos) => {
    const loaded = await loadProject(repos, ctx, projectId);
    if (!loaded.ok) return loaded;
    const pctx = loaded.value;
    if (grantFor(pctx.projectRole, access.permission) === 'NONE') {
      return err(forbidden());
    }
    if (access.write) {
      const writable = checkProjectWritable(pctx.project.status);
      if (!writable.ok) return err(fromDomain(writable.error));
    }
    return work(pctx, repos);
  });
}

export async function projectDisciplines(repos: Repositories, projectId: string) {
  return (await repos.projects.disciplines([projectId])).get(projectId) ?? [];
}

/** Ajoute un événement au fil d'activité du projet (même transaction que la mutation). */
export async function appendActivity(
  repos: Repositories,
  ctx: OrgContext & { readonly project: { readonly id: string } },
  type: ActivityType,
  summary: Record<string, unknown>,
  target: { readonly type: string; readonly id: string } = { type: 'project', id: ctx.project.id },
): Promise<void> {
  await repos.activity.append({
    organizationId: ctx.organization.id,
    projectId: ctx.project.id,
    actorUserId: ctx.actor.userId,
    type,
    targetType: target.type,
    targetId: target.id,
    summary,
  });
}
