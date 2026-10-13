import { run } from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';

import {
  elecCableSizing,
  elecCircuit,
  elecDesignCurrent,
  elecPowerBalance,
  elecProtection,
  elecVoltageDrop,
} from '../index';
import { NFC, seedParams } from './seed';

/* Comportements non couverts par les cas de référence : trace, surcharges, limites du référentiel. */

const q = (value: number, unit: string) => ({ value, unit });
const sizing = (inputs: Record<string, unknown>, overrides = {}) =>
  run(
    elecCableSizing,
    {
      current: q(20, 'A'),
      device: 'BREAKER',
      system: 'MONO',
      method: 'C',
      insulation: 'PVC',
      ambient: q(30, 'degC'),
      ...inputs,
    },
    seedParams(elecCableSizing, [], overrides),
  );
const row = (code: string, parent: string | null, type: 'BOARD' | 'LOAD', extra = {}) => ({
  code,
  parent,
  type,
  designation: null,
  power: null,
  count: null,
  ku: null,
  cosPhi: null,
  ks: null,
  ...extra,
});
const load = (code: string, parent: string, kw = 1) =>
  row(code, parent, 'LOAD', { power: q(kw, 'kW'), cosPhi: 0.9, count: 1, ku: 1 });
const balance = (tree: unknown[]) =>
  run(
    elecPowerBalance,
    { tree, system: 'TRI', voltage: q(400, 'V') },
    seedParams(elecPowerBalance),
  );

