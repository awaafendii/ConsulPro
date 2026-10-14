import { ParameterReader, run, type AnyEngine } from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';

import { computeLoss, solveColebrook, tableValue } from '../common/hydraulics';
import { required } from '../common/inputs';
import {
  manholePositions,
  partialFlow,
  plumbingDrainage,
  plumbingFlowRates,
  plumbingHeadLoss,
  plumbingManholes,
  plumbingPipeSizing,
  plumbingPump,
  plumbingSepticTank,
  plumbingStorageTank,
  plumbingSupplyNetwork,
  plumbingWaterHeater,
} from '../index';
import { seedParams } from './seed';

/* Comportements non couverts par les cas de référence : convergence, avertissements, refus. */

const q = (value: number, unit: string) => ({ value, unit });
const exec = (engine: unknown, inputs: unknown, overrides = {}) => {
  const e = engine as AnyEngine;
  return run(e, inputs, seedParams(e, [], overrides));
};
const row = (
  code: string,
  parent: string | null,
  extra: Partial<{ fixture: string; count: number; elevation: number; length: number }> = {},
) => ({
  code,
  parent,
  length: q(extra.length ?? 5, 'm'),
  elevation: q(extra.elevation ?? 0, 'm'),
  location: 'FLOOR',
  fixture: extra.fixture ?? null,
  count: extra.count ?? null,
});
const network = (rows: unknown[], extra = {}) =>
  exec(plumbingSupplyNetwork, {
    network: rows,
    material: 'PVC_PN16',
    upstreamPressure: q(250, 'kPa'),
    temperature: q(25, 'degC'),
    ...extra,
  });

describe('Colebrook-White (critère de sortie de la Phase 6)', () => {
  it('converge en quelques itérations et vérifie l’équation implicite', () => {
    for (const [re, rr] of [
      [4000, 0],
      [1e5, 1e-4],
      [1e6, 1e-3],
      [1e8, 0.05],
    ] as const) {
      const solved = solveColebrook(re, rr);
      expect(solved.ok, `${String(re)} ${String(rr)}`).toBe(true);
      if (!solved.ok) continue;
      const { lambda, iterations } = solved.value;
      expect(iterations).toBeLessThanOrEqual(20);
      const residual =
        1 / Math.sqrt(lambda) + 2 * Math.log10(rr / 3.7 + 2.51 / (re * Math.sqrt(lambda)));
      expect(Math.abs(residual)).toBeLessThan(1e-9);
    }
    // Valeur de contrôle : Re = 10⁵, ε/D = 10⁻⁴ → λ ≈ 0,0185 (diagramme de Moody).
    const moody = solveColebrook(1e5, 1e-4);
    expect(moody.ok && moody.value.lambda).toBeCloseTo(0.0185, 3);
  });

  it('non-convergence : échec explicite, jamais une valeur', () => {
    expect(solveColebrook(1e5, 1e-4, { tolerance: 1e-15, maxIterations: 1 })).toEqual({
      ok: false,
      error: { iterations: 1 },
    });
    const failed = computeLoss(
      {
        flow: 1e-3,
        inner: 0.02,
        length: 10,
        roughness: 1e-5,
        water: { density: 1000, viscosity: 1e-6 },
        singular: { kind: 'RATIO', ratio: 0.1 },
      },
      { tolerance: 1e-15, maxIterations: 1 },
    );
    expect(failed).toMatchObject({ ok: false, error: { code: 'COLEBROOK_NON_CONVERGENCE' } });
  });

  it('régime laminaire : λ = 64/Re, sans itération ; débit nul : aucune perte', () => {
    const laminar = computeLoss({
      flow: 1e-6,
      inner: 0.02,
      length: 1,
      roughness: 1e-5,
      water: { density: 1000, viscosity: 1e-6 },
      singular: { kind: 'COEFFICIENTS', sum: 2 },
    });
    expect(laminar.ok && laminar.value.iterations).toBe(0);
    if (laminar.ok) expect(laminar.value.lambda).toBeCloseTo(64 / laminar.value.reynolds, 12);
    const still = computeLoss({
      flow: 0,
      inner: 0.02,
      length: 1,
      roughness: 1e-5,
      water: { density: 1000, viscosity: 1e-6 },
      singular: { kind: 'RATIO', ratio: 0.1 },
    });
    expect(still).toMatchObject({ ok: true, value: { total: 0, reynolds: 0 } });
  });

  it('écoulement de transition : signalé, λ de Colebrook retenu', () => {
    const result = exec(plumbingHeadLoss, {
      flow: q(0.0475, 'L/s'),
      material: 'PVC_PN16',
      size: q(20, 'mm'),
      length: q(5, 'm'),
      temperature: q(20, 'degC'),
    });
    expect(result.warnings.map((w) => w.code)).toContain('PLUMBING.TRANSITIONAL_FLOW');
    expect(result.trace.find((s) => s.id === 'T2')?.source).toMatch(/Colebrook-White/);
  });
});

