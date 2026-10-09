import { describe, expect, it } from 'vitest';

import { canonicalJson } from '../canonical';
import { EngineRegistry } from '../registry/engine-registry';
import { checkLimit, TraceRecorder } from '../trace/recorders';
import { deepFreeze } from '../pipeline/deep-freeze';
import { testSlabEngine } from './fixtures';

describe('canonicalJson', () => {
  it('trie les clés, ignore undefined et normalise -0', () => {
    expect(canonicalJson({ b: 1, a: [true, null, 'x'], c: undefined, d: -0 })).toBe(
      '{"a":[true,null,"x"],"b":1,"d":0}',
    );
    expect(canonicalJson({ z: { y: 1, x: 2 } })).toBe(canonicalJson({ z: { x: 2, y: 1 } }));
    expect(canonicalJson(false)).toBe('false');
  });

  it('refuse les valeurs non sérialisables', () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(/non fini en \$\.a/);
    expect(() => canonicalJson([1, () => 1])).toThrow(/function/);
    expect(() => canonicalJson(10n)).toThrow(/bigint/);
  });
});

describe('EngineRegistry', () => {
  it('enregistre, retrouve et liste les moteurs triés', () => {
    const registry = new EngineRegistry();
    registry.register({ ...testSlabEngine, id: 'test.z-engine' });
    registry.register(testSlabEngine);
    expect(registry.get('test.slab-volume')?.version).toBe('1.0.0');
    expect(registry.get('absent')).toBeUndefined();
    expect(registry.list().map((e) => e.id)).toEqual(['test.slab-volume', 'test.z-engine']);
  });

  it('refuse identifiant, version, doublon et paramètres répétés', () => {
    const registry = new EngineRegistry();
    registry.register(testSlabEngine);
    expect(() => {
      registry.register({ ...testSlabEngine, id: 'Bad Id' });
    }).toThrow(/Identifiant/);
    expect(() => {
      registry.register({ ...testSlabEngine, id: 'test.other', version: '1.0' });
    }).toThrow(/semver/);
    expect(() => {
      registry.register(testSlabEngine);
    }).toThrow(/déjà enregistré/);
    const repeated = {
      ...testSlabEngine,
      id: 'test.rep',
      parameters: [testSlabEngine.parameters[0], testSlabEngine.parameters[0]],
    };
    expect(() => {
      registry.register(repeated as never);
    }).toThrow(/deux fois/);
  });
});

describe('checkLimit', () => {
  const base = { rule: 'r', label: 'l', severity: 'BLOCKING' as const };

  it.each([
    ['<=', 3, 3, 'PASS'],
    ['<=', 3 + 1e-12, 3, 'PASS'],
    ['<=', 3.01, 3, 'FAIL'],
    ['<', 3, 3, 'FAIL'],
    ['<', 2.9, 3, 'PASS'],
    ['>=', 3 - 1e-12, 3, 'PASS'],
    ['>=', 2.9, 3, 'FAIL'],
    ['>', 3, 3, 'FAIL'],
    ['>', 3.1, 3, 'PASS'],
  ] as const)('%s : %d vs %d → %s', (comparison, measured, limit, expected) => {
    expect(checkLimit({ ...base, comparison, measured, limit }).status).toBe(expected);
  });
});

describe('TraceRecorder', () => {
  it('refuse deux étapes de même identifiant', () => {
    const trace = new TraceRecorder();
    trace.step({ id: 'T1', label: 'a' });
    expect(() => {
      trace.step({ id: 'T1', label: 'b' });
    }).toThrow(/double/);
  });
});

describe('deepFreeze', () => {
  it('gèle récursivement et tolère les primitives', () => {
    const value = deepFreeze({ a: { b: [1, { c: 2 }] } });
    expect(Object.isFrozen(value.a.b[1])).toBe(true);
    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze(null)).toBe(null);
  });
});
