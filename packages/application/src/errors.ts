import type { DomainError } from '@consulpro/domain';

/**
 * Erreur applicative. Le code détermine le statut HTTP (adaptateur) ;
 * `reason` porte le code métier stable (ex. `OWNER_PROTECTED`).
 */
export type AppErrorKind =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'POLICY_VIOLATION'
  | 'PRECONDITION_FAILED'
  | 'GONE';

export interface Issue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface AppError {
  readonly kind: AppErrorKind;
  readonly reason: string;
  readonly message: string;
  /** Détail par champ (ex. entrées d'un calcul refusées). */
  readonly issues?: readonly Issue[];
}

export const appError = (
  kind: AppErrorKind,
  reason: string,
  message: string,
  issues?: readonly Issue[],
): AppError => (issues ? { kind, reason, message, issues } : { kind, reason, message });

export const staleVersion = (): AppError =>
  appError(
    'PRECONDITION_FAILED',
    'VERSION_MISMATCH',
    'Cette ressource a été modifiée entre-temps. Rechargez puis réessayez.',
  );

export const forbidden = (): AppError =>
  appError('FORBIDDEN', 'FORBIDDEN', 'Vous n’avez pas la permission d’effectuer cette action.');

export const notFound = (what: string): AppError =>
  appError('NOT_FOUND', 'NOT_FOUND', `${what} introuvable.`);

export function fromDomain(error: DomainError): AppError {
  if (error.code === 'FORBIDDEN') return appError('FORBIDDEN', error.code, error.message);
  if (error.code.endsWith('_INVALID') || error.code.endsWith('_RESERVED')) {
    return appError('VALIDATION', error.code, error.message);
  }
  return appError('POLICY_VIOLATION', error.code, error.message);
}

/** Relecture après écriture : une absence trahit une incohérence interne (erreur 500). */
export function reread<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`${what} introuvable après écriture`);
  return value;
}
