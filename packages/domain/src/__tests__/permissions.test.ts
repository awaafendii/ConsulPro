import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { can, grantFor, PERMISSIONS, type Grant, type Permission } from '../access/permissions';
import { isOrgRole, ORG_ROLES, roleRank } from '../access/roles';

const DOC = fileURLToPath(
  new URL('../../../../docs/architecture/12-securite-rbac.md', import.meta.url),
);

/** Lit la matrice du document d'architecture : `permission → grants dans l'ordre des rôles`. */
function matrixFromDocumentation(): Map<string, Grant[]> {
  const symbol: Record<string, Grant> = { '●': 'ALL', '○': 'OWN', '—': 'NONE' };
  const rows = new Map<string, Grant[]>();
  for (const line of readFileSync(DOC, 'utf8').split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const grants = cells.slice(2, 8);
    if (cells.length < 9 || !grants.every((g) => g in symbol)) continue;
    const names = [...(cells[1] ?? '').matchAll(/`([a-z.]+)`/g)].map((m) => m[1] ?? '');
    for (const name of names)
      rows.set(
        name,
        grants.map((g) => symbol[g] ?? 'NONE'),
      );
  }
  return rows;
}

describe('matrice RBAC', () => {
  it('est identique au tableau de docs/architecture/12-securite-rbac.md', () => {
    const documented = matrixFromDocumentation();
    expect([...documented.keys()].sort()).toEqual([...PERMISSIONS].sort());
    for (const permission of PERMISSIONS) {
      expect(
        ORG_ROLES.map((role) => grantFor(role, permission)),
        permission,
      ).toEqual(documented.get(permission));
    }
  });

  it('OWNER dispose de toutes les permissions (OWN pour la validation de ses propres calculs)', () => {
    for (const permission of PERMISSIONS) {
      expect(can('OWNER', permission, { isOwnResource: true }), permission).toBe(true);
    }
  });

  it('VIEWER ne dispose que de permissions de lecture', () => {
    const allowed = PERMISSIONS.filter((p) => can('VIEWER', p, { isOwnResource: true }));
    expect(allowed.every((p) => p.endsWith('.read'))).toBe(true);
  });

  it('OWN exige la propriété de l’objet', () => {
    const p: Permission = 'calculation.validate';
    expect(can('TECHNICIAN', p)).toBe(false);
    expect(can('TECHNICIAN', p, { isOwnResource: false })).toBe(false);
    expect(can('TECHNICIAN', p, { isOwnResource: true })).toBe(true);
    expect(can('COLLABORATOR', p, { isOwnResource: true })).toBe(false);
  });

  it('seul un rôle autorisé vérifie un calcul (principe des quatre yeux côté rôle)', () => {
    expect(ORG_ROLES.filter((r) => can(r, 'calculation.verify'))).toEqual([
      'OWNER',
      'ADMIN',
      'ENGINEER',
    ]);
  });
});

describe('rôles', () => {
  it('ordre et reconnaissance', () => {
    expect(roleRank('OWNER')).toBe(0);
    expect(roleRank('VIEWER')).toBe(5);
    expect(isOrgRole('ENGINEER')).toBe(true);
    expect(isOrgRole('SUPERUSER')).toBe(false);
  });
});
