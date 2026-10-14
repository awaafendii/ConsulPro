import { run, type AnyEngine } from '@consulpro/calc-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  plumbingDrainage,
  plumbingFlowRates,
  plumbingHeadLoss,
  plumbingPipeSizing,
  plumbingPressureCheck,
} from '../index';
import { seedParams } from './seed';

/* Propriétés (06-strategie-de-tests.md §3.3) : monotonies des pertes de charge et du dimensionnement. */

const q = (value: number, unit: string) => ({ value, unit });
/** Sorties d'un résultat calculé (jamais `null` ici : un échec fait échouer le test). */
const outputs = <T>(result: { outputs: T | null }): T => {
  if (result.outputs === null) throw new Error('Résultat sans sorties');
  return result.outputs;
};
const params = (engine: unknown) => seedParams(engine as AnyEngine);
const lossParams = params(plumbingHeadLoss);

const material = fc.constantFrom(
  { material: 'PVC_PN16', sizes: [20, 25, 32, 40, 50, 63] },
  { material: 'PPR_PN20', sizes: [20, 25, 32, 40, 50, 63] },
  { material: 'PEHD_PN16', sizes: [20, 25, 32, 40, 50, 63] },
  { material: 'CU', sizes: [12, 14, 16, 18, 22, 28] },
  { material: 'STEEL_GALV', sizes: [15, 20, 25, 32, 40, 50] },
);

describe('pertes de charge (plumbing.head-loss)', () => {
  it('croissent avec le débit et la longueur, décroissent avec le diamètre', () => {
    fc.assert(
      fc.property(
        material,
        fc.integer({ min: 0, max: 4 }),
        fc.double({ min: 0.05, max: 2, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.integer({ min: 5, max: 70 }),
        ({ material: m, sizes }, k, flowLs, length, temperature) => {
          const loss = (flow: number, l: number, size: number) =>
            outputs<{ totalLoss: number }>(
              run(
                plumbingHeadLoss,
                {
                  flow: q(flow, 'L/s'),
                  material: m,
                  size: q(size, 'mm'),
                  length: q(l, 'm'),
                  temperature: q(temperature, 'degC'),
                },
                lossParams,
              ),
            ).totalLoss;
          const size = sizes[k] ?? 20;
          const larger = sizes[k + 1] ?? 63;
          const base = loss(flowLs, length, size);
          expect(base).toBeGreaterThan(0);
          expect(loss(flowLs, 2 * length, size)).toBeCloseTo(2 * base, 9);
          expect(loss(flowLs * 1.5, length, size)).toBeGreaterThan(base);
          expect(loss(flowLs, length, larger)).toBeLessThan(base);
        },
      ),
    );
  });
});

describe('diamètres (plumbing.pipe-sizing)', () => {
  it('vitesse au plus égale au maximum ; diamètre croissant avec le débit', () => {
    const sizingParams = params(plumbingPipeSizing);
    fc.assert(
      fc.property(
        material,
        fc.constantFrom('FLOOR', 'BASEMENT'),
        fc.double({ min: 0.05, max: 3, noNaN: true }),
        ({ material: m }, location, flowLs) => {
          const sized = (flow: number) =>
            run(plumbingPipeSizing, { flow: q(flow, 'L/s'), material: m, location }, sizingParams);
          const first = sized(flowLs);
          if (first.status === 'ERROR') {
            expect(first.failure?.code).toBe('NO_SIZE');
            return;
          }
          const out = outputs<{ velocity: number; maxVelocity: number; innerDiameter: number }>(
            first,
          );
          expect(out.velocity).toBeLessThanOrEqual(out.maxVelocity * (1 + 1e-9));
          const more = sized(flowLs * 1.4);
          if (more.status !== 'ERROR') {
            expect(outputs<{ innerDiameter: number }>(more).innerDiameter).toBeGreaterThanOrEqual(
              out.innerDiameter,
            );
          }
        },
      ),
    );
  });
});

describe('débits (plumbing.flow-rates)', () => {
  it('0 < y ≤ 1 et débit probable au plus égal au débit de base', () => {
    const flowParams = params(plumbingFlowRates);
    fc.assert(
      fc.property(
        fc.record({
          washbasin: fc.integer({ min: 0, max: 50 }),
          wcCistern: fc.integer({ min: 0, max: 50 }),
          shower: fc.integer({ min: 0, max: 50 }),
          sink: fc.integer({ min: 1, max: 50 }),
        }),
        (counts) => {
          const out = outputs<{ simultaneity: number; probableFlow: number; baseFlow: number }>(
            run(plumbingFlowRates, counts, flowParams),
          );
          expect(out.simultaneity).toBeGreaterThan(0);
          expect(out.simultaneity).toBeLessThanOrEqual(1);
          expect(out.probableFlow).toBeLessThanOrEqual(out.baseFlow * (1 + 1e-12));
        },
      ),
    );
  });
});

describe('pressions (plumbing.pressure-check)', () => {
  it('la pression disponible décroît avec les pertes et la hauteur du point', () => {
    const pressureParams = params(plumbingPressureCheck);
    fc.assert(
      fc.property(
        fc.double({ min: 50, max: 800, noNaN: true }),
        fc.double({ min: -20, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 200, noNaN: true }),
        (p0, dz, losses) => {
          const available = (h: number, l: number) =>
            outputs<{ availablePressure: number }>(
              run(
                plumbingPressureCheck,
                {
                  upstreamPressure: q(p0, 'kPa'),
                  heightDifference: q(h, 'm'),
                  losses: q(l, 'kPa'),
                  fixture: 'SHOWER',
                },
                pressureParams,
              ),
            ).availablePressure;
          const base = available(dz, losses);
          expect(available(dz + 1, losses)).toBeLessThan(base);
          expect(available(dz, losses + 1)).toBeCloseTo(base - 1, 9);
        },
      ),
    );
  });
});

describe('évacuation (plumbing.drainage)', () => {
  it('le débit admissible couvre toujours le débit d’eaux usées ; jamais plus petit avec plus d’appareils', () => {
    const drainParams = params(plumbingDrainage);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        fc.constantFrom('BRANCH', 'COLLECTOR', 'STACK'),
        fc.double({ min: 1, max: 5, noNaN: true }),
        (washbasin, wc, role, slope) => {
          const drained = (n: number) =>
            run(
              plumbingDrainage,
              {
                washbasin: n,
                wcCistern: wc,
                usage: 'DWELLING',
                role,
                ...(role === 'STACK' ? {} : { slope: q(slope, '%') }),
              },
              drainParams,
            );
          const first = drained(washbasin);
          if (first.status === 'ERROR') return;
          const out = outputs<{ wastewaterFlow: number; capacity: number; size: number }>(first);
          expect(out.capacity).toBeGreaterThanOrEqual(out.wastewaterFlow);
          const more = drained(washbasin + 10);
          if (more.status !== 'ERROR') {
            expect(outputs<{ size: number }>(more).size).toBeGreaterThanOrEqual(out.size);
          }
        },
      ),
    );
  });
});
