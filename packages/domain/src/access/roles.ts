/** Rôles d'organisation, du plus étendu au plus restreint. */
export const ORG_ROLES = [
  'OWNER',
  'ADMIN',
  'ENGINEER',
  'TECHNICIAN',
  'COLLABORATOR',
  'VIEWER',
] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

/** Rang : 0 = le plus étendu. Sert à déterminer le rôle le plus restrictif. */
export function roleRank(role: OrgRole): number {
  return ORG_ROLES.indexOf(role);
}

export function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Readonly<Record<OrgRole, string>> = {
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  ENGINEER: 'Ingénieur',
  TECHNICIAN: 'Technicien',
  COLLABORATOR: 'Collaborateur',
  VIEWER: 'Lecteur',
};
