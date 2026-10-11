import { err, ok, type Result } from '@consulpro/calc-core';

import { can } from '../access/permissions';
import type { OrgRole } from '../access/roles';
import type { DomainError } from '../errors';

/*
 * Règles de gestion des membres (docs/architecture/12-securite-rbac.md §4, note 1) :
 * - seuls Owner et Admin gèrent les membres ;
 * - un Admin ne peut ni modifier, ni retirer, ni promouvoir un Owner ;
 * - le rôle OWNER ne s'attribue pas par changement de rôle ni par invitation
 *   (il passe par le transfert de propriété) ;
 * - personne ne modifie son propre rôle ni ne se retire lui-même par ce biais.
 */

const forbidden: DomainError = {
  code: 'FORBIDDEN',
  message: 'Vous n’avez pas la permission de gérer les membres.',
};

export interface MemberChange {
  readonly actorRole: OrgRole;
  readonly actorUserId: string;
  readonly targetUserId: string;
  readonly targetRole: OrgRole;
}

export function checkRoleChange(change: MemberChange, newRole: OrgRole): Result<void, DomainError> {
  if (!can(change.actorRole, 'org.member.manage')) return err(forbidden);
  if (change.actorUserId === change.targetUserId) {
    return err({
      code: 'SELF_ROLE_CHANGE',
      message: 'Vous ne pouvez pas modifier votre propre rôle.',
    });
  }
  if (change.targetRole === 'OWNER') {
    return err({
      code: 'OWNER_PROTECTED',
      message: 'Le rôle du propriétaire ne peut pas être modifié.',
    });
  }
  if (newRole === 'OWNER') {
    return err({
      code: 'ROLE_NOT_ASSIGNABLE',
      message: 'Le rôle de propriétaire s’obtient uniquement par transfert de propriété.',
    });
  }
  return ok(undefined);
}

export function checkRemoval(change: MemberChange): Result<void, DomainError> {
  if (!can(change.actorRole, 'org.member.manage')) return err(forbidden);
  if (change.actorUserId === change.targetUserId) {
    return err({
      code: 'SELF_REMOVAL',
      message: 'Vous ne pouvez pas vous retirer vous-même de l’organisation.',
    });
  }
  if (change.targetRole === 'OWNER') {
    return err({ code: 'OWNER_PROTECTED', message: 'Le propriétaire ne peut pas être retiré.' });
  }
  return ok(undefined);
}

export function checkInvitation(
  actorRole: OrgRole,
  invitedRole: OrgRole,
): Result<void, DomainError> {
  if (!can(actorRole, 'org.member.manage')) return err(forbidden);
  if (invitedRole === 'OWNER') {
    return err({
      code: 'ROLE_NOT_ASSIGNABLE',
      message: 'Le rôle de propriétaire s’obtient uniquement par transfert de propriété.',
    });
  }
  return ok(undefined);
}

/** Durée de validité d'une invitation. */
export const INVITATION_TTL_DAYS = 7;

/**
 * Transfert de propriété : réservé au propriétaire, vers un autre membre. Le bénéficiaire
 * devient propriétaire ; l'ancien propriétaire devient administrateur (un seul propriétaire).
 */
export function checkOwnershipTransfer(change: MemberChange): Result<void, DomainError> {
  if (!can(change.actorRole, 'org.transfer')) return err(forbidden);
  if (change.actorUserId === change.targetUserId) {
    return err({
      code: 'SELF_TRANSFER',
      message: 'Choisissez un autre membre que vous-même.',
    });
  }
  return ok(undefined);
}
