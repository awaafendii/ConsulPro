import type { OrgRole } from './roles';

/**
 * Matrice RBAC — SOURCE UNIQUE (docs/architecture/12-securite-rbac.md §4).
 * Utilisée par l'autorisation (application), l'affichage conditionnel (UI)
 * et la génération des tests de permissions.
 *
 * ALL : autorisé ; OWN : autorisé sur ses propres objets seulement ; NONE : refusé.
 */
export type Grant = 'ALL' | 'OWN' | 'NONE';

type Row = readonly [
  owner: Grant,
  admin: Grant,
  engineer: Grant,
  technician: Grant,
  collaborator: Grant,
  viewer: Grant,
];

const A = 'ALL';
const O = 'OWN';
const N = 'NONE';

const ROWS = {
  //                              Owner Admin Eng  Tech Collab Viewer
  'org.read': [A, A, A, A, A, A],
  'org.update': [A, A, N, N, N, N],
  'org.delete': [A, N, N, N, N, N],
  'org.transfer': [A, N, N, N, N, N],
  'org.member.manage': [A, A, N, N, N, N],
  'audit.read': [A, A, N, N, N, N],
  'library.read': [A, A, A, A, A, A],
  'library.org.manage': [A, A, N, N, N, N],
  'price.manage': [A, A, A, N, N, N],
  'project.create': [A, A, A, N, N, N],
  'project.read': [A, A, A, A, A, A],
  'project.update': [A, A, A, N, N, N],
  'project.archive': [A, A, A, N, N, N],
  'project.member.manage': [A, A, A, N, N, N],
  'project.parameter.override': [A, A, A, N, N, N],
  'dataset.write': [A, A, A, A, A, N],
  'import.run': [A, A, A, A, A, N],
  'study.manage': [A, A, A, A, N, N],
  'calculation.run': [A, A, A, A, N, N],
  'calculation.validate': [O, O, O, O, N, N],
  'calculation.verify': [A, A, A, N, N, N],
  'boq.manage': [A, A, A, A, N, N],
  'document.upload': [A, A, A, A, A, N],
  'document.delete': [A, A, A, N, O, N],
  'report.generate': [A, A, A, N, N, N],
  'report.read': [A, A, A, A, A, A],
} as const satisfies Record<string, Row>;

export type Permission = keyof typeof ROWS;

export const PERMISSIONS = Object.keys(ROWS) as readonly Permission[];

const COLUMN = {
  OWNER: 0,
  ADMIN: 1,
  ENGINEER: 2,
  TECHNICIAN: 3,
  COLLABORATOR: 4,
  VIEWER: 5,
} as const satisfies Record<OrgRole, 0 | 1 | 2 | 3 | 4 | 5>;

export function grantFor(role: OrgRole, permission: Permission): Grant {
  const row: Row = ROWS[permission];
  return row[COLUMN[role]];
}

/**
 * Le rôle a-t-il la permission ? Pour une permission `OWN`, l'appelant précise
 * si l'acteur est propriétaire de l'objet visé.
 */
export function can(
  role: OrgRole,
  permission: Permission,
  options: { isOwnResource?: boolean } = {},
): boolean {
  const grant = grantFor(role, permission);
  return grant === 'ALL' || (grant === 'OWN' && options.isOwnResource === true);
}
