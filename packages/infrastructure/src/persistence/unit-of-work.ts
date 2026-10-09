import type { Result } from '@consulpro/calc-core';
import type { DbScope, Repositories, UnitOfWork } from '@consulpro/application';
import type { Database } from '@consulpro/db';

import { createRepositories } from './repositories';

/** Sentinelle interne : provoque l'annulation de la transaction quand le travail renvoie une erreur. */
class Rollback extends Error {
  constructor(readonly result: { ok: false; error: unknown }) {
    super('rollback');
  }
}

/**
 * Unité de travail PostgreSQL. Chaque transaction pose d'abord le contexte
 * (organisation, utilisateur, e-mail) lu par les politiques RLS.
 * `set_config(…, true)` limite ces valeurs à la transaction courante.
 */
export function createUnitOfWork(db: Database): UnitOfWork {
  return {
    async run<T, E>(
      scope: DbScope,
      work: (repos: Repositories) => Promise<Result<T, E>>,
    ): Promise<Result<T, E>> {
      try {
        return await db.$transaction(async (tx) => {
          await tx.$queryRaw`
            SELECT set_config('app.organization_id', ${scope.organizationId ?? ''}, true),
                   set_config('app.user_id', ${scope.userId ?? ''}, true),
                   set_config('app.user_email', ${scope.userEmail?.toLowerCase() ?? ''}, true)`;
          const result = await work(createRepositories(tx));
          if (!result.ok) throw new Rollback(result);
          return result;
        });
      } catch (error) {
        if (error instanceof Rollback) return error.result as Result<T, E>;
        throw error;
      }
    },
  };
}
