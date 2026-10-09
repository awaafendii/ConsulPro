import { describe, expect, it } from 'vitest';

import { ORG_ROLES, type OrgRole } from '../access/roles';
import {
  checkInvitation,
  checkRemoval,
  checkRoleChange,
  type MemberChange,
} from '../organization/membership-policy';
import { validateNewOrganization } from '../organization/organization';

describe('validateNewOrganization', () => {
  it('accepte et nettoie un nom et un identifiant valides', () => {
    expect(validateNewOrganization({ name: '  BET Sahel  ', slug: 'bet-sahel' })).toEqual({
      ok: true,
      value: { name: 'BET Sahel', slug: 'bet-sahel' },
    });
  });

  it.each([
    ['nom trop court', { name: 'A', slug: 'abc' }, 'ORGANIZATION_NAME_INVALID'],
    ['nom trop long', { name: 'x'.repeat(121), slug: 'abc' }, 'ORGANIZATION_NAME_INVALID'],
    ['identifiant trop court', { name: 'BET', slug: 'ab' }, 'ORGANIZATION_SLUG_INVALID'],
    ['majuscules', { name: 'BET', slug: 'Bet-Sahel' }, 'ORGANIZATION_SLUG_INVALID'],
    ['tiret final', { name: 'BET', slug: 'bet-' }, 'ORGANIZATION_SLUG_INVALID'],
    ['accents', { name: 'BET', slug: 'bét' }, 'ORGANIZATION_SLUG_INVALID'],
    ['trop long', { name: 'BET', slug: 'a'.repeat(49) }, 'ORGANIZATION_SLUG_INVALID'],
    ['réservé', { name: 'BET', slug: 'api' }, 'ORGANIZATION_SLUG_RESERVED'],
  ])('refuse : %s', (_label, input, code) => {
    const r = validateNewOrganization(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(code);
  });
});

const change = (actorRole: OrgRole, targetRole: OrgRole, self = false): MemberChange => ({
  actorRole,
  actorUserId: 'actor',
  targetUserId: self ? 'actor' : 'target',
  targetRole,
});

const codeOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'OK' : r.error?.code);

describe('changement de rôle', () => {
  it('Owner et Admin modifient les rôles non propriétaires', () => {
    expect(codeOf(checkRoleChange(change('OWNER', 'ENGINEER'), 'ADMIN'))).toBe('OK');
    expect(codeOf(checkRoleChange(change('ADMIN', 'ADMIN'), 'VIEWER'))).toBe('OK');
  });

  it('les autres rôles ne gèrent pas les membres', () => {
    for (const role of ['ENGINEER', 'TECHNICIAN', 'COLLABORATOR', 'VIEWER'] as const) {
      expect(codeOf(checkRoleChange(change(role, 'VIEWER'), 'TECHNICIAN'))).toBe('FORBIDDEN');
    }
  });

  it('protège le propriétaire, interdit l’attribution de OWNER et l’auto-modification', () => {
    expect(codeOf(checkRoleChange(change('ADMIN', 'OWNER'), 'ADMIN'))).toBe('OWNER_PROTECTED');
    expect(codeOf(checkRoleChange(change('OWNER', 'ADMIN'), 'OWNER'))).toBe('ROLE_NOT_ASSIGNABLE');
    expect(codeOf(checkRoleChange(change('ADMIN', 'ADMIN', true), 'VIEWER'))).toBe(
      'SELF_ROLE_CHANGE',
    );
  });
});

describe('retrait d’un membre', () => {
  it('règles de retrait', () => {
    expect(codeOf(checkRemoval(change('ADMIN', 'ENGINEER')))).toBe('OK');
    expect(codeOf(checkRemoval(change('ENGINEER', 'VIEWER')))).toBe('FORBIDDEN');
    expect(codeOf(checkRemoval(change('ADMIN', 'OWNER')))).toBe('OWNER_PROTECTED');
    expect(codeOf(checkRemoval(change('OWNER', 'OWNER', true)))).toBe('SELF_REMOVAL');
  });
});

describe('invitation', () => {
  it('seuls Owner et Admin invitent, jamais en tant que OWNER', () => {
    for (const role of ORG_ROLES) {
      const expected = role === 'OWNER' || role === 'ADMIN' ? 'OK' : 'FORBIDDEN';
      expect(codeOf(checkInvitation(role, 'TECHNICIAN')), role).toBe(expected);
    }
    expect(codeOf(checkInvitation('OWNER', 'OWNER'))).toBe('ROLE_NOT_ASSIGNABLE');
  });
});
