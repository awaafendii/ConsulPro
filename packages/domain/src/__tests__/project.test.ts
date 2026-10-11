import { describe, expect, it } from 'vitest';

import { ORG_ROLES } from '../access/roles';
import { checkOwnershipTransfer } from '../organization/membership-policy';
import {
  asProjectRole,
  checkProjectRole,
  checkProjectWritable,
  effectiveProjectRole,
  PROJECT_ROLES,
  validateProject,
} from '../project/project';

const base = {
  code: 'imm-r3-2026',
  name: '  Immeuble R+3 — Dakar ',
  disciplines: ['BTP', 'ELEC', 'BTP'] as const,
};

describe('validation d’un projet', () => {
  it('normalise le code, le nom, les champs facultatifs et dédoublonne les métiers', () => {
    expect(validateProject({ ...base, client: '  ', location: ' Dakar ' })).toEqual({
      ok: true,
      value: {
        code: 'IMM-R3-2026',
        name: 'Immeuble R+3 — Dakar',
        description: undefined,
        client: undefined,
        location: 'Dakar',
        startDate: undefined,
        endDate: undefined,
        disciplines: ['BTP', 'ELEC'],
      },
    });
  });

  it.each([
    ['code trop court', { ...base, code: 'A' }, 'PROJECT_CODE_INVALID'],
    ['code avec espace', { ...base, code: 'IMM R3' }, 'PROJECT_CODE_INVALID'],
    ['code trop long', { ...base, code: 'A'.repeat(25) }, 'PROJECT_CODE_INVALID'],
    ['nom trop court', { ...base, name: 'X' }, 'PROJECT_NAME_INVALID'],
    [
      'dates inversées',
      { ...base, startDate: '2026-12-01', endDate: '2026-01-01' },
      'PROJECT_DATES_INVALID',
    ],
    ['aucun métier', { ...base, disciplines: [] }, 'PROJECT_DISCIPLINES_INVALID'],
  ])('refuse : %s', (_label, input, code) => {
    const r = validateProject(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(code);
  });

  it('accepte des dates dans l’ordre', () => {
    expect(validateProject({ ...base, startDate: '2026-01-01', endDate: '2026-12-31' }).ok).toBe(
      true,
    );
  });
});

describe('rôle effectif sur un projet', () => {
  it('Owner et Admin : accès à tout projet, avec leur rôle, même sans adhésion', () => {
    expect(effectiveProjectRole('OWNER', null)).toBe('OWNER');
    expect(effectiveProjectRole('ADMIN', 'VIEWER')).toBe('ADMIN');
  });

  it('autres rôles : membre requis ; le plus restrictif l’emporte', () => {
    expect(effectiveProjectRole('ENGINEER', null)).toBeNull();
    expect(effectiveProjectRole('ENGINEER', 'VIEWER')).toBe('VIEWER');
    expect(effectiveProjectRole('TECHNICIAN', 'ENGINEER')).toBe('TECHNICIAN');
    expect(effectiveProjectRole('VIEWER', 'VIEWER')).toBe('VIEWER');
  });

  it('propriété : le rôle effectif n’est jamais plus étendu que les deux rôles', () => {
    for (const org of ORG_ROLES.filter((r) => r !== 'OWNER' && r !== 'ADMIN')) {
      for (const project of PROJECT_ROLES) {
        const effective = effectiveProjectRole(org, project);
        expect([org, project]).toContain(effective);
        expect(ORG_ROLES.indexOf(effective ?? 'OWNER')).toBeGreaterThanOrEqual(
          ORG_ROLES.indexOf(org),
        );
      }
    }
  });

  it('un rôle de projet ne dépasse pas le rôle d’organisation', () => {
    expect(checkProjectRole('TECHNICIAN', 'ENGINEER')).toMatchObject({
      ok: false,
      error: { code: 'PROJECT_ROLE_ABOVE_ORG_ROLE' },
    });
    expect(checkProjectRole('ENGINEER', 'TECHNICIAN').ok).toBe(true);
    expect(checkProjectRole('ADMIN', 'ENGINEER')).toMatchObject({
      ok: false,
      error: { code: 'PROJECT_MEMBER_NOT_NEEDED' },
    });
    expect(asProjectRole('OWNER')).toBeNull();
    expect(asProjectRole('TECHNICIAN')).toBe('TECHNICIAN');
  });

  it('projet archivé : lecture seule', () => {
    expect(checkProjectWritable('ARCHIVED')).toMatchObject({
      ok: false,
      error: { code: 'PROJECT_ARCHIVED' },
    });
    expect(checkProjectWritable('ACTIVE').ok).toBe(true);
  });
});

describe('transfert de propriété', () => {
  const change = (actorRole: 'OWNER' | 'ADMIN', target = 'u2') => ({
    actorRole,
    actorUserId: 'u1',
    targetUserId: target,
    targetRole: 'ENGINEER' as const,
  });
  it('réservé au propriétaire, vers un autre membre', () => {
    expect(checkOwnershipTransfer(change('OWNER')).ok).toBe(true);
    expect(checkOwnershipTransfer(change('ADMIN'))).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(checkOwnershipTransfer(change('OWNER', 'u1'))).toMatchObject({
      ok: false,
      error: { code: 'SELF_TRANSFER' },
    });
  });
});
