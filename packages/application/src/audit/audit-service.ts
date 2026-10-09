import { ok, type Result } from '@consulpro/calc-core';

import { authorize, type OrgContext } from '../context';
import type { AppError } from '../errors';
import type { ApplicationDeps, AuditEntry, AuditRecord } from '../ports';
import { contextOf } from '../scope';

export function createAuditService({ uow }: Pick<ApplicationDeps, 'uow'>) {
  return {
    async list(
      ctx: OrgContext,
      page: { cursor?: string | undefined; limit: number },
    ): Promise<Result<{ items: AuditRecord[]; nextCursor: string | null }, AppError>> {
      const allowed = authorize(ctx, 'audit.read');
      if (!allowed.ok) return allowed;
      return uow.run(contextOf(ctx), async (repos) => {
        const rows = await repos.audit.list(ctx.organization.id, {
          cursor: page.cursor,
          limit: page.limit + 1,
        });
        const items = rows.slice(0, page.limit);
        const last = items.at(-1);
        return ok({ items, nextCursor: rows.length > page.limit && last ? last.id : null });
      });
    },

    /**
     * Événements d'authentification (connexion, échec, réinitialisation…),
     * hors organisation. Appelé par l'adaptateur d'authentification.
     */
    async recordAuthEvent(
      entry: Omit<AuditEntry, 'organizationId'> & { userEmail?: string | null },
    ): Promise<void> {
      const { userEmail = null, ...rest } = entry;
      await uow.run(
        { organizationId: null, userId: entry.actorUserId, userEmail },
        async (repos) => {
          await repos.audit.append({ ...rest, organizationId: null });
          return ok(undefined);
        },
      );
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
