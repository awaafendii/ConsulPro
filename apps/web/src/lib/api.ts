import type { Problem } from '@consulpro/contracts';

export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
  }
}

/**
 * Appel de l'API v1 depuis le navigateur. Les erreurs RFC 9457 deviennent des `ApiError`
 * dont le message est destiné à l'utilisateur.
 */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers: extra, ...rest } = init;
  const headers = new Headers(extra);
  if (json !== undefined) headers.set('content-type', 'application/json');
  const response = await fetch(`/api/v1${path}`, {
    ...rest,
    headers,
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Problem | null;
    throw new ApiError(
      body ?? {
        type: 'about:blank',
        title: 'Erreur',
        status: response.status,
        code: 'UNKNOWN',
        detail: 'Erreur inattendue.',
      },
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** N'accepte qu'un chemin interne : empêche les redirections ouvertes. */
export function safeRedirect(
  target: string | null | undefined,
  fallback = '/organisations',
): string {
  return target?.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
    ? target
    : fallback;
}
