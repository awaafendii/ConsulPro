import type { AuditService, Mailer } from '@consulpro/application';
import type { Database } from '@consulpro/db';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';

export interface AuthConfig {
  readonly db: Database;
  readonly secret: string;
  /** URL publique de l'application (ex. https://app.consulpro.example). */
  readonly baseURL: string;
  readonly mailer: Mailer;
  readonly audit: Pick<AuditService, 'recordAuthEvent'>;
  /** Limitation de débit des endpoints d'authentification (désactivable en test). */
  readonly rateLimit?: boolean;
}

const RATE_WINDOW_S = 15 * 60;

/** Endpoints sans usage en Phase 1 : désactivés plutôt qu'exposés. */
const DISABLED_PATHS = [
  '/sign-in/social',
  '/link-social',
  '/unlink-account',
  '/callback/:id',
  '/get-access-token',
  '/refresh-token',
  '/account-info',
  '/delete-user',
  '/delete-user/callback',
  '/change-email',
];

/**
 * Authentification (ADR-0009). Better Auth gère identités et sessions ;
 * l'autorisation reste dans `domain/access`.
 */
export function createAuth(config: AuthConfig) {
  const { mailer, audit } = config;

  return betterAuth({
    appName: 'ConsulPro',
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: '/api/auth',
    database: prismaAdapter(config.db, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,
    advanced: {
      cookiePrefix: 'consulpro',
      // Identifiants UUID v7 générés par Prisma (@default(uuid(7))).
      database: { generateId: false },
    },
    user: {
      // Champs propres à ConsulPro, lus dans la session ; jamais modifiables par l'utilisateur
      // via Better Auth (input: false). Le rôle plateforme est en outre protégé par un trigger.
      additionalFields: {
        platformRole: { type: 'string', required: false, input: false },
        timeZone: { type: 'string', required: false, input: false },
      },
    },
    session: {
      expiresIn: 7 * 24 * 3600,
      updateAge: 24 * 3600,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      async sendResetPassword({ user, url }) {
        await mailer.send({
          to: user.email,
          subject: 'Réinitialisation de votre mot de passe ConsulPro',
          text: [
            'Une réinitialisation de mot de passe a été demandée pour votre compte ConsulPro.',
            '',
            'Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :',
            url,
            '',
            'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
          ].join('\n'),
        });
        await audit.recordAuthEvent({
          actorUserId: user.id,
          userEmail: user.email,
          action: 'auth.password_reset_requested',
        });
      },
      async onPasswordReset({ user }) {
        await audit.recordAuthEvent({
          actorUserId: user.id,
          userEmail: user.email,
          action: 'auth.password_reset',
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 3600,
      async sendVerificationEmail({ user, url }) {
        await mailer.send({
          to: user.email,
          subject: 'Confirmez votre adresse e-mail ConsulPro',
          text: [
            `Bonjour ${user.name},`,
            '',
            'Pour activer votre compte ConsulPro, confirmez votre adresse en ouvrant ce lien (valable 24 heures) :',
            url,
          ].join('\n'),
        });
      },
      async afterEmailVerification(user) {
        await audit.recordAuthEvent({
          actorUserId: user.id,
          userEmail: user.email,
          action: 'auth.email_verified',
        });
      },
    },
    rateLimit: {
      enabled: config.rateLimit ?? true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: RATE_WINDOW_S, max: 5 },
        '/sign-up/email': { window: RATE_WINDOW_S, max: 5 },
        '/request-password-reset': { window: RATE_WINDOW_S, max: 5 },
        '/send-verification-email': { window: RATE_WINDOW_S, max: 5 },
      },
    },
    // Double authentification TOTP facultative (décision du 2026-10-09), codes de secours.
    plugins: [twoFactor({ issuer: 'ConsulPro' })],
    databaseHooks: {
      user: {
        update: {
          async after(user, ctx) {
            // Seuls ces deux endpoints modifient l'activation de la 2FA.
            const path = ctx?.path;
            if (path !== '/two-factor/verify-totp' && path !== '/two-factor/disable') return;
            await audit.recordAuthEvent({
              actorUserId: user.id,
              userEmail: user.email,
              action:
                path === '/two-factor/disable'
                  ? 'auth.two_factor_disabled'
                  : 'auth.two_factor_enabled',
            });
          },
        },
        create: {
          async after(user) {
            await audit.recordAuthEvent({
              actorUserId: user.id,
              userEmail: user.email,
              action: 'auth.sign_up',
            });
          },
        },
      },
      session: {
        create: {
          async after(session) {
            await audit.recordAuthEvent({
              actorUserId: session.userId,
              action: 'auth.sign_in',
              ip: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            });
          },
        },
        delete: {
          async after(session) {
            await audit.recordAuthEvent({ actorUserId: session.userId, action: 'auth.sign_out' });
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email' || !isAPIError(ctx.context.returned)) return;
        const body = ctx.body as { email?: unknown } | undefined;
        await audit.recordAuthEvent({
          actorUserId: null,
          action: 'auth.sign_in_failed',
          metadata: { email: typeof body?.email === 'string' ? body.email.toLowerCase() : null },
          ip: ctx.request?.headers.get('x-forwarded-for') ?? null,
          userAgent: ctx.request?.headers.get('user-agent') ?? null,
        });
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
