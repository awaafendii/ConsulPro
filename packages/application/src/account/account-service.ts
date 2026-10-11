import { err, ok, type Result } from '@consulpro/calc-core';
import { checkOwnershipTransfer, effectiveProjectRole } from '@consulpro/domain';

import { authorize, type OrgContext, type UserContext } from '../context';
import { appError, fromDomain, notFound, type AppError } from '../errors';
import type { ApplicationDeps } from '../ports';
import type { NotificationRecord, SearchHit } from '../ports-calculations';
import { isOrgManager } from '../projects/project-context';
import { auditBase, contextOf, userScope } from '../scope';

/** Fuseau IANA reconnu par le moteur JavaScript (validation sans liste codée en dur). */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('fr', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export interface SearchResult extends SearchHit {
  readonly href: string;
}

export function createAccountService({
  uow,
  clock,
  defaultTimeZone,
}: Pick<ApplicationDeps, 'uow' | 'clock' | 'defaultTimeZone'>) {
  return {
    // --- Préférences ----------------------------------------------------------------------

    async preferences(
      ctx: UserContext,
    ): Promise<
      Result<
        { timeZone: string | null; effectiveTimeZone: string; twoFactorEnabled: boolean },
        AppError
      >
    > {
      return uow.run(userScope(ctx), async (repos) => {
        const prefs = await repos.users.preferences(ctx.actor.userId);
        if (!prefs) return err(notFound('Compte'));
        return ok({ ...prefs, effectiveTimeZone: prefs.timeZone ?? defaultTimeZone });
      });
    },

    async setTimeZone(ctx: UserContext, timeZone: string | null): Promise<Result<void, AppError>> {
      if (timeZone !== null && !isTimeZone(timeZone)) {
        return err(appError('VALIDATION', 'TIME_ZONE_INVALID', 'Fuseau horaire inconnu.'));
      }
      return uow.run(userScope(ctx), async (repos) => {
        await repos.users.setTimeZone(ctx.actor.userId, timeZone);
        return ok(undefined);
      });
    },

    // --- Notifications --------------------------------------------------------------------

    async notifications(
      ctx: UserContext,
      page: { cursor?: string | undefined; limit: number; unreadOnly: boolean },
    ): Promise<
      Result<
        { items: NotificationRecord[]; nextCursor: string | null; unreadCount: number },
        AppError
      >
    > {
      return uow.run(userScope(ctx), async (repos) => {
        const rows = await repos.notifications.list(ctx.actor.userId, {
          ...page,
          limit: page.limit + 1,
        });
        const items = rows.slice(0, page.limit);
        const last = items.at(-1);
        return ok({
          items,
          nextCursor: rows.length > page.limit && last ? last.id : null,
          unreadCount: await repos.notifications.countUnread(ctx.actor.userId),
        });
      });
    },

    /** Marque comme lues (toutes si `ids` est null). */
    async markRead(
      ctx: UserContext,
      ids: readonly string[] | null,
    ): Promise<Result<{ updated: number }, AppError>> {
      return uow.run(userScope(ctx), async (repos) =>
        ok({ updated: await repos.notifications.markRead(ctx.actor.userId, ids, clock.now()) }),
      );
    },

    // --- Recherche globale ----------------------------------------------------------------

    /** Projets, études et calculs accessibles dont l'intitulé contient le texte (sans accents). */
    async search(ctx: OrgContext, text: string): Promise<Result<SearchResult[], AppError>> {
      const allowed = authorize(ctx, 'project.read');
      if (!allowed.ok) return allowed;
      return uow.run(contextOf(ctx), async (repos) => {
        const hits = await repos.search.run(ctx.organization.id, text.trim(), 30);
        // La base ne renvoie que les projets accessibles (RLS) ; filtre applicatif en plus.
        const roles = isOrgManager(ctx.role)
          ? null
          : await repos.projectMembers.rolesOfUser(ctx.organization.id, ctx.actor.userId);
        const base = `/${ctx.organization.slug}/projets`;
        return ok(
          hits
            .filter((h) => !roles || effectiveProjectRole(ctx.role, roles.get(h.projectId) ?? null))
            .map((h) => ({
              ...h,
              href:
                h.type === 'project'
                  ? `${base}/${h.projectId}`
                  : h.type === 'study'
                    ? `${base}/${h.projectId}/etudes/${h.id}`
                    : `${base}/${h.projectId}/calculs/${h.id}`,
            })),
        );
      });
    },

    // --- Transfert de propriété -----------------------------------------------------------

    /** Le bénéficiaire devient propriétaire ; l'ancien propriétaire devient administrateur. */
    async transferOwnership(
      ctx: OrgContext,
      membershipId: string,
    ): Promise<Result<void, AppError>> {
      const allowed = authorize(ctx, 'org.transfer');
      if (!allowed.ok) return allowed;
      return uow.run(contextOf(ctx), async (repos) => {
        const orgId = ctx.organization.id;
        const target = await repos.memberships.findById(orgId, membershipId);
        if (!target) return err(notFound('Membre'));
        const policy = checkOwnershipTransfer({
          actorRole: ctx.role,
          actorUserId: ctx.actor.userId,
          targetUserId: target.userId,
          targetRole: target.role,
        });
        if (!policy.ok) return err(fromDomain(policy.error));
        const self = await repos.memberships.findById(orgId, ctx.membershipId);
        if (!self) return err(notFound('Membre'));
        const demoted = await repos.memberships.updateRole(orgId, self.id, 'ADMIN', self.version);
        const promoted = await repos.memberships.updateRole(
          orgId,
          target.id,
          'OWNER',
          target.version,
        );
        if (!demoted || !promoted) {
          return err(
            appError(
              'PRECONDITION_FAILED',
              'VERSION_MISMATCH',
              'Les adhésions ont changé entre-temps. Rechargez puis réessayez.',
            ),
          );
        }
        await repos.audit.append({
          ...auditBase(ctx, orgId),
          action: 'organization.ownership_transferred',
          targetType: 'membership',
          targetId: target.id,
          metadata: { from: ctx.actor.userId, to: target.userId, previousRole: target.role },
        });
        await repos.notifications.create([
          {
            userId: target.userId,
            organizationId: orgId,
            type: 'organization.ownership_received',
            title: `Vous êtes désormais propriétaire de ${ctx.organization.name}`,
            body: `Transfert effectué par ${ctx.actor.name}.`,
            link: `/${ctx.organization.slug}/organisation/membres`,
          },
        ]);
        return ok(undefined);
      });
    },
  };
}

export type AccountService = ReturnType<typeof createAccountService>;
