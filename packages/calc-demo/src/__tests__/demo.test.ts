import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  EngineRegistry,
  ResolvedParameterSet,
  run,
  type ResolvedParameter,
} from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';

import { DEMO_ENGINES, demoSlabMass, demoSlabVolume } from '../index';

const param = (key: string, value: number, unit: string): ResolvedParameter =>
  ({
    key,
    kind: 'SCALAR',
    value,
    unit,
    source: { document: 'Démonstration ConsulPro' },
    verification: 'TO_VERIFY',
  }) as ResolvedParameter;

function demoParams(maxArea = 500) {
  const set = ResolvedParameterSet.create(
    [param('demo.waste_rate', 5, '%'), param('demo.max_area', maxArea, 'm2')],
    [{ standardVersionId: 'v-demo', code: 'DEMO', version: '1' }],
  );
  if (!set.ok) throw new Error('paramètres invalides');
  return set.value;
}

const slab = {
  length: { value: 10, unit: 'm' },
  width: { value: 500, unit: 'cm' },
  thickness: { value: 20, unit: 'cm' },
};

describe('demo.slab-volume', () => {
  it('calcule surface, volume et volume avec pertes, tracés et vérifiés', () => {
    const result = run(demoSlabVolume, slab, demoParams());
    expect(result.status).toBe('OK_WITH_WARNINGS'); // paramètres « à vérifier »
    expect(result.outputs).toEqual({
      area: 50,
      volume: expect.closeTo(10, 12) as number,
      volumeWithWaste: expect.closeTo(10.5, 12) as number,
    });
    expect(result.trace.map((s) => s.id)).toEqual(['T1', 'T2', 'T3']);
    expect(result.checks).toMatchObject([{ rule: 'demo.max-area', status: 'PASS' }]);
    expect(result.hypotheses.map((h) => h.code)).toContain('DEMO.NO_TECHNICAL_VALUE');
    expect(result.warnings.map((w) => w.code)).toEqual([
      'PARAMETER_TO_VERIFY',
      'PARAMETER_TO_VERIFY',
    ]);
  });

  it('non conforme au-delà de la surface maximale ; entrées refusées sinon', () => {
    expect(run(demoSlabVolume, slab, demoParams(40)).status).toBe('NON_COMPLIANT');
    const invalid = run(
      demoSlabVolume,
      { ...slab, thickness: { value: 10, unit: 'm' } },
      demoParams(),
    );
    expect(invalid).toMatchObject({ status: 'INVALID', outputs: null });
    expect(invalid.errors[0]).toMatchObject({ path: 'thickness.value', code: 'OUT_OF_RANGE' });
  });
});

describe('demo.slab-mass', () => {
  it('masse = volume × masse volumique, sans paramètre de référentiel', () => {
    const none = ResolvedParameterSet.create([], []);
    if (!none.ok) throw new Error();
    const result = run(
      demoSlabMass,
      { volume: { value: 10.5, unit: 'm3' }, density: { value: 2.4, unit: 't/m3' } },
      none.value,
    );
    expect(result.status).toBe('OK');
    expect(result.outputs?.mass).toBeCloseTo(25200, 9);
    expect(result.checks).toEqual([]);
  });
});

describe('registre', () => {
  it('les moteurs de démonstration s’enregistrent et portent leur présentation', () => {
    const registry = new EngineRegistry();
    for (const engine of DEMO_ENGINES) registry.register(engine);
    expect(registry.list().map((e) => e.id)).toEqual(['demo.slab-mass', 'demo.slab-volume']);
    for (const engine of DEMO_ENGINES) {
      const keys = engine.presentation.outputs.map((o) => o.key);
      expect(
        Object.keys(
          engine.outputSchema.parse(Object.fromEntries(keys.map((k) => [k, 1]))) as object,
        ),
      ).toEqual(keys);
    }
  });
});

describe('règles du référentiel ↔ implémentations (11-referentiels.md §3)', () => {
  it('chaque règle de DEMO a son implémentation, et chaque vérification sa règle', () => {
    const file = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../standards/seeds/demo/demo-1.json', import.meta.url)),
        'utf8',
      ),
    ) as { rules: { code: string; implementation: string }[] };
    const engines = new Map(DEMO_ENGINES.map((e) => [e.id, e]));
    for (const rule of file.rules) {
      const [engineId] = rule.implementation.split('/');
      expect(engines.has(engineId ?? ''), rule.implementation).toBe(true);
    }
    // Inversement : les vérifications produites citent une règle publiée.
    const produced = run(demoSlabVolume, slab, demoParams()).checks.map((c) => c.rule);
    expect(produced.every((code) => file.rules.some((r) => r.code === code))).toBe(true);
    expect(file.rules.map((r) => r.code).every((code) => produced.includes(code))).toBe(true);
  });
});