describe('traçabilité', () => {
  it('chaque étape porte sa formule ; le courant d’emploi ne lit aucun paramètre', () => {
    const result = run(
      elecDesignCurrent,
      { power: q(2, 'kW'), system: 'TRI', voltage: q(400, 'V'), cosPhi: q(0.8, '1') },
      seedParams(elecDesignCurrent),
    );
    expect(result.status).toBe('OK');
    expect(result.trace.map((s) => s.formula)).toEqual([
      'I_B = \\frac{P}{\\sqrt{3}\\, U \\cos\\varphi}',
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('section : calibre, facteurs, section ; les paramètres lus sont signalés « à vérifier »', () => {
    const result = sizing({});
    expect(result.trace.map((s) => s.id)).toEqual(['T1', 'T2', 'T3']);
    expect(result.trace[2]?.source).toContain('52H');
    const used = result.parameters.filter((p) => p.used).map((p) => p.key);
    // Circuit seul : la table de groupement n'est pas lue.
    expect(used).not.toContain('elec.cable.grouping_factor');
    expect(result.warnings.map((w) => w.parameterKey).sort()).toEqual([...used].sort());
  });

  it('bilan : une étape par tableau, désignation comprise, puis l’origine', () => {
    const result = balance([
      row('TGBT', null, 'BOARD', { designation: 'Général' }),
      row('TD', 'TGBT', 'BOARD'),
      load('L1', 'TD'),
      load('L2', 'TGBT'),
    ]);
    expect(result.trace.map((s) => s.label)).toEqual([
      'Tableau TD',
      'Tableau TGBT — Général',
      'Origine de l’installation',
    ]);
  });
});

describe('arborescence refusée', () => {
  it('repère en double, amont inconnu ou non tableau, départ incomplet, boucle', () => {
    const result = balance([
      row('TGBT', null, 'BOARD'),
      load('L1', 'TGBT'),
      load('L1', 'TGBT'),
      load('L2', 'INCONNU'),
      load('L3', 'L1'),
      row('L4', 'TGBT', 'LOAD', { power: q(1, 'kW') }),
      row('A', 'B', 'BOARD'),
      row('B', 'A', 'BOARD'),
    ]);
    expect(result.status).toBe('INVALID');
    expect(result.errors.map((e) => e.path)).toEqual([
      'tree.2.code',
      'tree.3.parent',
      'tree.4.parent',
      'tree.5.power',
      'tree.6.parent',
      'tree.7.parent',
    ]);
  });

  it('un tableau sans départ : avertissement ; aucune puissance : erreur, jamais un résultat', () => {
    const empty = balance([
      row('TGBT', null, 'BOARD'),
      row('TD', 'TGBT', 'BOARD'),
      load('L', 'TGBT'),
    ]);
    expect(empty.status).toBe('OK_WITH_WARNINGS');
    expect(empty.warnings.map((w) => w.code)).toContain('ELEC.EMPTY_BOARD');
    const none = balance([row('TGBT', null, 'BOARD')]);
    expect(none.status).toBe('ERROR');
    expect(none.failure?.code).toBe('ZERO_POWER');
    expect(none.outputs).toBeNull();
  });
});

describe('limites du référentiel : erreur, jamais une valeur', () => {
  it('calibre saisi hors gamme normalisée, ou absent de la gamme du dispositif', () => {
    const odd = sizing({ rating: q(17, 'A') });
    expect(odd.status).toBe('ERROR');
    expect(odd.failure?.code).toBe('PARAMETER_ACCESS');
    const missing = sizing({ current: q(300, 'A'), rating: q(315, 'A') });
    expect(missing.status).toBe('ERROR');
    expect(missing.failure?.message).toContain('elec.protection.k2 : calibre de 315 A absent');
  });

  it('aucun calibre ou aucune section ne convient', () => {
    expect(sizing({ current: q(700, 'A') }).failure?.code).toBe('NO_RATING');
    expect(sizing({ current: q(600, 'A'), method: 'B' }).failure?.code).toBe('NO_SECTION');
    expect(
      run(
        elecCircuit,
        {
          power: q(500, 'kW'),
          system: 'TRI',
          voltage: q(400, 'V'),
          cosPhi: q(0.8, '1'),
          length: q(10, 'm'),
          device: 'BREAKER',
          method: 'C',
          insulation: 'PVC',
          ambient: q(30, 'degC'),
          usage: 'OTHER',
          supply: 'PUBLIC_LV',
        },
        seedParams(elecCircuit),
      ).failure?.code,
    ).toBe('NO_RATING');
    expect(
      run(
        elecCircuit,
        {
          power: q(300, 'kW'),
          system: 'TRI',
          voltage: q(400, 'V'),
          cosPhi: q(0.8, '1'),
          length: q(10, 'm'),
          device: 'BREAKER',
          method: 'B',
          insulation: 'PVC',
          ambient: q(30, 'degC'),
          usage: 'OTHER',
          supply: 'PUBLIC_LV',
        },
        seedParams(elecCircuit),
      ).failure?.code,
    ).toBe('NO_SECTION');
    expect(
      run(
        elecProtection,
        { current: q(700, 'A'), iz: q(800, 'A'), device: 'BREAKER', circuitType: 'OTHER' },
        seedParams(elecProtection),
      ).failure?.code,
    ).toBe('NO_RATING');
  });

  it('température au-delà de la table : pas d’extrapolation', () => {
    const hot = sizing({ ambient: q(65, 'degC') });
    expect(hot.status).toBe('ERROR');
    expect(hot.failure?.message).toContain('hors de l');
  });

  it('une case vide dans une table surchargée est une erreur', () => {
    const table = NFC.parameters.find((p) => p.key === 'elec.cable.temperature_factor');
    if (table?.kind !== 'TABLE') throw new Error('table');
    const result = sizing(
      {},
      {
        'elec.cable.temperature_factor': {
          kind: 'TABLE',
          table: { ...table.table, cells: table.table.cells.map(() => null) },
        },
      },
    );
    expect(result.status).toBe('ERROR');
    expect(result.failure?.message).toContain('ne définit pas de valeur');
  });
});

describe('surcharges de paramètres', () => {
  it('une limite de chute de tension surchargée change le verdict et le signale', () => {
    const inputs = {
      current: q(16, 'A'),
      length: q(30, 'm'),
      section: q(2.5, 'mm2'),
      material: 'CU',
      system: 'MONO',
      voltage: q(230, 'V'),
      cosPhi: q(0.9, '1'),
      usage: 'OTHER',
      supply: 'PUBLIC_LV',
    };
    expect(run(elecVoltageDrop, inputs, seedParams(elecVoltageDrop)).status).toBe(
      'OK_WITH_WARNINGS',
    );
    const strict = run(
      elecVoltageDrop,
      inputs,
      seedParams(elecVoltageDrop, [], {
        'elec.voltage_drop.limit': {
          kind: 'TABLE',
          table: {
            axes: [
              { name: 'supply', kind: 'CATEGORY', values: ['PUBLIC_LV', 'PRIVATE_SUBSTATION'] },
              { name: 'usage', kind: 'CATEGORY', values: ['LIGHTING', 'OTHER'] },
            ],
            unit: '%',
            cells: [3, 3, 6, 8],
          },
        },
      }),
    );
    expect(strict.status).toBe('NON_COMPLIANT');
    expect(strict.warnings.map((w) => w.code)).toContain('PARAMETER_OVERRIDDEN');
  });

  it('un ks saisi pour un tableau prime sur le référentiel', () => {
    const tree = [
      row('TGBT', null, 'BOARD', { ks: 0.5 }),
      load('L1', 'TGBT', 10),
      load('L2', 'TGBT', 10),
    ];
    const result = balance(tree);
    expect((result.outputs as { absorbedPower: number }).absorbedPower).toBeCloseTo(10, 9);
    expect(result.trace[0]?.source).toBe('ks saisi pour ce tableau');
  });
});

describe('unités de saisie, calibres et étapes conditionnelles', () => {
  const dropInputs = {
    current: q(16, 'A'),
    length: q(30, 'm'),
    section: q(2.5, 'mm2'),
    material: 'CU',
    system: 'MONO',
    voltage: q(230, 'V'),
    cosPhi: q(0.9, '1'),
    usage: 'OTHER',
    supply: 'PUBLIC_LV',
  };

  it('le résultat ne dépend pas de l’unité de saisie', () => {
    const cumulative = (inputs: Record<string, unknown>) =>
      (
        run(elecVoltageDrop, { ...dropInputs, ...inputs }, seedParams(elecVoltageDrop)).outputs as {
          cumulativePercent: number;
        }
      ).cumulativePercent;
    const reference = cumulative({ upstreamDrop: q(2, '%') });
    expect(cumulative({ upstreamDrop: q(0.02, '1') })).toBeCloseTo(reference, 9);
    expect(cumulative({ upstreamDrop: q(2, '%'), length: q(0.03, 'km') })).toBeCloseTo(
      reference,
      9,
    );
    const rcd = (sensitivity: { value: number; unit: string }) =>
      run(
        elecProtection,
        {
          current: q(10, 'A'),
          iz: q(24, 'A'),
          device: 'BREAKER',
          circuitType: 'SOCKETS',
          rcdSensitivity: sensitivity,
        },
        seedParams(elecProtection),
      ).checks.find((c) => c.rule === 'elec.protection.rcd-sockets');
    expect(rcd(q(0.03, 'A'))?.measured).toBeCloseTo(30, 9);
    expect(rcd(q(30, 'mA'))?.measured).toBe(30);
  });

  it('calibre saisi : I2 = k2 · In est tracé ; calibre déduit : les cases vides sont sautées', () => {
    const given = sizing({ rating: q(20, 'A') });
    expect(given.trace[0]?.value).toBeCloseTo(1.45 * 20, 9);
    // 315 A n'existe pas en disjoncteur, 320 A n'existe pas en fusible gG (référentiel).
    const rating = (device: string) =>
      (
        run(
          elecProtection,
          { current: q(300, 'A'), iz: q(400, 'A'), device, circuitType: 'OTHER' },
          seedParams(elecProtection),
        ).outputs as { rating: number }
      ).rating;
    expect(rating('BREAKER')).toBe(320);
    expect(rating('FUSE_GG')).toBe(315);
  });

  it('sensibilité différentielle nulle refusée ; Icc et pouvoir de coupure vont ensemble', () => {
    const protection = (inputs: Record<string, unknown>) =>
      run(
        elecProtection,
        { current: q(10, 'A'), iz: q(24, 'A'), device: 'BREAKER', circuitType: 'OTHER', ...inputs },
        seedParams(elecProtection),
      );
    expect(protection({ rcdSensitivity: q(0, 'mA') }).errors.map((e) => e.path)).toEqual([
      'rcdSensitivity.value',
    ]);
    const alone = protection({ shortCircuit: q(6, 'kA') }).errors;
    expect(alone.map((e) => e.path)).toEqual(['breakingCapacity']);
    expect(alone[0]?.message).toContain('se renseignent ensemble');
    expect(protection({ breakingCapacity: q(6, 'kA') }).errors.map((e) => e.path)).toEqual([
      'shortCircuit',
    ]);
  });

  it('circuit : l’étape d’augmentation de section n’apparaît que si la chute l’impose', () => {
    const circuit = (meters: number) =>
      run(
        elecCircuit,
        {
          power: q(15, 'kW'),
          system: 'TRI',
          voltage: q(400, 'V'),
          cosPhi: q(0.85, '1'),
          length: q(meters, 'm'),
          device: 'BREAKER',
          method: 'C',
          insulation: 'PVC',
          ambient: q(30, 'degC'),
          usage: 'OTHER',
          supply: 'PUBLIC_LV',
        },
        seedParams(elecCircuit),
      );
    const short = circuit(10);
    expect(short.trace.map((s) => s.id)).not.toContain('T5');
    const long = circuit(150);
    const t5 = long.trace.find((s) => s.id === 'T5');
    const out = long.outputs as { section: number; thermalSection: number };
    expect(out.section).toBeGreaterThan(out.thermalSection);
    expect(t5?.value).toBe(out.section);
  });

  it('un courant admissible égal au courant requis suffit (I_z ≥ requis)', () => {
    // Disjoncteur 32 A, méthode B, PVC, 2 conducteurs chargés, 30 °C : I_z(4 mm²) = 32 A.
    const result = sizing({ current: q(32, 'A'), method: 'B' });
    expect((result.outputs as { section: number; izTable: number }).section).toBe(4);
    expect((result.outputs as { izTable: number }).izTable).toBe(32);
  });

  it('chaque échec explique la cause', () => {
    for (const failure of [
      sizing({ current: q(700, 'A') }).failure,
      sizing({ current: q(600, 'A'), method: 'B' }).failure,
    ]) {
      expect(failure?.message.length).toBeGreaterThan(20);
    }
  });
});
