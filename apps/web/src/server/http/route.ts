import { randomUUID } from 'node:crypto';

import type { AppError, Application, OrgContext, UserContext } from '@consulpro/application';
import type { Result } from '@consulpro/calc-core';
import type { Permission } from '@consulpro/domain';
import type { Auth } from '@consulpro/infrastructure';
import type { Logger } from 'pino';
import type { z } from 'zod';

import { problem, problemFromAppError, type FieldIssue } from './problem';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Déclaration d'accès : utilisée par l'adaptateur et par les tests de la matrice RBAC. */
export type Access =
  { readonly kind: 'user' } | { readonly kind: 'organization'; readonly permission: Permission };

export type RawParams = Readonly<Record<string, string | string[] | undefined>>;

export interface RouteDefinition {
  readonly id: string;
  readonly method: Method;
  /** Motif d'URL : `/api/v1/organizations/:orgSlug/members`. */
  readonly path: string;
  readonly access: Access;
  readonly ifMatch: boolean;
  /** `params` vaut `undefined` pour une route sans segment dynamique (comportement de Next.js). */
  handle(request: Request, params: RawParams | undefined): Promise<Response>;
}

export interface ServerDeps {
  readonly app: Application;
  readonly auth: Auth;
  readonly appUrl: string;
  readonly logger: Logger;
}

export interface Reply {
  readonly status: 200 | 201 | 204;
  readonly body?: unknown;
  /** Version de la ressource, renvoyée en ETag. */
  readonly etag?: number;
}

interface Input<C, P, B, Q> {
  readonly ctx: C;
  readonly params: P;
  readonly body: B;
  readonly query: Q;
  /** Version attendue (If-Match), si la route l'exige. */
  readonly version: number;
}

interface Spec<C, P, B, Q> {
  readonly id: string;
  readonly method: Method;
  readonly path: string;
  readonly params?: z.ZodType<P>;
  readonly body?: z.ZodType<B>;
  readonly query?: z.ZodType<Q>;
  readonly ifMatch?: boolean;
  run(input: Input<C, P, B, Q>): Promise<Result<Reply, AppError>>;
}

const MUTATING = new Set<Method>(['POST', 'PATCH', 'DELETE']);
const MAX_BODY_BYTES = 100_000;
const REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;
const IF_MATCH = /^(?:W\/)?"(\d+)"$/;

/** Échec anticipé du traitement d'une requête. */
class Halt extends Error {
  constructor(readonly response: Response) {
    super('halt');
  }
}

function issues(error: z.ZodError, prefix: string): FieldIssue[] {
  return error.issues.map((i) => ({
    path: [prefix, ...i.path.map(String)].filter(Boolean).join('.'),
    code: i.code,
    message: i.message,
  }));
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded ?? request.headers.get('x-real-ip') ?? null;
}

async function readBody(request: Request, requestId: string): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Halt(
      problem(413, 'PAYLOAD_TOO_LARGE', 'Corps de requête trop volumineux.', requestId),
    );
  }
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Halt(
      problem(400, 'MALFORMED_JSON', 'Le corps de la requête n’est pas un JSON valide.', requestId),
    );
  }
}

function parse<T>(
  schema: z.ZodType<T> | undefined,
  value: unknown,
  prefix: string,
  requestId: string,
): T {
  if (!schema) return undefined as T;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Halt(
      problem(400, 'VALIDATION', 'Données invalides.', requestId, issues(parsed.error, prefix)),
    );
  }
  return parsed.data;
}

function single(params: RawParams | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params ?? {}))
    if (typeof value === 'string') out[key] = value;
  return out;
}

