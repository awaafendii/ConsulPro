import { run } from '@consulpro/calc-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { TAU } from '../common/geometry';
import { topoCoordinates } from '../index';
import { seedParams } from './seed';

/* Propriétés : réciprocité du problème direct et du problème inverse, symétrie, proportionnalité. */

const q = (value: number, unit: string) => ({ value, unit });
const params = seedParams(topoCoordinates);
const outputs = <T>(result: { outputs: T | null }): T => {
  if (result.outputs === null) throw new Error('Résultat sans sorties');
  return result.outputs;
};

const coordinate = fc.double({ min: -1e5, max: 1e5, noNaN: true });
const angle = fc.double({ min: 0, max: TAU, noNaN: true, maxExcluded: true });
const positiveDistance = fc.double({ min: 1e-3, max: 1e5, noNaN: true });

const radiate = (x: number, y: number, bearing: number, d: number) =>
  outputs<{ x: number; y: number }>(
    run(
      topoCoordinates,
      { mode: 'RADIATION', x1: q(x, 'm'), y1: q(y, 'm'), bearing: q(bearing, 'rad'), distance: q(d, 'm') },
      params,
    ),
  );
const join = (x1: number, y1: number, x2: number, y2: number) =>
  outputs<{ bearing: number; distance: number }>(
    run(
      topoCoordinates,
      { mode: 'JOIN', x1: q(x1, 'm'), y1: q(y1, 'm'), x2: q(x2, 'm'), y2: q(y2, 'm') },
      params,
    ),
  );

describe('réciprocité direct / inverse', () => {
  it('un point lancé puis rejoint restitue le gisement et la distance', () => {
    fc.assert(
      fc.property(coordinate, coordinate, angle, positiveDistance, (x, y, bearing, d) => {
        const p = radiate(x, y, bearing, d);
        const back = join(x, y, p.x, p.y);
        expect(back.distance).toBeCloseTo(d, 6);
        // Comparaison angulaire modulo 2π, à travers le passage par 0.
        const gap = Math.abs(back.bearing - bearing) % TAU;
        expect(Math.min(gap, TAU - gap)).toBeLessThan(1e-6);
      }),
    );
  });
});

describe('symétrie et proportionnalité', () => {
  it('la distance est symétrique et les gisements aller-retour diffèrent de 200 gon', () => {
    fc.assert(
      fc.property(coordinate, coordinate, coordinate, coordinate, (x1, y1, x2, y2) => {
        fc.pre(Math.hypot(x2 - x1, y2 - y1) > 1);
        const ab = join(x1, y1, x2, y2);
        const ba = join(x2, y2, x1, y1);
        expect(ba.distance).toBeCloseTo(ab.distance, 6);
        const gap = Math.abs(ab.bearing - ba.bearing) % TAU;
        expect(Math.min(gap, TAU - gap)).toBeCloseTo(Math.PI, 6);
      }),
    );
  });

  it('la distance rayonnée est proportionnelle à la distance saisie', () => {
    fc.assert(
      fc.property(coordinate, coordinate, angle, positiveDistance, (x, y, bearing, d) => {
        const single = join(x, y, radiate(x, y, bearing, d).x, radiate(x, y, bearing, d).y).distance;
        const triple = join(x, y, radiate(x, y, bearing, 3 * d).x, radiate(x, y, bearing, 3 * d).y)
          .distance;
        expect(triple).toBeCloseTo(3 * single, 6);
      }),
    );
  });
});
