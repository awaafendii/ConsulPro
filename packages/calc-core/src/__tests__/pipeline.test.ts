import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { canonicalJson } from '../canonical';
import { ResolvedParameterSet } from '../params/resolved-parameter-set';
import { run } from '../pipeline/run';
import { param, slabParams, testSlabEngine } from './fixtures';

const input = (overrides: Record<string, unknown> = {}) => ({
  length: { value: 10, unit: 'm' },
  width: { value: 4000, unit: 'mm' },
  thickness: { value: 20, unit: 'cm' },
  ...overrides,
});

describe('pipeline run()', () => {
  it('OK : entrées, paramètres, hypothèses, résultat, vérifications et trace', () => {
    const r = run(testSlabEngine, input(), slabParams());
    expect(r.status).toBe('OK');
    expect(r.engine).toEqual({ id: 'test.slab-volume', version: '1.0.0' });
    expect(r.standards).toEqual([{ standardVersionId: 'sv-test', code: 'TEST', version: '1' }]);
    expect(r.outputs?.areaM2).toBeCloseTo(40, 12);
    expect(r.outputs?.volumeM3).toBeCloseTo(8, 12);
    expect(r.outputs?.volumeWithWasteM3).toBeCloseTo(8.4, 12);
    expect(r.inputs).toMatchObject({ width: { value: 4000, unit: 'mm', si: 4 } });
    expect(r.hypotheses).toEqual([
      { code: 'TEST.RECTANGULAR', text: expect.any(String) as unknown, origin: 'ENGINE' },
    ]);
    expect(r.checks.map((c) => `${c.rule}:${c.status}`)).toEqual([
      'test.max-area:PASS',
      'test.min-volume:PASS',
    ]);
    expect(r.trace).toHaveLength(1);
    expect(r.parameters.map((p) => [p.key, p.used])).toEqual([
      ['test.max_area', true],
      ['test.waste', true],
    ]);
    expect(r.errors).toEqual([]);
    expect(r.failure).toBeNull();
  });

  it('valeur par défaut ⇒ hypothèse visible (principe P4)', () => {
    const r = run(testSlabEngine, input({ width: undefined }), slabParams());
    expect(r.hypotheses).toContainEqual(
      expect.objectContaining({ code: 'DEFAULT.width', origin: 'DEFAULT_VALUE', field: 'width' }),
    );
  });

  it('paramètre TO_VERIFY utilisé ⇒ avertissement et OK_WITH_WARNINGS', () => {
    const set = ResolvedParameterSet.create([
      param({
        key: 'test.waste',
        value: 5,
        unit: '%',
        verification: 'TO_VERIFY',
        source: { document: 'Doc', clause: '§2', table: 'T1' },
      }),
      param({ key: 'test.max_area', value: 500, unit: 'm2' }),
    ]);
    if (!set.ok) throw new Error();
    const r = run(testSlabEngine, input(), set.value);
    expect(r.status).toBe('OK_WITH_WARNINGS');
    expect(r.warnings).toEqual([
      expect.objectContaining({
        code: 'PARAMETER_TO_VERIFY',
        parameterKey: 'test.waste',
        text: expect.stringContaining('Doc, §2, T1') as unknown,
      }),
    ]);
  });

  it('paramètre surchargé ⇒ avertissement avec justification', () => {
    const set = ResolvedParameterSet.create([
      param({
        key: 'test.waste',
        value: 8,
        unit: '%',
        override: {
          referenceValue: { kind: 'SCALAR', value: 5, unit: '%' },
          justification: 'Exigence MOA',
          scope: 'PROJECT',
        },
      }),
      param({
        key: 'test.max_area',
        value: 500,
        unit: 'm2',
        override: {
          referenceValue: { kind: 'SCALAR', value: 400, unit: 'm2' },
          justification: 'Choix BE',
          scope: 'ORGANIZATION',
        },
      }),
    ]);
    if (!set.ok) throw new Error();
    const r = run(testSlabEngine, input(), set.value);
    expect(r.warnings.map((w) => w.text)).toEqual([
      expect.stringContaining('(organisation) : Choix BE'),
      expect.stringContaining('(projet) : Exigence MOA'),
    ]);
    expect(r.parameters.find((p) => p.key === 'test.waste')?.override?.justification).toBe(
      'Exigence MOA',
    );
  });

  it('avertissement du moteur ⇒ OK_WITH_WARNINGS', () => {
    const r = run(testSlabEngine, input({ length: { value: 300, unit: 'm' } }), slabParams([]));
    expect(r.warnings.map((w) => w.code)).toContain('TEST.LARGE');
  });

  it('vérification bloquante en échec ⇒ NON_COMPLIANT (le résultat reste visible)', () => {
    const r = run(testSlabEngine, input({ length: { value: 200, unit: 'm' } }), slabParams());
    expect(r.status).toBe('NON_COMPLIANT');
    expect(r.outputs).not.toBeNull();
    expect(r.checks[0]).toMatchObject({ status: 'FAIL', measured: 800, limit: 500 });
  });

  it('vérification non bloquante en échec ⇒ OK_WITH_WARNINGS', () => {
    const r = run(
      testSlabEngine,
      input({ length: { value: 1, unit: 'm' }, width: { value: 1, unit: 'm' } }),
      slabParams(),
    );
    expect(r.status).toBe('OK_WITH_WARNINGS');
    expect(r.checks[1]?.status).toBe('FAIL');
  });

  it('entrées invalides ⇒ INVALID, erreurs par champ, aucune sortie', () => {
    const r = run(
      testSlabEngine,
      input({ length: { value: -1, unit: 'm' }, thickness: { value: 1, unit: 'kg' } }),
      slabParams(),
    );
    expect(r.status).toBe('INVALID');
    expect(r.outputs).toBeNull();
    expect(r.inputs).toBeNull();
    expect(r.errors).toEqual([
      expect.objectContaining({ path: 'length.value', code: 'OUT_OF_RANGE' }),
      expect.objectContaining({ path: 'thickness.unit', code: 'UNIT_INCOMPATIBLE' }),
    ]);
    expect(r.rawInputs).toMatchObject({ length: { value: -1 } });
  });

  it('erreur Zod native : code de Zod conservé', () => {
    const r = run(testSlabEngine, { length: 'long' }, slabParams());
    expect(r.errors[0]).toMatchObject({ path: 'length', code: 'invalid_type' });
  });

  it('paramètre requis absent ⇒ INVALID', () => {
    const set = ResolvedParameterSet.create([param({ key: 'test.waste', value: 5, unit: '%' })]);
    if (!set.ok) throw new Error();
    const r = run(testSlabEngine, input(), set.value);
    expect(r.status).toBe('INVALID');
    expect(r.errors).toEqual([
      expect.objectContaining({ path: 'parameters.test.max_area', code: 'PARAMETER_MISSING' }),
    ]);
    expect(r.parameters.map((p) => p.used)).toEqual([false]);
  });

  it('paramètre optionnel présent : lu et instantané', () => {
    const r = run(
      testSlabEngine,
      input(),
      slabParams([param({ key: 'test.optional', value: 1, unit: 'm' })]),
    );
    expect(r.parameters.find((p) => p.key === 'test.optional')?.used).toBe(true);
  });

  it.each([
    ['FAIL', 'NON_CONVERGENCE', 'Pas de convergence'],
    ['THROW', 'ENGINE_EXCEPTION', 'panne interne'],
    ['THROW_STRING', 'ENGINE_EXCEPTION', 'chaîne levée'],
    ['BAD_OUTPUT', 'OUTPUT_SCHEMA_MISMATCH', 'areaM2'],
    ['UNDECLARED', 'PARAMETER_ACCESS', 'non déclaré'],
    ['MUTATE', 'ENGINE_EXCEPTION', ''],
    ['VERIFY_THROWS', 'ENGINE_EXCEPTION', 'vérification en panne'],
  ])('défaut %s ⇒ ERROR %s, aucune sortie présentée', (mode, code, message) => {
    const r = run(testSlabEngine, input({ mode }), slabParams());
    expect(r.status).toBe('ERROR');
    expect(r.outputs).toBeNull();
    expect(r.failure).toMatchObject({ code, message: expect.stringContaining(message) as unknown });
  });

  it('les entrées normalisées sont gelées', () => {
    const r = run(testSlabEngine, input(), slabParams());
    expect(Object.isFrozen(r.inputs)).toBe(true);
    expect(Object.isFrozen(r.outputs)).toBe(true);
  });
});

describe('déterminisme (principe P2)', () => {
  it('deux exécutions identiques produisent un résultat identique', () => {
    const a = run(testSlabEngine, input(), slabParams());
    const b = run(testSlabEngine, input(), slabParams());
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('propriété : déterminisme et quantités positives pour toute entrée valide', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        (length, width, thickness) => {
          const raw = input({
            length: { value: length, unit: 'm' },
            width: { value: width, unit: 'm' },
            thickness: { value: thickness, unit: 'm' },
          });
          const a = run(testSlabEngine, raw, slabParams());
          const b = run(testSlabEngine, raw, slabParams());
          expect(canonicalJson(a)).toBe(canonicalJson(b));
          expect(a.outputs?.volumeWithWasteM3).toBeGreaterThanOrEqual(
            a.outputs?.volumeM3 ?? Number.NaN,
          );
        },
      ),
    );
  });
});
