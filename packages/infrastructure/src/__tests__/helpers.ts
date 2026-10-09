import type { UserContext } from '@consulpro/application';
import { adminQuery, unique } from '@consulpro/test-utils';
import { inject } from 'vitest';

export const database = () => inject('database');

export interface TestUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** Crée un utilisateur vérifié directement en base (rôle propriétaire). */
export async function createUser(prefix = 'user'): Promise<TestUser> {
  const email = `${unique(prefix)}@consulpro.test`.toLowerCase();
  const [row] = await adminQuery<{ id: string }>(
    database().adminUrl,
    `INSERT INTO users (id, name, email, email_verified, updated_at)
     VALUES (gen_random_uuid(), $1, $2, true, now()) RETURNING id`,
    [prefix, email],
  );
  if (!row) throw new Error('utilisateur non créé');
  return { id: row.id, email, name: prefix };
}

export function ctxOf(user: TestUser): UserContext {
  return {
    actor: { userId: user.id, email: user.email, name: user.name, emailVerified: true },
    meta: { requestId: unique('req'), ip: '198.51.100.7', userAgent: 'vitest' },
  };
}
