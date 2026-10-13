import { describe, expect, it } from 'vitest';

import type { ResolvedParameter } from '../params/parameter';
import { ParameterAccessError, ResolvedParameterSet } from '../params/resolved-parameter-set';
import { param } from './fixtures';

function build(parameters: readonly ResolvedParameter[]): ResolvedParameterSet {
  const r = ResolvedParameterSet.create(parameters);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

const table = {
  axes: [
    {
      name: 'x',
      kind: 'NUMERIC' as const,
      unit: 'm' as const,
      values: [0, 1],
      lookup: 'LINEAR' as const,
    },
  ],
  unit: 'A' as const,
  cells: [0, 10],
};

describe('ResolvedParameterSet.create', () => {
  it('refuse les doublons et les paramètres invalides', () => {
    const r = ResolvedParameterSet.create([
      param({ key: 'a', value: 1 }),
      param({ key: 'a', value: 2 }),
      param({ key: 'b', source: { document: '  ' } }),
      param({ key: 'c', value: Number.NaN }),
      param({ key: 'd', unit: 'zz' as never }),
      {
        key: 'e',
        kind: 'ENUM',
        value: 'X',
        allowed: ['A'],
        source: { document: 'doc' },
        verification: 'VERIFIED',
      },
      {
        key: 'f',
        kind: 'TABLE',
        table: { ...table, cells: [1] },
        source: { document: 'doc' },
        verification: 'VERIFIED',
      },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.map((e) => `${e.key}:${e.code}`)).toEqual([
        'a:PARAMETER_DUPLICATE',
        'b:PARAMETER_INVALID',
        'c:PARAMETER_INVALID',
        'd:PARAMETER_INVALID',
        'e:PARAMETER_INVALID',
        'f:PARAMETER_INVALID',
      ]);
      expect(r.error[1]?.message).toContain('Source documentaire obligatoire');
    }
  });

  it('accepte scalaires, énumérations et tables valides', () => {
    const set = build([
      param({ key: 's', value: 1 }),
      {
        key: 'e',
        kind: 'ENUM',
        value: 'A',
        allowed: ['A', 'B'],
        source: { document: 'doc' },
        verification: 'VERIFIED',
      },
      { key: 't', kind: 'TABLE', table, source: { document: 'doc' }, verification: 'TO_VERIFY' },
    ]);
    expect(set.get('e')?.kind).toBe('ENUM');
    expect(set.standards).toEqual([]);
  });
});

describe('checkRequirements', () => {
  const set = build([
    param({ key: 'len', value: 3, unit: 'm' }),
    {
      key: 'mode',
      kind: 'ENUM',
      value: 'A',
      allowed: ['A'],
      source: { document: 'doc' },
      verification: 'VERIFIED',
    },
    { key: 'tab', kind: 'TABLE', table, source: { document: 'doc' }, verification: 'VERIFIED' },
  ]);

  it('ne signale rien quand tout est conforme', () => {
    expect(
      set.checkRequirements([
        { key: 'len', kind: 'SCALAR', unitKind: 'length', description: 'l' },
        { key: 'mode', kind: 'ENUM', description: 'm' },
        { key: 'tab', kind: 'TABLE', unitKind: 'current', description: 't' },
        { key: 'opt', kind: 'SCALAR', optional: true, description: 'o' },
      ]),
    ).toEqual([]);
  });

  it('signale absence, mauvais type et grandeur incompatible', () => {
    const errors = set.checkRequirements([
      { key: 'missing', kind: 'SCALAR', description: 'Coefficient X' },
      { key: 'len', kind: 'TABLE', description: 'l' },
      { key: 'len', kind: 'SCALAR', unitKind: 'mass', description: 'l' },
      { key: 'tab', kind: 'TABLE', unitKind: 'voltage', description: 't' },
      { key: 'mode', kind: 'ENUM', unitKind: 'length', description: 'm' },
    ]);
    expect(errors.map((e) => e.code)).toEqual([
      'PARAMETER_MISSING',
      'PARAMETER_KIND_MISMATCH',
      'PARAMETER_UNIT_INCOMPATIBLE',
      'PARAMETER_UNIT_INCOMPATIBLE',
      'PARAMETER_UNIT_INCOMPATIBLE',
    ]);
    expect(errors[0]?.message).toContain('Coefficient X');
    expect(errors[4]?.message).toContain('absente');
  });
});

describe('ParameterReader', () => {
  const set = build([
    param({ key: 'len', value: 2500, unit: 'mm' }),
    param({ key: 'unused', value: 1 }),
    {
      key: 'mode',
      kind: 'ENUM',
      value: 'B',
      allowed: ['A', 'B'],
      source: { document: 'doc' },
      verification: 'VERIFIED',
    },
    { key: 'tab', kind: 'TABLE', table, source: { document: 'doc' }, verification: 'VERIFIED' },
  ]);
  const reader = () =>
    set.scopedTo([
      { key: 'len', kind: 'SCALAR', description: '' },
      { key: 'mode', kind: 'ENUM', description: '' },
      { key: 'tab', kind: 'TABLE', description: '' },
      { key: 'opt', kind: 'SCALAR', optional: true, description: '' },
    ]);

  it('convertit les scalaires dans l’unité demandée et trace les lectures', () => {
    const r = reader();
    expect(r.scalar('len', 'm')).toBeCloseTo(2.5, 12);
    expect(r.enumValue('mode')).toBe('B');
    const reading = r.table('tab', { x: 0.5 });
    expect(reading.ok && reading.value.value).toBeCloseTo(5, 12);
    expect(r.usedKeys()).toEqual(['len', 'mode', 'tab']);
  });

  it('refuse les lectures non déclarées, de mauvais type ou d’unité incompatible', () => {
    const r = reader();
    expect(() => r.scalar('unused', '1')).toThrow(ParameterAccessError);
    expect(() => r.scalar('len', 'kg')).toThrow(/ne peut pas être lu/);
    expect(() => r.scalar('mode', '1')).toThrow(/n'est pas un scalaire/);
    expect(() => r.enumValue('len')).toThrow(/n'est pas une énumération/);
    expect(() => r.table('len', {})).toThrow(/n'est pas une table/);
    expect(() => r.scalar('opt', 'm')).toThrow(/absent/);
  });

  it('lit les valeurs d’un axe numérique dans l’unité demandée', () => {
    const r = reader();
    expect(r.axisValues('tab', 'x', 'cm')).toEqual([0, 100]);
    expect(r.usedKeys()).toEqual(['tab']);
    expect(() => r.axisValues('tab', 'y', 'm')).toThrow(/axe numérique/);
    expect(() => r.axisValues('tab', 'x', 'kg')).toThrow(/ne peut pas être lu/);
    expect(() => r.axisValues('len', 'x', 'm')).toThrow(/n'est pas une table/);
  });

  it('has() ne voit que les paramètres déclarés et présents', () => {
    const r = reader();
    expect(r.has('len')).toBe(true);
    expect(r.has('opt')).toBe(false);
    expect(r.has('unused')).toBe(false);
  });
});
