import type { OrgContext, UserContext } from './context';
import type { AuditEntry, DbScope } from './ports';

export function userScope(ctx: UserContext): DbScope {
  return { organizationId: null, userId: ctx.actor.userId, userEmail: ctx.actor.email };
}

export function orgScope(ctx: UserContext, organizationId: string): DbScope {
  return { organizationId, userId: ctx.actor.userId, userEmail: ctx.actor.email };
}

/** Champs d'audit communs à toute action d'un utilisateur. */
export function auditBase(
  ctx: UserContext,
  organizationId: string | null,
): Pick<AuditEntry, 'organizationId' | 'actorUserId' | 'requestId' | 'ip' | 'userAgent'> {
  return {
    organizationId,
    actorUserId: ctx.actor.userId,
    requestId: ctx.meta.requestId,
    ip: ctx.meta.ip,
    userAgent: ctx.meta.userAgent,
  };
}

export function contextOf(ctx: OrgContext): DbScope {
  return orgScope(ctx, ctx.organization.id);
}
