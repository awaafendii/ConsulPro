import {
  createInfrastructure,
  createSmtpMailer,
  type Infrastructure,
} from '@consulpro/infrastructure';
import { pino, type Logger } from 'pino';

import { loadEnv, type Env } from './env';
import { createRoutes } from './http/routes';
import type { RouteDefinition } from './http/route';

export interface Server {
  readonly env: Env;
  readonly infra: Infrastructure;
  readonly routes: ReadonlyMap<string, RouteDefinition>;
  readonly logger: Logger;
}

const globalStore = globalThis as typeof globalThis & { __consulproServer?: Server };

/**
 * Racine de composition du serveur web (singleton, conservé entre les rechargements
 * à chaud du développement). La configuration est validée au premier appel.
 */
export function getServer(): Server {
  if (!globalStore.__consulproServer) {
    const env = loadEnv();
    const logger = pino({ level: env.NODE_ENV === 'production' ? 'info' : 'debug' });
    const mailer = createSmtpMailer({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER || undefined,
      password: env.SMTP_PASSWORD || undefined,
      from: env.MAIL_FROM,
    });
    const infra = createInfrastructure({
      databaseUrl: env.DATABASE_URL,
      appUrl: env.APP_URL,
      authSecret: env.BETTER_AUTH_SECRET,
      mailer,
    });
    const routes = createRoutes({ app: infra.app, auth: infra.auth, appUrl: env.APP_URL, logger });
    globalStore.__consulproServer = {
      env,
      infra,
      logger,
      routes: new Map(routes.map((r) => [r.id, r])),
    };
  }
  return globalStore.__consulproServer;
}
