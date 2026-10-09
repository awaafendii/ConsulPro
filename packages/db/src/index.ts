import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client';

export { Prisma, PrismaClient } from './generated/prisma/client';
export type { InvitationStatus, OrgRole } from './generated/prisma/enums';

export type Database = InstanceType<typeof PrismaClient>;

/**
 * Client Prisma via l'adaptateur `pg`. L'application se connecte avec le rôle
 * restreint (`consulpro_app`), soumis à la RLS ; jamais avec le rôle propriétaire.
 */
export function createDatabase(connectionString: string, options: { max?: number } = {}): Database {
  const adapter = new PrismaPg({ connectionString, max: options.max ?? 10 });
  return new PrismaClient({ adapter });
}
