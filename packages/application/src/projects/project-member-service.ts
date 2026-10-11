import { err, ok, type Result } from '@consulpro/calc-core';
import { checkProjectRole, type ProjectRole } from '@consulpro/domain';

import type { OrgContext } from '../context';
import { appError, fromDomain, notFound, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps, Repositories } from '../ports';
import type { ProjectMemberRecord, ProjectMemberView } from '../ports-projects';
import { auditBase } from '../scope';
import { appendActivity, inProject } from './project-context';

const MANAGE = { permission: 'project.member.manage', write: true } as const;

/** Nom affiché dans le fil d'activité (lisible même après le départ de la personne). */
async function memberName(
  repos: Repositories,
  organizationId: string,
  projectId: string,
  userId: string,
) {
  const members = await repos.projectMembers.list(organizationId, projectId);
  return members.find((m) => m.userId === userId)?.name ?? null;
}

export function createProjectMemberService({ uow, ids }: Pick<ApplicationDeps, 'uow' | 'ids'>) {
  return {
    async list(ctx: OrgContext, projectId: string): Promise<Result<ProjectMemberView[], AppError>> {
      return inProject(
        uow,
        ctx,
        projectId,
        { permission: 'project.read', write: false },
        async (_pctx, repos) => ok(await repos.projectMembers.list(ctx.organization.id, projectId)),
      );
    },

    /** Ajoute un membre de l'organisation au projet, avec un rôle au plus égal à son rôle d'organisation. */
    async add(
      ctx: OrgContext,
      projectId: string,
      input: { userId: string; role: ProjectRole },
    ): Promise<Result<ProjectMemberRecord, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const membership = await repos.memberships.findByUserId(orgId, input.userId);
        if (!membership) return err(notFound('Membre de l’organisation'));
        const policy = checkProjectRole(membership.role, input.role);
        if (!policy.ok) return err(fromDomain(policy.error));
        if (await repos.projectMembers.findByUserId(orgId, projectId, input.userId)) {
          return err(
            appError(
              'CONFLICT',
              'ALREADY_PROJECT_MEMBER',
              'Cette personne est déjà membre du projet.',
            ),
          );
        }
        const member = await repos.projectMembers.add({
          id: ids.next(),
          organizationId: orgId,
          projectId,
          userId: input.userId,
          role: input.role,
        });
        await appendActivity(
          repos,
          pctx,
          'project.member_added',
          {
            userId: input.userId,
            name: await memberName(repos, orgId, projectId, input.userId),
            role: input.role,
          },
          { type: 'project_member', id: member.id },
        );
        await repos.audit.append({
          ...auditBase(ctx, orgId),
          action: 'project.member_added',
          targetType: 'project_member',
          targetId: member.id,
          metadata: { projectId, userId: input.userId, role: input.role },
        });
        return ok(member);
      });
    },

    async changeRole(
      ctx: OrgContext,
      projectId: string,
      memberId: string,
      role: ProjectRole,
      expectedVersion: number,
    ): Promise<Result<{ version: number }, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const target = await repos.projectMembers.findById(orgId, projectId, memberId);
        if (!target) return err(notFound('Membre du projet'));
        if (target.version !== expectedVersion) return err(staleVersion());
        const membership = await repos.memberships.findByUserId(orgId, target.userId);
        if (!membership) return err(notFound('Membre de l’organisation'));
        const policy = checkProjectRole(membership.role, role);
        if (!policy.ok) return err(fromDomain(policy.error));
        if (target.role === role) return ok({ version: target.version });
        if (
          !(await repos.projectMembers.updateRole(
            orgId,
            projectId,
            memberId,
            role,
            expectedVersion,
          ))
        ) {
          return err(staleVersion());
        }
        await appendActivity(
          repos,
          pctx,
          'project.member_role_changed',
          {
            userId: target.userId,
            name: await memberName(repos, orgId, projectId, target.userId),
            from: target.role,
            to: role,
          },
          { type: 'project_member', id: memberId },
        );
        await repos.audit.append({
          ...auditBase(ctx, orgId),
          action: 'project.member_role_changed',
          targetType: 'project_member',
          targetId: memberId,
          metadata: { projectId, userId: target.userId, from: target.role, to: role },
        });
        return ok({ version: expectedVersion + 1 });
      });
    },

    async remove(
      ctx: OrgContext,
      projectId: string,
      memberId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const orgId = ctx.organization.id;
        const target = await repos.projectMembers.findById(orgId, projectId, memberId);
        if (!target) return err(notFound('Membre du projet'));
        if (target.version !== expectedVersion) return err(staleVersion());
        const name = await memberName(repos, orgId, projectId, target.userId);
        if (!(await repos.projectMembers.remove(orgId, projectId, memberId, expectedVersion))) {
          return err(staleVersion());
        }
        await appendActivity(
          repos,
          pctx,
          'project.member_removed',
          { userId: target.userId, name, role: target.role },
          { type: 'project_member', id: memberId },
        );
        await repos.audit.append({
          ...auditBase(ctx, orgId),
          action: 'project.member_removed',
          targetType: 'project_member',
          targetId: memberId,
          metadata: { projectId, userId: target.userId, role: target.role },
        });
        return ok(undefined);
      });
    },
  };
}

export type ProjectMemberService = ReturnType<typeof createProjectMemberService>;
