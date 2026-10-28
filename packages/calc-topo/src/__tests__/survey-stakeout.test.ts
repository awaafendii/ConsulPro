import { run } from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';

import { topoRadiationSurvey, topoStakeout } from '../index';
import { seedParams } from './seed';

/* Levé par rayonnement et implantation : cas vérifiés, réduction à l'horizontale, valeurs par défaut. */

const q = (value: number, unit: string) => ({ value, unit });
const outputs = <T>(result: { outputs: T | null }): T => {
  if (result.outputs === null) throw new Error('Résultat sans sorties');
  return result.outputs;
};

const stake = (inputs: Record<string, unknown>) =>
  run(topoStakeout, inputs, seedParams(topoStakeout));
const survey = (inputs: Record<string, unknown>) =>
  run(topoRadiationSurvey, inputs, seedParams(topoRadiationSurvey));

describe('implantation', () => {
  it('angle horizontal = gisement − orientation ; distance exacte', () => {
    const base = { xS: q(1000, 'm'), yS: q(1000, 'm'), xT: q(1100, 'm'), yT: q(1100, 'm') };
    const north = outputs<{ horizontalAngle: number; distance: number; bearing: number }>(
      stake({ ...base, orientation: q(0, 'gon') }),
    );
    expect(north.bearing).toBeCloseTo(Math.PI / 4, 12);
    expect(north.horizontalAngle).toBeCloseTo(Math.PI / 4, 12);
    expect(north.distance).toBeCloseTo(Math.hypot(100, 100), 9);
    // Orientée sur la cible : l'angle à afficher est nul.
    const aligned = outputs<{ horizontalAngle: number }>(stake({ ...base, orientation: q(50, 'gon') }));
    expect(aligned.horizontalAngle).toBeCloseTo(0, 9);
  });

  it('un point confondu avec la station : avertissement, angle et distance nuls', () => {
    const result = stake({
      xS: q(500, 'm'),
      yS: q(500, 'm'),
      orientation: q(0, 'gon'),
      xT: q(500, 'm'),
      yT: q(500, 'm'),
    });
    expect(result.status).toBe('OK_WITH_WARNINGS');
    expect(result.warnings.map((w) => w.code)).toContain('TOPO.NULL_DISTANCE');
    expect(outputs<{ distance: number; horizontalAngle: number }>(result)).toMatchObject({
      distance: 0,
      horizontalAngle: 0,
    });
  });
});

describe('levé par rayonnement', () => {
  it('visée horizontale (100 gon) : distance conservée, dénivelée = h_i − h_v', () => {
    const result = survey({
      xS: q(1000, 'm'),
      yS: q(1000, 'm'),
      zS: q(100, 'm'),
      instrumentHeight: q(1.5, 'm'),
      orientation: q(0, 'gon'),
      horizontalReading: q(50, 'gon'),
      slopeDistance: q(100, 'm'),
      zenithAngle: q(100, 'gon'),
      targetHeight: q(1.5, 'm'),
    });
    expect(result.status).toBe('OK');
    const out = outputs<{ x: number; y: number; z: number; horizontalDistance: number; deltaH: number }>(
      result,
    );
    expect(out.horizontalDistance).toBeCloseTo(100, 9);
    expect(out.deltaH).toBeCloseTo(0, 9);
    expect(out.z).toBeCloseTo(100, 9);
    expect(out.x).toBeCloseTo(1000 + 100 * Math.sin(Math.PI / 4), 9);
    expect(out.y).toBeCloseTo(1000 + 100 * Math.cos(Math.PI / 4), 9);
  });

  it('visée montante : réduction à l’horizontale et dénivelée positive', () => {
    const zenithRad = 90 * (Math.PI / 200);
    const out = outputs<{ horizontalDistance: number; deltaH: number }>(
      survey({
        xS: q(0, 'm'),
        yS: q(0, 'm'),
        zS: q(0, 'm'),
        instrumentHeight: q(1.6, 'm'),
        orientation: q(0, 'gon'),
        horizontalReading: q(0, 'gon'),
        slopeDistance: q(100, 'm'),
        zenithAngle: q(90, 'gon'),
        targetHeight: q(2, 'm'),
      }),
    );
    expect(out.horizontalDistance).toBeCloseTo(100 * Math.sin(zenithRad), 9);
    expect(out.deltaH).toBeCloseTo(100 * Math.cos(zenithRad) + 1.6 - 2, 9);
    expect(out.horizontalDistance).toBeLessThan(100);
  });

  it('hauteurs non saisies : 0 retenu, hypothèses enregistrées', () => {
    const result = survey({
      xS: q(0, 'm'),
      yS: q(0, 'm'),
      zS: q(50, 'm'),
      orientation: q(0, 'gon'),
      horizontalReading: q(0, 'gon'),
      slopeDistance: q(100, 'm'),
      zenithAngle: q(80, 'gon'),
    });
    const fields = result.hypotheses.filter((h) => h.origin === 'DEFAULT_VALUE').map((h) => h.field);
    expect(fields).toEqual(expect.arrayContaining(['instrumentHeight', 'targetHeight']));
    const out = outputs<{ deltaH: number }>(result);
    expect(out.deltaH).toBeCloseTo(100 * Math.cos(80 * (Math.PI / 200)), 9);
  });

  it('un angle zénithal hors de [0 ; 200 gon] est refusé', () => {
    const result = survey({
      xS: q(0, 'm'),
      yS: q(0, 'm'),
      zS: q(0, 'm'),
      orientation: q(0, 'gon'),
      horizontalReading: q(0, 'gon'),
      slopeDistance: q(100, 'm'),
      zenithAngle: q(260, 'gon'),
    });
    expect(result.status).toBe('INVALID');
    expect(result.errors.map((e) => e.path)).toContain('zenithAngle.value');
  });
});
