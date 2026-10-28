import { run } from '@consulpro/calc-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { topoControl, topoLeveling, topoTraverse } from '../index';
import { seedParams } from './seed';

/* Contrôle, nivellement et polygonale : cas vérifiés, tolérances, propriétés de compensation. */

const q = (value: number, unit: string) => ({ value, unit });
const gon = (g: number) => q(g, 'gon');
const outputs = <T>(result: { outputs: T | null }): T => {
  if (result.outputs === null) throw new Error('Résultat sans sorties');
  return result.outputs;
};

const control = (inputs: Record<string, unknown>) =>
  run(topoControl, inputs, seedParams(topoControl));
const leveling = (inputs: Record<string, unknown>) =>
  run(topoLeveling, inputs, seedParams(topoLeveling));
const traverse = (inputs: Record<string, unknown>) =>
  run(topoTraverse, inputs, seedParams(topoTraverse));

describe('contrôle de points', () => {
  it('écarts dans les tolérances : vérifications PASS, paramètres signalés à vérifier', () => {
    const result = control({
      xT: q(1000, 'm'),
      yT: q(2000, 'm'),
      zT: q(100, 'm'),
      xM: q(1000.02, 'm'),
      yM: q(2000.01, 'm'),
      zM: q(100.03, 'm'),
    });
    expect(result.status).toBe('OK_WITH_WARNINGS');
    expect(result.checks.every((c) => c.status === 'PASS')).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('PARAMETER_TO_VERIFY');
    const out = outputs<{ planimetricDeviation: number; deltaZ: number | null }>(result);
    expect(out.planimetricDeviation).toBeCloseTo(Math.hypot(0.02, 0.01), 9);
    expect(out.deltaZ).toBeCloseTo(0.03, 9);
  });

  it('écart planimétrique hors tolérance : non conforme', () => {
    const result = control({
      xT: q(1000, 'm'),
      yT: q(2000, 'm'),
      xM: q(1000.1, 'm'),
      yM: q(2000, 'm'),
    });
    expect(result.status).toBe('NON_COMPLIANT');
    const plan = result.checks.find((c) => c.rule === 'topo.control.planimetric');
    expect(plan?.status).toBe('FAIL');
    // Contrôle 2D : aucun écart altimétrique.
    expect(outputs<{ deltaZ: number | null; altimetricDeviation: number | null }>(result)).toMatchObject(
      { deltaZ: null, altimetricDeviation: null },
    );
  });

  it('une seule altitude fournie est refusée (théorique ou levée)', () => {
    const missingM = control({
      xT: q(0, 'm'),
      yT: q(0, 'm'),
      zT: q(10, 'm'),
      xM: q(0, 'm'),
      yM: q(0, 'm'),
    });
    expect(missingM.status).toBe('INVALID');
    expect(missingM.errors.map((e) => e.path)).toContain('zM');
    const missingT = control({
      xT: q(0, 'm'),
      yT: q(0, 'm'),
      xM: q(0, 'm'),
      yM: q(0, 'm'),
      zM: q(10, 'm'),
    });
    expect(missingT.status).toBe('INVALID');
    expect(missingT.errors.map((e) => e.path)).toContain('zT');
  });
});

