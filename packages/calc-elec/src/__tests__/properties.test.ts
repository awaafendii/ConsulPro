import { run } from '@consulpro/calc-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  elecCableSizing,
  elecCircuit,
  elecDesignCurrent,
  elecPowerBalance,
  elecProtection,
  elecVoltageDrop,
} from '../index';
import { seedParams } from './seed';

/* Propriétés (06-strategie-de-tests.md §3.3) : monotonies et conditions de protection. */

const q = (value: number, unit: string) => ({ value, unit });
/** Sorties d'un résultat calculé (jamais `null` ici : un échec fait échouer le test). */
const outputs = <T>(result: { outputs: T | null }): T => {
  if (result.outputs === null) throw new Error('Résultat sans sorties');
  return result.outputs;
};

const sizingParams = seedParams(elecCableSizing);
const dropParams = seedParams(elecVoltageDrop);
const circuitParams = seedParams(elecCircuit);
const designParams = seedParams(elecDesignCurrent);
const protectionParams = seedParams(elecProtection);

const system = fc.constantFrom('MONO', 'TRI');
const method = fc.constantFrom('B', 'C', 'E');
const insulation = fc.constantFrom('PVC', 'PR');
const device = fc.constantFrom('BREAKER', 'FUSE_GG');
const ambientC = fc.integer({ min: 10, max: 60 });
const cos = fc.double({ min: 0.5, max: 1, noNaN: true });

describe('courant d’emploi', () => {
  it('proportionnel à la puissance, décroissant avec cos φ et la tension', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 500, noNaN: true }), system, cos, (kw, sys, c) => {
        const current = (power: number, cosPhi: number, volts: number) =>
          outputs<{ current: number }>(
            run(
              elecDesignCurrent,
              {
                power: q(power, 'kW'),
                system: sys,
                voltage: q(volts, 'V'),
                cosPhi: q(cosPhi, '1'),
              },
              designParams,
            ),
          ).current;
        const base = current(kw, c, 400);
        expect(current(2 * kw, c, 400)).toBeCloseTo(2 * base, 6);
        expect(current(kw, Math.min(1, c + 0.05), 400)).toBeLessThanOrEqual(base * (1 + 1e-12));
        expect(current(kw, c, 230)).toBeGreaterThan(base);
      }),
    );
  });
});

describe('chute de tension', () => {
  it('croît avec la longueur et le courant, décroît avec la section', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100, noNaN: true }),
        fc.double({ min: 1, max: 500, noNaN: true }),
        fc.constantFrom(1.5, 2.5, 4, 6, 10, 16, 25, 35, 50),
        system,
        cos,
        fc.constantFrom('CU', 'AL'),
        (amps, meters, mm2, sys, c, material) => {
          const percent = (i: number, l: number, s: number) =>
            outputs<{ voltageDropPercent: number }>(
              run(
                elecVoltageDrop,
                {
                  current: q(i, 'A'),
                  length: q(l, 'm'),
                  section: q(s, 'mm2'),
                  material,
                  system: sys,
                  voltage: q(sys === 'MONO' ? 230 : 400, 'V'),
                  cosPhi: q(c, '1'),
                  usage: 'OTHER',
                  supply: 'PUBLIC_LV',
                },
                dropParams,
              ),
            ).voltageDropPercent;
          const base = percent(amps, meters, mm2);
          expect(base).toBeGreaterThan(0);
          expect(percent(amps, meters * 2, mm2)).toBeCloseTo(2 * base, 6);
          expect(percent(amps * 1.5, meters, mm2)).toBeCloseTo(1.5 * base, 6);
          expect(percent(amps, meters, mm2 * 2)).toBeLessThan(base);
        },
      ),
    );
  });
});

describe('section des câbles', () => {
  it('I_B ≤ I_n et I2 ≤ 1,45 I_z quand le calibre est choisi ; section croissante avec I_B', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 150, noNaN: true }),
        device,
        system,
        method,
        insulation,
        ambientC,
        fc.integer({ min: 1, max: 9 }),
        (amps, dev, sys, met, ins, theta, n) => {
          const result = (i: number) =>
            run(
              elecCableSizing,
              {
                current: q(i, 'A'),
                device: dev,
                system: sys,
                method: met,
                insulation: ins,
                ambient: q(theta, 'degC'),
                circuits: n,
                arrangement: 'BUNCHED',
              },
              sizingParams,
            );
          const first = result(amps);
          if (first.status === 'ERROR') {
            expect(['NO_RATING', 'NO_SECTION']).toContain(first.failure?.code);
            return;
          }
          const out = outputs<{
            rating: number;
            conventionalCurrent: number;
            izCorrected: number;
            section: number;
          }>(first);
          expect(out.rating).toBeGreaterThanOrEqual(amps);
          expect(out.conventionalCurrent).toBeLessThanOrEqual(1.45 * out.izCorrected * (1 + 1e-9));
          expect(first.status).toBe('OK_WITH_WARNINGS');
          const more = result(amps * 1.3);
          if (more.status !== 'ERROR') {
            expect(outputs<{ section: number }>(more).section).toBeGreaterThanOrEqual(out.section);
          }
        },
      ),
    );
  });

  it('un environnement plus chaud n’exige jamais une section plus petite', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100, noNaN: true }),
        ambientC,
        insulation,
        (amps, theta, ins) => {
          const section = (t: number) => {
            const r = run(
              elecCableSizing,
              {
                current: q(amps, 'A'),
                device: 'BREAKER',
                system: 'TRI',
                method: 'C',
                insulation: ins,
                ambient: q(t, 'degC'),
              },
              sizingParams,
            );
            return r.status === 'ERROR'
              ? Number.POSITIVE_INFINITY
              : outputs<{ section: number }>(r).section;
          };
          expect(section(Math.min(60, theta + 5))).toBeGreaterThanOrEqual(section(theta));
        },
      ),
    );
  });
});

