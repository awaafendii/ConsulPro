import { run } from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';

import {
  BTP_ENGINES,
  btpColumns,
  btpFootings,
  btpMasonry,
  btpPainting,
  btpSlabs,
  btpStairs,
} from '../index';
import { seedParams } from './seed';

/* Comportements non couverts par les cas de référence : traçabilité, surcharges, défauts. */

const m = (value: number) => ({ value, unit: 'm' });

describe('traçabilité', () => {
  it('chaque étape de calcul porte sa formule ; les tables du référentiel sont citées', () => {
    const result = run(
      btpFootings,
      { type: 'ISOLATED', length: m(1.2), width: m(1.2), height: m(0.4), count: 6 },
      seedParams(btpFootings),
    );
    expect(result.trace.map((s) => s.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
    expect(result.trace.every((s) => (s.formula ?? '').length > 0)).toBe(true);
    expect(result.trace.find((s) => s.id === 'T4')?.source).toContain('btp.steel.ratio');
    // Paramètres utilisés : ceux lus par le calcul, tous « à vérifier ».
    const used = result.parameters.filter((p) => p.used).map((p) => p.key);
    expect(used).toContain('btp.lean_concrete.thickness');
    expect(used).not.toContain('btp.steel.density'); // aciers par ratio : masse volumique non lue
    expect(result.warnings.map((w) => w.parameterKey).sort()).toEqual([...used].sort());
  });

  it('les aciers par nomenclature lisent la masse volumique et non le ratio', () => {
    const result = run(
      btpColumns,
      {
        sectionA: m(0.3),
        sectionB: m(0.3),
        height: m(3),
        steelMode: 'SCHEDULE',
        schedule: [{ diameter: { value: 12, unit: 'mm' }, length: m(3.6), count: 4 }],
      },
      seedParams(btpColumns),
    );
    const used = result.parameters.filter((p) => p.used).map((p) => p.key);
    expect(used).toContain('btp.steel.density');
    expect(used).not.toContain('btp.steel.ratio');
  });
});

describe('surcharges de paramètres', () => {
  it('une surcharge justifiée change le résultat et le signale', () => {
    const base = run(
      btpPainting,
      { area: { value: 100, unit: 'm2' }, coats: 2, primer: 'NO' },
      seedParams(btpPainting),
    );
    const overridden = run(
      btpPainting,
      { area: { value: 100, unit: 'm2' }, coats: 2, primer: 'NO' },
      seedParams(btpPainting, [], {
        'btp.paint.spread_rate': { kind: 'SCALAR', value: 8, unit: 'm2/L' },
      }),
    );
    expect(base.outputs?.paint).toBeCloseTo(21, 9);
    expect(overridden.outputs?.paint).toBeCloseTo(26.25, 9); // 100 × 2 / 8 × 1,05
    expect(overridden.warnings.map((w) => w.code)).toContain('PARAMETER_OVERRIDDEN');
  });

  it('une table surchargée sans la catégorie lue produit une erreur, jamais une valeur', () => {
    const result = run(
      btpColumns,
      { sectionA: m(0.25), sectionB: m(0.25), height: m(3) },
      seedParams(btpColumns, [], {
        'btp.concrete.cement': {
          kind: 'TABLE',
          table: {
            axes: [{ name: 'mix', kind: 'CATEGORY', values: ['PROPRETE'] }],
            unit: 'kg/m3',
            cells: [150],
          },
        },
      }),
    );
    expect(result.status).toBe('ERROR');
    expect(result.outputs).toBeNull();
    expect(result.failure?.code).toBe('PARAMETER_ACCESS');
  });

  it('un seuil de déduction surchargé change les ouvertures déduites', () => {
    const wall = {
      length: m(5),
      height: m(3),
      thickness: 'T15',
      openings: [{ width: m(0.5), height: m(0.5), count: 4 }],
    };
    expect(run(btpMasonry, wall, seedParams(btpMasonry)).outputs?.openingsDeducted).toBe(0);
    const strict = run(
      btpMasonry,
      wall,
      seedParams(btpMasonry, [], {
        'btp.masonry.opening_min_area': { kind: 'SCALAR', value: 0, unit: 'm2' },
      }),
    );
    expect(strict.outputs?.openingsDeducted).toBeCloseTo(1, 12);
  });
});

describe('hypothèses', () => {
  it('le palier reprend l’épaisseur de la paillasse, hypothèse tracée', () => {
    const result = run(
      btpStairs,
      {
        width: m(1),
        steps: 10,
        riser: m(0.17),
        going: m(0.28),
        waistThickness: m(0.15),
        landingLength: m(1),
      },
      seedParams(btpStairs),
    );
    const hypothesis = result.hypotheses.find((h) => h.code === 'DEFAULT.landingThickness');
    expect(hypothesis).toMatchObject({ origin: 'DEFAULT_VALUE', value: 0.15 });
  });

  it('plancher à corps creux : l’épaisseur saisie est ignorée (béton équivalent du référentiel)', () => {
    const area = { value: 50, unit: 'm2' };
    const without = run(btpSlabs, { type: 'H16_4', area }, seedParams(btpSlabs));
    const withThickness = run(
      btpSlabs,
      { type: 'H16_4', area, thickness: m(0.3) },
      seedParams(btpSlabs),
    );
    expect(withThickness.outputs).toEqual(without.outputs);
  });
});

describe('sorties alimentant le quantitatif', () => {
  it('un matériau (cumulé entre moteurs) a partout la même unité et le même caractère cumulable', () => {
    const seen = new Map<
      string,
      { unit: string; family?: string; additive: boolean; engine: string }
    >();
    for (const engine of BTP_ENGINES) {
      for (const output of engine.presentation.outputs) {
        if (output.family !== 'MATERIAL') continue;
        const shape = {
          unit: output.unit,
          family: output.family,
          additive: output.additive === true,
        };
        const previous = seen.get(output.key);
        if (previous) {
          expect(
            { unit: previous.unit, family: previous.family, additive: previous.additive },
            `${output.key} : ${previous.engine} / ${engine.id}`,
          ).toEqual(shape);
        } else seen.set(output.key, { ...shape, engine: engine.id });
      }
    }
  });

  it('seuls les matériaux se déclarent cumulables', () => {
    for (const engine of BTP_ENGINES)
      for (const output of engine.presentation.outputs)
        if (output.additive) expect(output.family, `${engine.id}.${output.key}`).toBe('MATERIAL');
  });
});
