import { err, ok, type Result } from '@consulpro/calc-core';
import { validateNewOrganization } from '@consulpro/domain';

import type { OrgContext, UserContext } from '../context';
import { appError, fromDomain, notFound, type AppError } from '../errors';
import type { ApplicationDeps, MyOrganization } from '../ports';
import { auditBase, orgScope, userScope } from '../scope';

export function createOrganizationService({ uow, ids }: Pick<ApplicationDeps, 'uow' | 'ids'>) {
  return {
    /** Organisations dont l'utilisateur est membre. */
    async listMine(ctx: UserContext): Promise<Result<MyOrganization[], AppError>> {
      return uow.run(userScope(ctx), async (repos) =>
        ok(await repos.memberships.listOrganizationsOfUser(ctx.actor.userId)),
      );
    },

    /** Crée une organisation ; le créateur en devient propriétaire. */
    async create(
      ctx: UserContext,
      input: { name: string; slug: string },
    ): Promise<Result<MyOrganization, AppError>> {
      const valid = validateNewOrganization(input);
      if (!valid.ok) return err(fromDomain(valid.error));
      const organizationId = ids.next();
      const membershipId = ids.next();

      return uow.run(orgScope(ctx, organizationId), async (repos) => {
        const created = await repos.organizations.create({ id: organizationId, ...valid.value });
        if (!created.ok) {
          return err(
            appError(
              'CONFLICT',
              'ORGANIZATION_SLUG_TAKEN',
              `L'identifiant « ${valid.value.slug} » est déjà utilisé.`,
            ),
          );
        }
        await repos.memberships.create({
          id: membershipId,
          organizationId,
          userId: ctx.actor.userId,
          role: 'OWNER',
        });
        await repos.audit.append({
          ...auditBase(ctx, organizationId),
          action: 'organization.created',
          targetType: 'organization',
          targetId: organizationId,
          metadata: { name: valid.value.name, slug: valid.value.slug },
        });
        return ok({ ...created.value, role: 'OWNER' as const, membershipId });
      });
    },

    /**
     * Résout le contexte d'organisation depuis l'identifiant d'URL.
     * Un non-membre reçoit NOT_FOUND : l'existence de l'organisation n'est pas révélée.
     */
    async resolveContext(ctx: UserContext, slug: string): Promise<Result<OrgContext, AppError>> {
      const found = await uow.run(userScope(ctx), async (repos) =>
        ok(await repos.memberships.findOrganizationOfUserBySlug(ctx.actor.userId, slug)),
      );
      if (!found.ok) return found;
      const organization = found.value;
      if (!organization) return err(notFound('Organisation'));
      return ok({
        ...ctx,
        organization: { id: organization.id, slug: organization.slug, name: organization.name },
        membershipId: organization.membershipId,
        role: organization.role,
      });
    },
  };
}

export type OrganizationService = ReturnType<typeof createOrganizationService>;