describe('protection', () => {
  it('le verdict suit exactement les deux conditions I_B ≤ I_n et I2 ≤ 1,45 I_z', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        device,
        (amps, iz, dev) => {
          const result = run(
            elecProtection,
            { current: q(amps, 'A'), iz: q(iz, 'A'), device: dev, circuitType: 'OTHER' },
            protectionParams,
          );
          const out = outputs<{ rating: number; conventionalCurrent: number }>(result);
          const compliant = amps <= out.rating && out.conventionalCurrent <= 1.45 * iz * (1 + 1e-9);
          expect(result.status).toBe(compliant ? 'OK_WITH_WARNINGS' : 'NON_COMPLIANT');
        },
      ),
    );
  });
});

describe('circuit complet', () => {
  it('section retenue ≥ section à l’échauffement ; conforme ⇒ chute cumulée ≤ limite', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.2, max: 40, noNaN: true }),
        fc.double({ min: 1, max: 400, noNaN: true }),
        system,
        method,
        cos,
        fc.constantFrom('LIGHTING', 'OTHER'),
        (kw, meters, sys, met, c, usage) => {
          const result = run(
            elecCircuit,
            {
              power: q(kw, 'kW'),
              system: sys,
              voltage: q(sys === 'MONO' ? 230 : 400, 'V'),
              cosPhi: q(c, '1'),
              length: q(meters, 'm'),
              device: 'BREAKER',
              method: met,
              insulation: 'PVC',
              ambient: q(35, 'degC'),
              usage,
              supply: 'PUBLIC_LV',
            },
            circuitParams,
          );
          if (result.status === 'ERROR') return;
          const out = outputs<{
            section: number;
            thermalSection: number;
            cumulativePercent: number;
            limitPercent: number;
            current: number;
            rating: number;
          }>(result);
          expect(out.section).toBeGreaterThanOrEqual(out.thermalSection);
          expect(out.current).toBeLessThanOrEqual(out.rating);
          if (result.status !== 'NON_COMPLIANT') {
            expect(out.cumulativePercent).toBeLessThanOrEqual(out.limitPercent + 1e-9);
          }
        },
      ),
    );
  });
});

describe('bilan de puissance', () => {
  it('ks ≤ 1 : la puissance absorbée ne dépasse jamais la puissance installée', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kw: fc.double({ min: 0.1, max: 50, noNaN: true }),
            count: fc.integer({ min: 1, max: 20 }),
            ku: fc.double({ min: 0.1, max: 1, noNaN: true }),
            cosPhi: fc.double({ min: 0.5, max: 1, noNaN: true }),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (loads) => {
          const tree = [
            {
              code: 'TGBT',
              parent: null,
              type: 'BOARD',
              designation: null,
              power: null,
              count: null,
              ku: null,
              cosPhi: null,
              ks: null,
            },
            ...loads.map((l, k) => ({
              code: `L${String(k)}`,
              parent: 'TGBT',
              type: 'LOAD',
              designation: null,
              power: q(l.kw, 'kW'),
              count: l.count,
              ku: l.ku,
              cosPhi: l.cosPhi,
              ks: null,
            })),
          ];
          const result = run(
            elecPowerBalance,
            { tree, system: 'TRI', voltage: q(400, 'V') },
            seedParams(elecPowerBalance),
          );
          const out = outputs<{
            installedPower: number;
            absorbedPower: number;
            powerFactor: number;
            apparentPower: number;
          }>(result);
          expect(out.absorbedPower).toBeLessThanOrEqual(out.installedPower * (1 + 1e-12));
          expect(out.powerFactor).toBeGreaterThan(0);
          expect(out.powerFactor).toBeLessThanOrEqual(1);
          expect(out.apparentPower).toBeGreaterThanOrEqual(out.absorbedPower * (1 - 1e-12));
        },
      ),
    );
  });
});
