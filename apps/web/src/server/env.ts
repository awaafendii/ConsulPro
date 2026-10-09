import { z } from 'zod';

/**
 * Variables d'environnement, validées au démarrage : une configuration invalide
 * arrête le serveur immédiatement (12-securite-rbac.md §9).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url().refine((u) => u.startsWith('postgres'), 'URL PostgreSQL attendue'),
  APP_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32, 'Le secret doit comporter au moins 32 caractères'),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(3),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide (voir apps/web/.env.example) :\n${details}`);
  }
  if (
    parsed.data.NODE_ENV === 'production' &&
    parsed.data.BETTER_AUTH_SECRET.startsWith('remplacer')
  ) {
    throw new Error('BETTER_AUTH_SECRET doit être remplacé en production.');
  }
  return parsed.data;
}
