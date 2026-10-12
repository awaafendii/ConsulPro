import { createApplication, type Application, type Mailer } from '@consulpro/application';
import { BTP_ENGINES } from '@consulpro/calc-btp';
import { EngineRegistry } from '@consulpro/calc-core';
import { DEMO_ENGINES } from '@consulpro/calc-demo';
import { createDatabase, type Database } from '@consulpro/db';

import { createAuth, type Auth } from './auth/auth';
import { createUnitOfWork } from './persistence/unit-of-work';
import { sha256Hasher, systemClock, tokenService, uuidV7Generator } from './system/services';

export { createAuth, type Auth, type AuthConfig } from './auth/auth';
export { createSmtpMailer, MemoryMailer, type SmtpConfig } from './mail/smtp-mailer';
export { createRepositories } from './persistence/repositories';
export { createUnitOfWork } from './persistence/unit-of-work';
export { loadStandard, setPlatformAdmin, type LoadResult } from './standards/load-standard';
export { sha256Hasher, systemClock, tokenService, uuidV7Generator } from './system/services';

export interface InfrastructureConfig {
  /** Connexion du rôle applicatif restreint (RLS). */
  readonly databaseUrl: string;
  readonly appUrl: string;
  readonly authSecret: string;
  readonly mailer: Mailer;
  readonly rateLimit?: boolean;
  /**
   * Moteurs de démonstration (sans valeur technique) : développement et test uniquement
   * (CONSULPRO_DEMO_ENGINES=true). Les moteurs métier sont toujours enregistrés.
   */
  readonly demoEngines?: boolean;
  /** Fuseau horaire par défaut (IANA). */
  readonly defaultTimeZone?: string;
}

/** Registre des moteurs disponibles sur ce serveur : moteurs métier livrés, puis démonstration. */
export function createEngineRegistry(options: { demoEngines: boolean }): EngineRegistry {
  const registry = new EngineRegistry();
  for (const engine of BTP_ENGINES) registry.register(engine);
  if (options.demoEngines) for (const engine of DEMO_ENGINES) registry.register(engine);
  return registry;
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
    hasher: sha256Hasher,
    engines: createEngineRegistry({ demoEngines: config.demoEngines === true }),
    defaultTimeZone: config.defaultTimeZone ?? 'Africa/Abidjan',
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
