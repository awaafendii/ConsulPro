import { err, ok, type Result } from '@consulpro/calc-core';
import { can, type OrgRole, type Permission } from '@consulpro/domain';

import { appError, type AppError } from './errors';

export interface Actor {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly emailVerified: boolean;
}

export interface RequestMeta {
  readonly requestId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/** Contexte d'un utilisateur authentifié, hors organisation. */
export interface UserContext {
  readonly actor: Actor;
  readonly meta: RequestMeta;
}

/** Contexte d'un membre agissant dans une organisation (résolu côté serveur, jamais fourni par le client). */
export interface OrgContext extends UserContext {
  readonly organization: { readonly id: string; readonly slug: string; readonly name: string };
  readonly membershipId: string;
  readonly role: OrgRole;
}

export function authorize(
  ctx: OrgContext,
  permission: Permission,
  options: { isOwnResource?: boolean } = {},
): Result<void, AppError> {
  return can(ctx.role, permission, options)
    ? ok(undefined)
    : err(
        appError(
          'FORBIDDEN',
          'FORBIDDEN',
          'Vous n’avez pas la permission d’effectuer cette action.',
        ),
      );
}
