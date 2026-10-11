import type { Actor } from '@consulpro/application';

/** Acteur applicatif à partir de l'utilisateur de la session Better Auth. */
export function actorFromSession(user: {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  platformRole?: string | null | undefined;
}): Actor {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    platformAdmin: user.platformRole === 'PLATFORM_ADMIN',
  };
}
