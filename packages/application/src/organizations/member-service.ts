import { err, ok, type Result } from '@consulpro/calc-core';
import { checkRemoval, checkRoleChange, type OrgRole } from '@consulpro/domain';

import { authorize, type OrgContext } from '../context';
import { fromDomain, notFound, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps, MemberView } from '../ports';
import { auditBase, contextOf } from '../scope';

export function createMemberService({ uow }: Pick<ApplicationDeps, 'uow'>) {
  return {
    async list(ctx: OrgContext): Promise<Result<MemberView[], AppError>> {
      const allowed = authorize(ctx, 'org.read');
      if (!allowed.ok) return allowed;
      return uow.run(contextOf(ctx), async (repos) =>
        ok(await repos.memberships.listMembers(ctx.organization.id)),
      );
    },

    /** Change le rôle d'un membre. `expectedVersion` provient de l'en-tête If-Match. */
    async changeRole(
      ctx: OrgContext,
      membershipId: string,
      role: OrgRole,
      expectedVersion: number,
    ): Promise<Result<{ version: number }, AppError>> {
      const allowed = authorize(ctx, 'org.member.manage');
      if (!allowed.ok) return allowed;
      return uow.run(contextOf(ctx), async (repos) => {
        const target = await repos.memberships.findById(ctx.organization.id, membershipId);
        if (!target) return err(notFound('Membre'));
        if (target.version !== expectedVersion) return err(staleVersion());
        const policy = checkRoleChange(
          {
            actorRole: ctx.role,
            actorUserId: ctx.actor.userId,
            targetUserId: target.userId,
            targetRole: target.role,
          },
          role,
        );
        if (!policy.ok) return err(fromDomain(policy.error));
        if (target.role === role) return ok({ version: target.version });
        if (
          !(await repos.memberships.updateRole(
            ctx.organization.id,
            membershipId,
            role,
            expectedVersion,
          ))
        ) {
          return err(staleVersion());
        }
        await repos.audit.append({
          ...auditBase(ctx, ctx.organization.id),
          action: 'member.role_changed',
          targetType: 'membership',
          targetId: membershipId,
          metadata: { userId: target.userId, from: target.role, to: role },
        });
        return ok({ version: expectedVersion + 1 });
      });
    },

    async remove(
      ctx: OrgContext,
      membershipId: string,
      expectedVersion: number,
    ): Promise<Result<void, AppError>> {
      const allowed = authorize(ctx, 'org.member.manage');
      if (!allowed.ok) return allowed;
      return uow.run(contextOf(ctx), async (repos) => {
        const target = await repos.memberships.findById(ctx.organization.id, membershipId);
        if (!target) return err(notFound('Membre'));
        if (target.version !== expectedVersion) return err(staleVersion());
        const policy = checkRemoval({
          actorRole: ctx.role,
          actorUserId: ctx.actor.userId,
          targetUserId: target.userId,
          targetRole: target.role,
        });
        if (!policy.ok) return err(fromDomain(policy.error));
        if (!(await repos.memberships.delete(ctx.organization.id, membershipId, expectedVersion))) {
          return err(staleVersion());
        }
        await repos.audit.append({
          ...auditBase(ctx, ctx.organization.id),
          action: 'member.removed',
          targetType: 'membership',
          targetId: membershipId,
          metadata: { userId: target.userId, role: target.role },
        });
        return ok(undefined);
      });
    },
  };
}

export type MemberService = ReturnType<typeof createMemberService>;
