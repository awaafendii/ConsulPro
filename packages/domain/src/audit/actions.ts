/** Actions auditées (docs/architecture/12-securite-rbac.md §8). Codes stables. */
export const AUDIT_ACTIONS = [
  'auth.sign_up',
  'auth.sign_in',
  'auth.sign_in_failed',
  'auth.sign_out',
  'auth.email_verified',
  'auth.password_reset_requested',
  'auth.password_reset',
  'organization.created',
  'member.role_changed',
  'member.removed',
  'invitation.created',
  'invitation.revoked',
  'invitation.accepted',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
