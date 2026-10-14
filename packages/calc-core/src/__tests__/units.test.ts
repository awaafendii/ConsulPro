import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { quantity } from '../units/quantity';
import {
  convert,
  findUnit,
  fromSI,
  isUnitSymbol,
  toSI,
  UNITS,
  unitsOfKind,
  type UnitSymbol,
} from '../units/registry';

describe('registre des unités', () => {
  it('chaque grandeur a exactement une unité SI (facteur 1, décalage 0)', () => {
    const kinds = new Set(Object.values(UNITS).map((u) => u.kind));
    for (const kind of kinds) {
      const si = unitsOfKind(kind).filter((u) => u.factor === 1 && u.offset === 0);
      expect(si, kind).toHaveLength(1);
    }
  });

  it('convertit les unités usuelles', () => {
    expect(toSI(2.5, 'mm2')).toBeCloseTo(2.5e-6, 15);
    expect(toSI(200, 'gon')).toBeCloseTo(Math.PI, 15);
    expect(toSI(180, 'deg')).toBeCloseTo(Math.PI, 15);
    expect(toSI(1, 'bar')).toBe(1e5);
    expect(toSI(1, 'mCE')).toBe(9806.65);
    expect(toSI(36, 'm3/h')).toBeCloseTo(0.01, 15);
    expect(toSI(30, 'degC')).toBeCloseTo(303.15, 12);
    expect(fromSI(303.15, 'degC')).toBeCloseTo(30, 12);
    expect(toSI(0.0225, 'ohm.mm2/m')).toBeCloseTo(2.25e-8, 20);
  });

  it('convert() refuse les grandeurs différentes et les unités inconnues', () => {
    expect(convert(1, 'm', 'kg')).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'UNIT_INCOMPATIBLE' }) as unknown,
    });
    expect(convert(1, 'furlong', 'm')).toMatchObject({
      ok: false,
      error: { code: 'UNIT_UNKNOWN', message: expect.stringContaining('furlong') as unknown },
    });
    expect(convert(1, 'm', 'furlong')).toMatchObject({
      ok: false,
      error: { code: 'UNIT_UNKNOWN', message: expect.stringContaining('furlong') as unknown },
    });
    expect(convert(100, 'gon', 'deg')).toMatchObject({ ok: true });
    const r = convert(100, 'gon', 'deg');
    expect(r.ok && r.value).toBeCloseTo(90, 12);
  });

  it('le message d’incompatibilité utilise le symbole si l’affichage est vide', () => {
    const r = convert(1, '1', 'm');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('1 (dimensionless)');
  });

  it('identifie les symboles connus', () => {
    expect(isUnitSymbol('kVA')).toBe(true);
    expect(isUnitSymbol('toString')).toBe(false);
    expect(findUnit('kVA')?.kind).toBe('apparentPower');
    expect(findUnit('inconnue')).toBeUndefined();
  });

  it('propriété : aller-retour SI sans dérive pour toute unité', () => {
    const symbols = Object.keys(UNITS) as UnitSymbol[];
    fc.assert(
      fc.property(
        fc.constantFrom(...symbols),
        fc.double({ min: -1e6, max: 1e6, noNaN: true }),
        (symbol, value) => {
          const back = fromSI(toSI(value, symbol), symbol);
          expect(Math.abs(back - value)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(value)));
        },
      ),
    );
  });

  it('propriété : gon → rad → gon et deg → gon cohérents', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 400, noNaN: true }), (gon) => {
        const r = convert(gon, 'gon', 'deg');
        expect(r.ok && r.value).toBeCloseTo(gon * 0.9, 9);
      }),
    );
  });
});

describe('schéma quantity()', () => {
  const length = quantity('length', { min: 0, exclusiveMin: true, max: 10_000 });

  it('accepte une grandeur compatible et calcule la valeur SI', () => {
    expect(length.parse({ value: 2500, unit: 'mm' })).toEqual({ value: 2500, unit: 'mm', si: 2.5 });
  });

  it('refuse une unité d’une autre grandeur', () => {
    const r = length.safeParse({ value: 2, unit: 'kg' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({
      path: ['unit'],
      params: { code: 'UNIT_INCOMPATIBLE' },
    });
  });

  it('refuse une unité inconnue', () => {
    expect(length.safeParse({ value: 2, unit: 'pied' }).success).toBe(false);
  });

  it('applique les bornes en SI (exclusives et inclusives)', () => {
    expect(length.safeParse({ value: 0, unit: 'm' }).error?.issues[0]).toMatchObject({
      path: ['value'],
      params: { code: 'OUT_OF_RANGE' },
    });
    expect(length.safeParse({ value: 10, unit: 'km' }).success).toBe(true);
    expect(length.safeParse({ value: 10.001, unit: 'km' }).success).toBe(false);
    const strict = quantity('length', { max: 1, exclusiveMax: true });
    expect(strict.safeParse({ value: 1, unit: 'm' }).success).toBe(false);
    expect(strict.safeParse({ value: 999, unit: 'mm' }).success).toBe(true);
    const inclusiveMin = quantity('length', { min: 1 });
    expect(inclusiveMin.safeParse({ value: 1, unit: 'm' }).success).toBe(true);
    expect(inclusiveMin.safeParse({ value: 0.5, unit: 'm' }).error?.issues[0]?.message).toContain(
      '≥ 1',
    );
  });

  it('refuse les valeurs non finies', () => {
    expect(
      quantity('length').safeParse({ value: Number.POSITIVE_INFINITY, unit: 'm' }).success,
    ).toBe(false);
    expect(quantity('length').safeParse({ value: Number.NaN, unit: 'm' }).success).toBe(false);
  });

  it('sans bornes, accepte toute valeur finie', () => {
    expect(quantity('temperature').parse({ value: -10, unit: 'degC' }).si).toBeCloseTo(263.15, 12);
  });
});

describe('unités du métré (Phase 4)', () => {
  it('rendement, masse surfacique et masse linéique', () => {
    expect(toSI(10, 'm2/L')).toBe(10_000);
    expect(toSI(5, 'kg/m2')).toBe(5);
    expect(toSI(0.617, 'kg/m')).toBe(0.617);
  });
});

describe('unités de la plomberie (Phase 6)', () => {
  it('débits journaliers, année, viscosité, chaleur massique, gradient, Strickler', () => {
    expect(toSI(86_400, 'L/d')).toBeCloseTo(1e-3, 15);
    expect(toSI(1, 'a')).toBe(365 * 86_400);
    const daily = convert(365, 'L/a', 'L/d');
    expect(daily.ok && daily.value).toBeCloseTo(1, 12);
    expect(toSI(3.6, 'mm/h')).toBeCloseTo(1e-6, 18);
    expect(toSI(1.004, 'mm2/s')).toBeCloseTo(1.004e-6, 18);
    expect(toSI(4.18, 'kJ/kgK')).toBeCloseTo(4180, 9);
    expect(toSI(0.2, 'kPa/m')).toBeCloseTo(200, 12);
    expect(findUnit('m1/3/s')?.kind).toBe('strickler');
  });
});
