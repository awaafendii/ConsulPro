import type { AppError, AppErrorKind } from '@consulpro/application';

/** Correspondance erreur applicative → statut HTTP (05-conventions.md §5). */
const STATUS: Readonly<Record<AppErrorKind, number>> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  PRECONDITION_FAILED: 412,
  POLICY_VIOLATION: 422,
};

const TITLES: Readonly<Record<number, string>> = {
  400: 'Requête invalide',
  401: 'Authentification requise',
  403: 'Accès refusé',
  404: 'Ressource introuvable',
  409: 'Conflit',
  410: 'Ressource expirée',
  412: 'Version périmée',
  413: 'Requête trop volumineuse',
  422: 'Règle métier non respectée',
  428: 'Version requise',
  500: 'Erreur interne',
};

export interface FieldIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/** Réponse d'erreur RFC 9457 (`application/problem+json`). */
export function problem(
  status: number,
  code: string,
  detail: string,
  requestId: string,
  errors?: readonly FieldIssue[],
): Response {
  const body = {
    type: `urn:consulpro:problem:${code.toLowerCase().replaceAll('_', '-')}`,
    title: TITLES[status] ?? 'Erreur',
    status,
    detail,
    code,
    requestId,
    ...(errors && errors.length > 0 ? { errors } : {}),
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/problem+json; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  });
}

export function problemFromAppError(error: AppError, requestId: string): Response {
  return problem(STATUS[error.kind], error.reason, error.message, requestId, error.issues);
}