describe('nivellement direct', () => {
  it('boucle parfaite : fermeture nulle, altitude compensée = départ', () => {
    const result = leveling({
      startElevation: q(100, 'm'),
      stations: [{ back: q(1.5, 'm'), fore: q(1.5, 'm') }],
    });
    expect(result.status).toBe('OK_WITH_WARNINGS');
    const out = outputs<{ closure: number; compensatedEndElevation: number }>(result);
    expect(out.closure).toBeCloseTo(0, 12);
    expect(out.compensatedEndElevation).toBeCloseTo(100, 12);
    // L'altitude d'arrivée non saisie est une hypothèse (boucle).
    expect(result.hypotheses.map((h) => h.field)).toContain('endElevation');
  });

  it('cheminement encadré : fermeture répartie, arrivée ramenée sur le repère connu', () => {
    const result = leveling({
      startElevation: q(100, 'm'),
      endElevation: q(101, 'm'),
      stations: [
        { back: q(1.5, 'm'), fore: q(1.0, 'm') },
        { back: q(1.503, 'm'), fore: q(1.0, 'm') },
      ],
    });
    const out = outputs<{ closure: number; compensatedEndElevation: number; correctionPerStation: number }>(
      result,
    );
    expect(out.closure).toBeCloseTo(0.003, 9);
    expect(out.correctionPerStation).toBeCloseTo(-0.0015, 9);
    expect(out.compensatedEndElevation).toBeCloseTo(101, 9);
    expect(result.checks.find((c) => c.rule === 'topo.leveling.closure')?.status).toBe('PASS');
  });

  it('fermeture hors tolérance : non conforme', () => {
    const result = leveling({
      startElevation: q(100, 'm'),
      endElevation: q(100, 'm'),
      stations: [{ back: q(1.52, 'm'), fore: q(1.5, 'm') }],
    });
    expect(result.status).toBe('NON_COMPLIANT');
    expect(result.checks.find((c) => c.rule === 'topo.leveling.closure')?.status).toBe('FAIL');
  });
});

describe('polygonale', () => {
  const square = (distances: number[], extra: Record<string, unknown> = {}) =>
    traverse({
      type: 'CLOSED',
      x0: q(0, 'm'),
      y0: q(0, 'm'),
      initialBearing: gon(0),
      closingBearing: gon(300),
      legs: [
        { angle: gon(0), distance: q(distances[0]!, 'm') },
        { angle: gon(300), distance: q(distances[1]!, 'm') },
        { angle: gon(300), distance: q(distances[2]!, 'm') },
        { angle: gon(300), distance: q(distances[3]!, 'm') },
      ],
      ...extra,
    });

  it('carré fermé parfait : fermeture nulle, arrivée au départ', () => {
    const result = square([100, 100, 100, 100]);
    expect(result.status).toBe('OK_WITH_WARNINGS');
    const out = outputs<{
      fL: number | null;
      endX: number;
      endY: number;
      angularMisclosure: number | null;
      perimeter: number;
    }>(result);
    expect(out.fL).toBeCloseTo(0, 9);
    expect(out.endX).toBeCloseTo(0, 9);
    expect(out.endY).toBeCloseTo(0, 9);
    expect(out.angularMisclosure).toBeCloseTo(0, 9);
    expect(out.perimeter).toBeCloseTo(400, 9);
  });

  it('erreur de fermeture planimétrique : f_L, précision relative, arrivée compensée au départ', () => {
    const result = square([100, 100, 100, 99]);
    expect(result.status).toBe('NON_COMPLIANT');
    const out = outputs<{
      fX: number | null;
      fL: number | null;
      relativePrecision: number | null;
      relativeDenominator: number | null;
      endX: number;
    }>(result);
    expect(out.fX).toBeCloseTo(1, 9);
    expect(out.fL).toBeCloseTo(1, 9);
    expect(out.relativePrecision).toBeCloseTo(1 / 399, 9);
    expect(out.relativeDenominator).toBeCloseTo(399, 6);
    expect(out.endX).toBeCloseTo(0, 9);
  });

  it('polygonale encadrée : arrivée ramenée sur le point connu', () => {
    const result = traverse({
      type: 'LINKED',
      x0: q(0, 'm'),
      y0: q(0, 'm'),
      initialBearing: gon(100),
      endX: q(100, 'm'),
      endY: q(0, 'm'),
      legs: [{ angle: gon(0), distance: q(100, 'm') }],
    });
    expect(result.status).toBe('OK_WITH_WARNINGS');
    const out = outputs<{ endX: number; endY: number; fL: number | null; angularMisclosure: number | null }>(result);
    expect(out.endX).toBeCloseTo(100, 9);
    expect(out.endY).toBeCloseTo(0, 9);
    expect(out.fL).toBeCloseTo(0, 9);
    expect(out.angularMisclosure).toBeNull();
  });

  it('polygonale ouverte : aucune fermeture, aucun contrôle', () => {
    const result = traverse({
      type: 'OPEN',
      x0: q(0, 'm'),
      y0: q(0, 'm'),
      initialBearing: gon(50),
      legs: [{ angle: gon(0), distance: q(100, 'm') }],
    });
    expect(result.status).toBe('OK');
    const out = outputs<{ fL: number | null; relativePrecision: number | null; endX: number }>(result);
    expect(out.fL).toBeNull();
    expect(out.relativePrecision).toBeNull();
    expect(out.endX).toBeCloseTo(100 * Math.sin(Math.PI / 4), 9);
    expect(result.checks).toEqual([]);
  });

  it('fermeture angulaire hors tolérance : vérification angulaire en échec', () => {
    const result = traverse({
      type: 'LINKED',
      x0: q(0, 'm'),
      y0: q(0, 'm'),
      initialBearing: gon(0),
      closingBearing: gon(90),
      endX: q(0, 'm'),
      endY: q(0, 'm'),
      legs: [
        { angle: gon(0), distance: q(100, 'm') },
        { angle: gon(300), distance: q(100, 'm') },
      ],
    });
    const out = outputs<{ angularMisclosure: number | null }>(result);
    expect((out.angularMisclosure ?? NaN) * (200 / Math.PI)).toBeCloseTo(10, 9);
    expect(result.checks.find((c) => c.rule === 'topo.traverse.angular-closure')?.status).toBe('FAIL');
  });

  it('polygonale encadrée sans point d’arrivée : erreur explicite, aucune valeur', () => {
    const result = traverse({
      type: 'LINKED',
      x0: q(0, 'm'),
      y0: q(0, 'm'),
      initialBearing: gon(0),
      legs: [{ angle: gon(0), distance: q(100, 'm') }],
    });
    expect(result.status).toBe('ERROR');
    expect(result.failure?.code).toBe('END_REQUIRED');
    expect(result.outputs).toBeNull();
  });
});