function build<C, P, B, Q>(
  deps: ServerDeps,
  spec: Spec<C, P, B, Q>,
  access: Access,
  resolve: (user: UserContext, params: Record<string, string>, requestId: string) => Promise<C>,
): RouteDefinition {
  const ifMatch = spec.ifMatch ?? false;
  return {
    id: spec.id,
    method: spec.method,
    path: spec.path,
    access,
    ifMatch,
    async handle(request, rawParams) {
      const supplied = request.headers.get('x-request-id');
      const requestId = supplied && REQUEST_ID.test(supplied) ? supplied : randomUUID();
      try {
        // Anti-CSRF : toute requête mutante doit venir de l'application elle-même.
        if (
          MUTATING.has(spec.method) &&
          request.headers.get('origin') !== new URL(deps.appUrl).origin
        ) {
          return problem(403, 'ORIGIN_REJECTED', 'Origine de la requête non autorisée.', requestId);
        }
        const session = await deps.auth.api.getSession({ headers: request.headers });
        if (!session) return problem(401, 'UNAUTHENTICATED', 'Veuillez vous connecter.', requestId);

        const user: UserContext = {
          actor: {
            userId: session.user.id,
            email: session.user.email,
            name: session.user.name,
            emailVerified: session.user.emailVerified,
          },
          meta: { requestId, ip: clientIp(request), userAgent: request.headers.get('user-agent') },
        };
        const params = single(rawParams);
        const ctx = await resolve(user, params, requestId);

        // Un identifiant mal formé ne peut désigner aucune ressource : 404.
        let typedParams: P = undefined as P;
        if (spec.params) {
          const parsed = spec.params.safeParse(params);
          if (!parsed.success)
            return problem(404, 'NOT_FOUND', 'Ressource introuvable.', requestId);
          typedParams = parsed.data;
        }
        const query = parse(
          spec.query,
          Object.fromEntries(new URL(request.url).searchParams),
          'query',
          requestId,
        );
        const body = spec.body
          ? parse(spec.body, await readBody(request, requestId), 'body', requestId)
          : (undefined as B);

        let version = 0;
        if (ifMatch) {
          const header = request.headers.get('if-match');
          if (!header) {
            return problem(
              428,
              'PRECONDITION_REQUIRED',
              'En-tête If-Match obligatoire (version de la ressource).',
              requestId,
            );
          }
          const match = IF_MATCH.exec(header.trim());
          if (!match)
            return problem(400, 'IF_MATCH_INVALID', 'En-tête If-Match invalide.', requestId);
          version = Number(match[1]);
        }

        const result = await spec.run({ ctx, params: typedParams, body, query, version });
        if (!result.ok) return problemFromAppError(result.error, requestId);

        const { status, body: payload, etag } = result.value;
        const headers: Record<string, string> = {
          'cache-control': 'no-store',
          'x-request-id': requestId,
        };
        if (etag !== undefined) headers.etag = `"${etag}"`;
        if (status === 204) return new Response(null, { status, headers });
        headers['content-type'] = 'application/json; charset=utf-8';
        return new Response(JSON.stringify(payload), { status, headers });
      } catch (error) {
        if (error instanceof Halt) return error.response;
        deps.logger.error({ err: error, requestId, route: spec.id }, 'Erreur non gérée');
        return problem(500, 'INTERNAL_ERROR', 'Une erreur interne est survenue.', requestId);
      }
    },
  };
}

/** Route accessible à tout utilisateur authentifié. */
export function userRoute<P, B, Q>(
  deps: ServerDeps,
  spec: Spec<UserContext, P, B, Q>,
): RouteDefinition {
  return build(deps, spec, { kind: 'user' }, (user) => Promise.resolve(user));
}

/**
 * Route d'organisation : le contexte (organisation, rôle) est résolu côté serveur
 * depuis `:orgSlug` ; un non-membre reçoit 404. La permission déclarée documente
 * l'accès et alimente les tests ; le contrôle qui fait foi est dans l'application.
 */
export function orgRoute<P, B, Q>(
  deps: ServerDeps,
  permission: Permission,
  spec: Spec<OrgContext, P, B, Q>,
): RouteDefinition {
  return build(
    deps,
    spec,
    { kind: 'organization', permission },
    async (user, params, requestId) => {
      const resolved = await deps.app.organizations.resolveContext(user, params.orgSlug ?? '');
      if (!resolved.ok) throw new Halt(problemFromAppError(resolved.error, requestId));
      return resolved.value;
    },
  );
}