describe('limites du référentiel : erreur, jamais une valeur', () => {
  it('tube non fabriqué, débit au-delà du catalogue', () => {
    const odd = exec(plumbingHeadLoss, {
      flow: q(0.4, 'L/s'),
      material: 'PVC_PN16',
      size: q(33, 'mm'),
      length: q(10, 'm'),
      temperature: q(25, 'degC'),
    });
    expect(odd.failure?.code).toBe('NO_SIZE');
    expect(odd.failure?.message).toContain('Ø33 n’est pas fabriqué');
    expect(
      network([row('A', null, { fixture: 'WC_FLUSH_VALVE', count: 1000 })]).failure?.code,
    ).toBe('NO_SIZE');
    expect(
      exec(plumbingDrainage, {
        wcCistern: 500,
        usage: 'INTENSIVE',
        role: 'BRANCH',
        slope: q(0.5, '%'),
      }).failure?.code,
    ).toBe('NO_SIZE');
    expect(
      exec(plumbingDrainage, { wcCistern: 500, usage: 'SPECIAL', role: 'STACK' }).failure?.code,
    ).toBe('NO_SIZE');
  });

  it('pompe sans hauteur, chauffe-eau sans élévation de température, regard hors sol', () => {
    expect(
      exec(plumbingPump, {
        flow: q(1, 'L/s'),
        geometricHeight: q(-20, 'm'),
        losses: q(10, 'kPa'),
        residualPressure: q(0, 'kPa'),
        efficiency: q(60, '%'),
      }).failure?.code,
    ).toBe('NO_PUMPING');
    expect(
      exec(
        plumbingWaterHeater,
        {
          persons: 2,
          usage: 'DWELLING',
          coldWaterTemperature: q(45, 'degC'),
          heatingTime: q(4, 'h'),
        },
        {
          'plumbing.hot_water.storage_temperature': { kind: 'SCALAR', value: 40, unit: 'degC' },
        },
      ).failure?.code,
    ).toBe('NO_HEATING');
    const shallow = exec(plumbingManholes, {
      length: q(100, 'm'),
      startDepth: q(0.3, 'm'),
      slope: q(0.5, '%'),
      groundSlope: q(2, '%'),
    });
    expect(shallow.failure?.code).toBe('INVERT_ABOVE_GROUND');
    expect(shallow.outputs).toBeNull();
  });
});

describe('gardes internes', () => {
  it('une valeur exigée par le schéma et absente est une erreur du moteur', () => {
    expect(required(3, 'x')).toBe(3);
    expect(() => {
      required(undefined, 'Pente');
    }).toThrow(/Pente : valeur exigée/);
    expect(() => required(null, 'Usagers')).toThrow(/Usagers/);
  });

  it('une case vide d’une table lue directement est une erreur de paramètre', () => {
    const engine = plumbingHeadLoss as unknown as AnyEngine;
    const ctx = {
      params: new ParameterReader(seedParams(engine), new Set(['plumbing.pipe.inner_diameter'])),
    };
    expect(() =>
      tableValue(ctx, 'plumbing.pipe.inner_diameter', { material: 'PVC_PN16', size: 0.012 }, 'mm'),
    ).toThrow(/ne définit pas de valeur/);
  });

  it('chute desservant des lavabos : les petits diamètres hors table des chutes sont sautés', () => {
    const result = exec(plumbingDrainage, { washbasin: 3, usage: 'DWELLING', role: 'STACK' });
    expect((result.outputs as { size: number }).size).toBe(75);
  });
});

describe('saisies refusées', () => {
  it('débits : saisie et inventaire à la fois', () => {
    const both = exec(plumbingFlowRates, {
      washbasin: 1,
      inventory: [{ level: null, room: null, fixture: 'SINK', count: 1 }],
    });
    expect(both.errors.map((e) => e.code)).toEqual(['SOURCE_CONFLICT']);
    expect(exec(plumbingFlowRates, { inventory: [] }).errors.map((e) => e.code)).toEqual([
      'NO_FIXTURE',
    ]);
  });

  it('réseau : repère en double, amont inconnu, boucle, appareils incomplets, aucun appareil', () => {
    const result = network([
      row('A', null),
      row('B', 'A', { fixture: 'SINK', count: 1 }),
      row('B', 'A'),
      row('C', 'X', { fixture: 'SINK', count: 1 }),
      row('D', 'E'),
      row('E', 'D'),
      { ...row('F', 'A'), fixture: 'SHOWER' },
    ]);
    expect(result.status).toBe('INVALID');
    expect(result.errors.map((e) => e.path)).toEqual([
      'network.2.code',
      'network.3.parent',
      'network.6.count',
      'network.4.parent',
      'network.5.parent',
    ]);
    expect(network([row('A', null), row('B', 'A')]).errors.map((e) => e.path)).toEqual([
      'network.0.fixture',
    ]);
    expect(
      network([row('A', 'B', { fixture: 'SINK', count: 1 }), row('B', 'A')]).errors.map(
        (e) => e.path,
      ),
    ).toContain('network.0.parent');
  });

  it('évacuation, fosse, réservoir : données manquantes ou contradictoires', () => {
    expect(exec(plumbingDrainage, { usage: 'DWELLING', role: 'STACK' }).errors[0]?.code).toBe(
      'NO_FIXTURE',
    );
    expect(exec(plumbingSepticTank, { method: 'USERS' }).errors[0]?.path).toBe('users');
    expect(
      exec(plumbingSepticTank, { method: 'ROOMS', rooms: 4, soakawayDiameter: q(1, 'm') }).errors[0]
        ?.code,
    ).toBe('PERMEABILITY_REQUIRED');
    const tank = (inputs: Record<string, unknown>) =>
      exec(plumbingStorageTank, { shape: 'CYLINDRICAL', height: q(2, 'm'), ...inputs });
    expect(tank({ dailyVolume: q(2, 'm3'), persons: 4 }).errors[0]?.code).toBe('DEMAND_CONFLICT');
    expect(tank({ persons: 4 }).errors[0]?.path).toBe('usage');
    expect(tank({ dailyVolume: q(2, 'm3'), width: q(2, 'm') }).errors[0]?.code).toBe(
      'WIDTH_NOT_APPLICABLE',
    );
    expect(
      exec(plumbingManholes, { length: q(50, 'm'), startDepth: q(0.5, 'm') }).errors[0]?.path,
    ).toBe('slope');
  });
});

