import { err, ok, type Result } from '@consulpro/calc-core';
import { checkInvitation, INVITATION_TTL_DAYS, ROLE_LABELS, type OrgRole } from '@consulpro/domain';

import { authorize, type OrgContext, type UserContext } from '../context';
import { appError, fromDomain, notFound, type AppError } from '../errors';
import type { ApplicationDeps, InvitationRecord, OrganizationRecord } from '../ports';
import { auditBase, contextOf, orgScope, userScope } from '../scope';

const DAY_MS = 86_400_000;

export function createInvitationService({
  uow,
  mailer,
  tokens,
  clock,
  ids,
  appUrl,
}: Pick<ApplicationDeps, 'uow' | 'mailer' | 'tokens' | 'clock' | 'ids' | 'appUrl'>) {
  return {
    async list(ctx: OrgContext): Promise<Result<InvitationRecord[], AppError>> {
      const allowed = authorize(ctx, 'org.member.manage');
      if (!allowed.ok) return allowed;
      return uow.run(contextOf(ctx), async (repos) =>
        ok(await repos.invitations.listPending(ctx.organization.id, clock.now())),
      );
    },

    /** Crée une invitation et envoie le lien par e-mail (annulée si l'envoi échoue). */
    async create(
      ctx: OrgContext,
      input: { email: string; role: OrgRole },
    ): Promise<Result<InvitationRecord, AppError>> {
      const allowed = authorize(ctx, 'org.member.manage');
      if (!allowed.ok) return allowed;
      const policy = checkInvitation(ctx.role, input.role);
      if (!policy.ok) return err(fromDomain(policy.error));
      const email = input.email.trim().toLowerCase();
      const now = clock.now();

      return uow.run(contextOf(ctx), async (repos) => {
        if (await repos.memberships.findByEmail(ctx.organization.id, email)) {
          return err(
            appError(
              'CONFLICT',
              'ALREADY_MEMBER',
              'Cette personne est déjà membre de l’organisation.',
            ),
          );
        }
        if (await repos.invitations.findPendingByEmail(ctx.organization.id, email, now)) {
          return err(
            appError(
              'CONFLICT',
              'INVITATION_PENDING',
              'Une invitation est déjà en attente pour cette adresse.',
            ),
          );
        }
        const { token, hash } = tokens.generate();
        const invitation = await repos.invitations.create({
          id: ids.next(),
          organizationId: ctx.organization.id,
          email,
          role: input.role,
          tokenHash: hash,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS),
          invitedById: ctx.actor.userId,
        });
        await repos.audit.append({
          ...auditBase(ctx, ctx.organization.id),
          action: 'invitation.created',
          targetType: 'invitation',
          targetId: invitation.id,
          metadata: { email, role: input.role },
        });
        await mailer.send({
          to: email,
          subject: `Invitation à rejoindre ${ctx.organization.name} sur ConsulPro`,
          text: [
            `${ctx.actor.name} vous invite à rejoindre l'organisation « ${ctx.organization.name} » sur ConsulPro`,
            `en tant que ${ROLE_LABELS[input.role]}.`,
            '',
            `Pour accepter, ouvrez ce lien (valable ${INVITATION_TTL_DAYS} jours) :`,
            `${appUrl}/invitation/${token}`,
            '',
            'Si vous ne connaissez pas l’expéditeur, ignorez ce message.',
          ].join('\n'),
        });
        return ok(invitation);
      });
    },

    async revoke(ctx: OrgContext, invitationId: string): Promise<Result<void, AppError>> {
      const allowed = authorize(ctx, 'org.member.manage');
      if (!allowed.ok) return allowed;
      return uow.run(contextOf(ctx), async (repos) => {
        const invitation = await repos.invitations.findById(ctx.organization.id, invitationId);
        if (!invitation) return err(notFound('Invitation'));
        if (invitation.status !== 'PENDING') {
          return err(
            appError(
              'CONFLICT',
              'INVITATION_NOT_PENDING',
              'Cette invitation n’est plus en attente.',
            ),
          );
        }
        await repos.invitations.setStatus(
          ctx.organization.id,
          invitationId,
          'REVOKED',
          clock.now(),
        );
        await repos.audit.append({
          ...auditBase(ctx, ctx.organization.id),
          action: 'invitation.revoked',
          targetType: 'invitation',
          targetId: invitationId,
          metadata: { email: invitation.email },
        });
        return ok(undefined);
      });
    },

    /**
     * Accepte une invitation. Le jeton n'est valable que pour l'adresse invitée :
     * pour toute autre adresse, l'invitation est « introuvable ».
     */
    async accept(ctx: UserContext, token: string): Promise<Result<OrganizationRecord, AppError>> {
      const now = clock.now();
      const hash = tokens.hash(token);
      const lookup = await uow.run(userScope(ctx), async (repos) => {
        const invitation = await repos.invitations.findByTokenHash(hash);
        if (!invitation || invitation.email !== ctx.actor.email.toLowerCase())
          return err(notFound('Invitation'));
        return ok(invitation);
      });
      if (!lookup.ok) return lookup;
      const { organizationId, id } = lookup.value;

      return uow.run(orgScope(ctx, organizationId), async (repos) => {
        const invitation = await repos.invitations.findById(organizationId, id);
        if (invitation?.status !== 'PENDING') {
          return err(
            appError('GONE', 'INVITATION_NOT_PENDING', 'Cette invitation n’est plus valable.'),
          );
        }
        if (invitation.expiresAt.getTime() <= now.getTime()) {
          return err(appError('GONE', 'INVITATION_EXPIRED', 'Cette invitation a expiré.'));
        }
        if (await repos.memberships.findByUserId(organizationId, ctx.actor.userId)) {
          return err(
            appError('CONFLICT', 'ALREADY_MEMBER', 'Vous êtes déjà membre de cette organisation.'),
          );
        }
        const membershipId = ids.next();
        await repos.memberships.create({
          id: membershipId,
          organizationId,
          userId: ctx.actor.userId,
          role: invitation.role,
        });
        await repos.invitations.setStatus(organizationId, id, 'ACCEPTED', now);
        await repos.audit.append({
          ...auditBase(ctx, organizationId),
          action: 'invitation.accepted',
          targetType: 'invitation',
          targetId: id,
          metadata: { membershipId, role: invitation.role },
        });
        const organization = await repos.organizations.findById(organizationId);
        if (!organization) return err(notFound('Organisation'));
        return ok(organization);
      });
    },
  };
}

export type InvitationService = ReturnType<typeof createInvitationService>;
