import { createApplication, type Application, type Mailer } from '@consulpro/application';
import { createDatabase, type Database } from '@consulpro/db';

import { createAuth, type Auth } from './auth/auth';
import { createUnitOfWork } from './persistence/unit-of-work';
import { systemClock, tokenService, uuidV7Generator } from './system/services';

export { createAuth, type Auth, type AuthConfig } from './auth/auth';
export { createSmtpMailer, MemoryMailer, type SmtpConfig } from './mail/smtp-mailer';
export { createRepositories } from './persistence/repositories';
export { createUnitOfWork } from './persistence/unit-of-work';
export { systemClock, tokenService, uuidV7Generator } from './system/services';

export interface InfrastructureConfig {
  /** Connexion du rôle applicatif restreint (RLS). */
  readonly databaseUrl: string;
  readonly appUrl: string;
  readonly authSecret: string;
  readonly mailer: Mailer;
  readonly rateLimit?: boolean;
}

export interface Infrastructure {
  readonly db: Database;
  readonly app: Application;
  readonly auth: Auth;
}

/** Racine de composition côté serveur : branche les implémentations sur les ports. */
export function createInfrastructure(config: InfrastructureConfig): Infrastructure {
  const db = createDatabase(config.databaseUrl);
  const app = createApplication({
    uow: createUnitOfWork(db),
    mailer: config.mailer,
    tokens: tokenService,
    clock: systemClock,
    ids: uuidV7Generator,
    appUrl: config.appUrl,
  });
  const auth = createAuth({
    db,
    secret: config.authSecret,
    baseURL: config.appUrl,
    mailer: config.mailer,
    audit: app.audit,
    ...(config.rateLimit === undefined ? {} : { rateLimit: config.rateLimit }),
  });
  return { db, app, auth };
}
