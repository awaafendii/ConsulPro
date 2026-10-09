/** Violation d'une règle métier. Le code est stable ; le message est destiné à l'utilisateur. */
export interface DomainError {
  readonly code: string;
  readonly message: string;
}