describe('réseau : traçabilité, avertissements, quantités', () => {
  it('une étape par tronçon (origine d’abord), tronçon sans appareil signalé, tubes ventilés', () => {
    const result = network([
      row('A', null, { length: 10 }),
      row('B', 'A', { fixture: 'WASHBASIN', count: 2, elevation: 3 }),
      row('C', 'A', { length: 4 }),
    ]);
    expect(result.trace.map((s) => s.label.split(' :')[0])).toEqual([
      'Tronçon A',
      'Tronçon B',
      'Tronçon C',
    ]);
    expect(result.warnings.map((w) => w.code)).toContain('PLUMBING.DEAD_END');
    const pipes = (result.outputs as { pipes: { key: string; value: number }[] }).pipes;
    expect(pipes.reduce((sum, p) => sum + p.value, 0)).toBeCloseTo(19, 9);
    expect(pipes.every((p) => p.key.startsWith('PVC_PN16-'))).toBe(true);
  });

  it('acier galvanisé désigné en DN, inventaire lu ligne par ligne', () => {
    const steel = exec(plumbingPipeSizing, {
      flow: q(1, 'L/s'),
      material: 'STEEL_GALV',
      location: 'FLOOR',
    });
    expect(steel.trace[1]?.label).toMatch(/Tube acier galvanisé DN\d+$/);
    const inventory = exec(plumbingFlowRates, {
      inventory: [
        { level: 'RDC', room: 'A', fixture: 'WASHBASIN', count: 2 },
        { level: 'R+1', room: 'B', fixture: 'WASHBASIN', count: 3 },
      ],
    });
    expect((inventory.outputs as { fixtures: { value: number }[] }).fixtures).toEqual([
      expect.objectContaining({ key: 'WASHBASIN', value: 5 }),
    ]);
  });
});

describe('unités de saisie et ouvrages', () => {
  it('le résultat ne dépend pas de l’unité de saisie', () => {
    const loss = (flow: { value: number; unit: string }) =>
      (
        exec(plumbingHeadLoss, {
          flow,
          material: 'PPR_PN20',
          size: q(32, 'mm'),
          length: q(12, 'm'),
          temperature: q(25, 'degC'),
        }).outputs as { totalLoss: number }
      ).totalLoss;
    expect(loss(q(1.8, 'm3/h'))).toBeCloseTo(loss(q(0.5, 'L/s')), 9);
    expect(loss(q(30, 'L/min'))).toBeCloseTo(loss(q(0.5, 'L/s')), 9);
  });

  it('regards : extrémités, points singuliers et intermédiaires réguliers', () => {
    expect(manholePositions(60, [], 30)).toEqual([0, 30, 60]);
    expect(manholePositions(61, [], 30)).toEqual([0, 61 / 3, (2 * 61) / 3, 61]);
    expect(manholePositions(50, [10, 10], 30)).toEqual([0, 10, 30, 50]);
  });

  it('Manning-Strickler : à moitié plein, le débit vaut la moitié du débit à pleine section', () => {
    const full = partialFlow({ inner: 0.1, fill: 0.999999, slope: 0.01, strickler: 100 });
    const half = partialFlow({ inner: 0.1, fill: 0.5, slope: 0.01, strickler: 100 });
    expect(half / full).toBeCloseTo(0.5, 3);
  });

  it('fosse par pièces avec perméabilité : surface d’infiltration sans profondeur', () => {
    const result = exec(plumbingSepticTank, {
      method: 'ROOMS',
      rooms: 5,
      permeability: q(30, 'mm/h'),
    });
    const out = result.outputs as { infiltrationArea?: number; soakawayDepth?: number };
    expect(out.infiltrationArea).toBeCloseTo(0.5 / (0.5 * 0.03 * 24), 9);
    expect(out.soakawayDepth).toBeUndefined();
  });
});