describe('propriétés de compensation (critères de sortie de phase)', () => {
  it('fermeture nulle après Bowditch : un cheminement fermé revient exactement au départ', () => {
    const anyLeg = fc.record({
      angle: fc.double({ min: 0, max: 2 * Math.PI, noNaN: true, maxExcluded: true }),
      distance: fc.double({ min: 1, max: 500, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true, maxExcluded: true }),
        fc.array(anyLeg, { minLength: 2, maxLength: 8 }),
        (x0, y0, g0, legs) => {
          const out = outputs<{ endX: number; endY: number }>(
            traverse({
              type: 'CLOSED',
              x0: q(x0, 'm'),
              y0: q(y0, 'm'),
              initialBearing: q(g0, 'rad'),
              legs: legs.map((l) => ({ angle: q(l.angle, 'rad'), distance: q(l.distance, 'm') })),
            }),
          );
          expect(out.endX).toBeCloseTo(x0, 6);
          expect(out.endY).toBeCloseTo(y0, 6);
        },
      ),
    );
  });

  it('cohérence du nivellement compensé : l’altitude compensée atteint le repère connu', () => {
    const anyStation = fc.record({
      back: fc.double({ min: 0, max: 5, noNaN: true }),
      fore: fc.double({ min: 0, max: 5, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.array(anyStation, { minLength: 1, maxLength: 20 }),
        (start, end, stations) => {
          const out = outputs<{ compensatedEndElevation: number }>(
            leveling({
              startElevation: q(start, 'm'),
              endElevation: q(end, 'm'),
              stations: stations.map((s) => ({ back: q(s.back, 'm'), fore: q(s.fore, 'm') })),
            }),
          );
          expect(out.compensatedEndElevation).toBeCloseTo(end, 6);
        },
      ),
    );
  });
});
