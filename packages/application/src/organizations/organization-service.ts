import { err, ok, type Result } from '@consulpro/calc-core';
import { validateNewOrganization, validateOrganizationSettings } from '@consulpro/domain';

import { guarded, type OrgContext, type UserContext } from '../context';
import { appError, fromDomain, notFound, reread, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps, MyOrganization, OrganizationRecord } from '../ports';
import { auditBase, contextOf, orgScope, userScope } from '../scope';

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

    /** Paramètres de l'organisation courante. */
    async current(ctx: OrgContext): Promise<Result<OrganizationRecord, AppError>> {
      return guarded(ctx, 'org.read', () =>
        uow.run(contextOf(ctx), async (repos) => {
          const organization = await repos.organizations.findById(ctx.organization.id);
          return organization ? ok(organization) : err(notFound('Organisation'));
        }),
      );
    },

    /**
     * Modifie le nom, le pays et la devise proposée aux nouveaux quantitatifs (décision Q3).
     * Les quantitatifs existants gardent leur devise : aucune conversion n'est faite.
     */
    async update(
      ctx: OrgContext,
      input: { name: string; country: string | null; currency: string },
      expectedVersion: number,
    ): Promise<Result<OrganizationRecord, AppError>> {
      return guarded(ctx, 'org.update', async () => {
        const valid = validateOrganizationSettings(input);
        if (!valid.ok) return err(fromDomain(valid.error));
        const id = ctx.organization.id;
        return uow.run(contextOf(ctx), async (repos) => {
          const current = await repos.organizations.findById(id);
          if (!current) return err(notFound('Organisation'));
          if (current.version !== expectedVersion) return err(staleVersion());
          const changes = Object.fromEntries(
            (['name', 'country', 'currency'] as const)
              .filter((key) => current[key] !== valid.value[key])
              .map((key) => [key, { from: current[key], to: valid.value[key] }]),
          );
          if (Object.keys(changes).length === 0) return ok(current);
          if (!(await repos.organizations.update(id, valid.value, expectedVersion))) {
            return err(staleVersion());
          }
          await repos.audit.append({
            ...auditBase(ctx, id),
            action: 'organization.updated',
            targetType: 'organization',
            targetId: id,
            metadata: changes,
          });
          return ok(reread(await repos.organizations.findById(id), 'Organisation'));
        });
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
