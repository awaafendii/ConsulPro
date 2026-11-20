import { run } from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';

import { topoCoordinates } from '../index';
import { seedParams } from './seed';

/* Comportements du moteur de coordonnées : les deux modes, la trace, les refus de saisie. */

const q = (value: number, unit: string) => ({ value, unit });
const params = seedParams(topoCoordinates);
const coord = (inputs: Record<string, unknown>) => run(topoCoordinates, inputs, params);

const outputs = <T>(result: { outputs: T | null }): T => {
  if (result.outputs === null) throw new Error('Résultat sans sorties');
  return result.outputs;
};

describe('problème inverse (gisement et distance)', () => {
  it('ΔX, ΔY, distance et gisement entre deux points ; trace en trois étapes', () => {
    const result = coord({
      mode: 'JOIN',
      x1: q(1000, 'm'),
      y1: q(1000, 'm'),
      x2: q(1100, 'm'),
      y2: q(1100, 'm'),
    });
    expect(result.status).toBe('OK');
    const out = outputs<{ bearing: number; distance: number; deltaX: number; deltaY: number }>(
      result,
    );
    expect(out.deltaX).toBeCloseTo(100, 9);
    expect(out.deltaY).toBeCloseTo(100, 9);
    expect(out.distance).toBeCloseTo(Math.hypot(100, 100), 9);
    expect(out.bearing).toBeCloseTo(Math.PI / 4, 12);
    expect(result.trace.map((s) => s.id)).toEqual(['T1', 'T2', 'T3']);
    expect(result.trace[2]?.unit).toBe('gon');
    expect(result.trace[2]?.value).toBeCloseTo(50, 9);
  });

  it('un point au sud-ouest donne un gisement dans le troisième quadrant (250 gon)', () => {
    const out = outputs<{ bearing: number }>(
      coord({ mode: 'JOIN', x1: q(1000, 'm'), y1: q(1000, 'm'), x2: q(900, 'm'), y2: q(900, 'm') }),
    );
    expect(out.bearing).toBeCloseTo((5 * Math.PI) / 4, 12);
  });

  it('deux points confondus : distance nulle, gisement 0, avertissement', () => {
    const result = coord({
      mode: 'JOIN',
      x1: q(500, 'm'),
      y1: q(500, 'm'),
      x2: q(500, 'm'),
      y2: q(500, 'm'),
    });
    expect(result.status).toBe('OK_WITH_WARNINGS');
    expect(result.warnings.map((w) => w.code)).toContain('TOPO.NULL_DISTANCE');
    expect(outputs<{ bearing: number; distance: number }>(result)).toMatchObject({
      bearing: 0,
      distance: 0,
    });
  });
});

describe('problème direct (rayonnement)', () => {
  it('point lancé depuis une station ; trace en deux étapes', () => {
    const result = coord({
      mode: 'RADIATION',
      x1: q(1000, 'm'),
      y1: q(1000, 'm'),
      bearing: q(50, 'gon'),
      distance: q(Math.hypot(100, 100), 'm'),
    });
    expect(result.status).toBe('OK');
    const out = outputs<{ x: number; y: number }>(result);
    expect(out.x).toBeCloseTo(1100, 9);
    expect(out.y).toBeCloseTo(1100, 9);
    expect(result.trace.map((s) => s.id)).toEqual(['T1', 'T2']);
  });

  it('le résultat ne dépend pas de l’unité angulaire de saisie (gon, degrés, radians)', () => {
    const point = (b: { value: number; unit: string }) =>
      outputs<{ x: number; y: number }>(
        coord({
          mode: 'RADIATION',
          x1: q(0, 'm'),
          y1: q(0, 'm'),
          bearing: b,
          distance: q(100, 'm'),
        }),
      );
    const gon = point(q(50, 'gon'));
    expect(point(q(45, 'deg')).x).toBeCloseTo(gon.x, 9);
    expect(point(q(Math.PI / 4, 'rad')).y).toBeCloseTo(gon.y, 9);
  });

  it('un tour complet (400 gon) équivaut au gisement nul', () => {
    const out = outputs<{ bearing: number; y: number }>(
      coord({
        mode: 'RADIATION',
        x1: q(0, 'm'),
        y1: q(0, 'm'),
        bearing: q(400, 'gon'),
        distance: q(100, 'm'),
      }),
    );
    // 400 gon ne vaut pas exactement 2π : le gisement normalisé est voisin de 0, le point visé plein Nord.
    expect(out.bearing).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(100, 9);
  });
});

describe('saisies refusées : aucune valeur produite', () => {
  it('problème inverse sans point visé', () => {
    const result = coord({ mode: 'JOIN', x1: q(0, 'm'), y1: q(0, 'm') });
    expect(result.status).toBe('INVALID');
    expect(result.errors.map((e) => e.path).sort()).toEqual(['x2', 'y2']);
    expect(result.outputs).toBeNull();
  });

  it('rayonnement avec une distance nulle', () => {
    const result = coord({
      mode: 'RADIATION',
      x1: q(0, 'm'),
      y1: q(0, 'm'),
      bearing: q(50, 'gon'),
      distance: q(0, 'm'),
    });
    expect(result.status).toBe('INVALID');
    expect(result.errors.map((e) => e.path)).toContain('distance.value');
  });

  it('un mode inconnu', () => {
    expect(coord({ mode: 'OTHER', x1: q(0, 'm'), y1: q(0, 'm') }).status).toBe('INVALID');
  });
});
