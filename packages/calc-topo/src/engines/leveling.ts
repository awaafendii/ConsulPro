import { checkLimit, fromSI, ok, quantity, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { TOPO_HYPOTHESIS } from '../common/geometry';

/*
 * Nivellement direct (03-modules.md §3.4) : lectures arrière/avant, dénivelées, fermeture sur
 * un repère connu (ou en boucle), compensation proportionnelle au nombre de stations, altitudes
 * compensées. La tolérance de fermeture est un paramètre explicite (TO_VERIFY).
 */

const altitude = quantity('length', { min: -1e4, max: 1e4 });
/** Lecture sur mire (0 à 10 m). */
const reading = quantity('length', { min: 0, max: 10 });

const station = z.object({ back: reading, fore: reading });

const levelingInput = z.object({
  startElevation: altitude,
  endElevation: altitude.optional(),
  stations: z.array(station).min(1).max(1000),
});
const levelingOutput = z.object({
  deltaSum: z.number(),
  computedEndElevation: z.number(),
  knownEndElevation: z.number(),
  closure: z.number(),
  stationCount: z.number().int().positive(),
  correctionPerStation: z.number(),
  compensatedEndElevation: z.number(),
});

export const topoLeveling: EngineDefinition<
  z.output<typeof levelingInput>,
  z.output<typeof levelingOutput>
> = {
  id: 'topo.leveling',
  version: '1.0.0',
  discipline: 'TOPO',
  title: 'Nivellement direct',
  inputSchema: levelingInput,
  outputSchema: levelingOutput,
  parameters: [
    {
      key: 'topo.leveling.closure_tolerance_coeff',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Coefficient de tolérance de fermeture de nivellement (× √n)',
    },
  ],
  formulas: [
    {
      id: 'leveling',
      label: 'Dénivelées, fermeture et compensation',
      latex:
        '\\delta_i = AR_i - AV_i ; \\; Z_{calc} = Z_0 + \\sum \\delta_i ; \\; f = Z_{calc} - Z_{conn} ; \\; c = -f / n',
      symbols: [
        { symbol: 'AR', meaning: 'lecture arrière', unit: 'm' },
        { symbol: 'AV', meaning: 'lecture avant', unit: 'm' },
        { symbol: 'f', meaning: 'erreur de fermeture', unit: 'm' },
        { symbol: 'c', meaning: 'correction par station', unit: 'm' },
      ],
      source: 'Topométrie — nivellement direct par cheminement',
    },
  ],
  hypotheses: [TOPO_HYPOTHESIS],
  presentation: {
    description:
      'Dénivelées par station, altitude calculée, erreur de fermeture sur un repère connu (ou en boucle), correction par station et altitude compensée.',
    inputs: [
      {
        key: 'startElevation',
        label: 'Altitude du repère de départ',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
      },
      {
        key: 'endElevation',
        label: 'Altitude du repère d’arrivée',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
        help: 'Sans saisie : cheminement en boucle (arrivée = départ).',
      },
      {
        key: 'stations',
        label: 'Stations (lectures arrière et avant)',
        kind: 'list',
        maxItems: 1000,
        fields: [
          { key: 'back', label: 'Lecture arrière', kind: 'quantity', unitKind: 'length', units: ['m'] },
          { key: 'fore', label: 'Lecture avant', kind: 'quantity', unitKind: 'length', units: ['m'] },
        ],
      },
    ],
    outputs: [
      { key: 'deltaSum', label: 'Somme des dénivelées', unit: 'm', precision: 4 },
      { key: 'computedEndElevation', label: 'Altitude calculée à l’arrivée', unit: 'm', precision: 4 },
      { key: 'knownEndElevation', label: 'Altitude connue à l’arrivée', unit: 'm', precision: 4 },
      { key: 'closure', label: 'Erreur de fermeture', unit: 'm', precision: 4 },
      { key: 'stationCount', label: 'Nombre de stations', unit: '1', precision: 0 },
      { key: 'correctionPerStation', label: 'Correction par station', unit: 'm', precision: 4 },
      { key: 'compensatedEndElevation', label: 'Altitude compensée à l’arrivée', unit: 'm', precision: 4 },
    ],
  },
  calculate(i, ctx) {
    const deltas = i.stations.map((s) => s.back.si - s.fore.si);
    const deltaSum = deltas.reduce((a, b) => a + b, 0);
    const computedEnd = i.startElevation.si + deltaSum;
    if (i.endElevation === undefined) {
      ctx.assume.defaulted(
        'endElevation',
        i.startElevation.value,
        'Altitude d’arrivée non saisie : cheminement en boucle (arrivée = départ).',
      );
    }
    const knownEnd = i.endElevation?.si ?? i.startElevation.si;
    const closure = computedEnd - knownEnd;
    const n = i.stations.length;
    const correction = -closure / n;
    ctx.trace.step({
      id: 'T1',
      label: 'Somme des dénivelées',
      formula: '\\sum \\delta_i = \\sum (AR_i - AV_i)',
      substitutions: [{ symbol: 'n', value: n }],
      value: deltaSum,
      unit: 'm',
    });
    ctx.trace.step({
      id: 'T2',
      label: 'Fermeture sur le repère connu',
      formula: 'f = (Z_0 + \\sum \\delta_i) - Z_{conn}',
      substitutions: [
        { symbol: 'Z_0', value: i.startElevation.si, unit: 'm' },
        { symbol: 'Z_{conn}', value: knownEnd, unit: 'm' },
      ],
      value: closure,
      unit: 'm',
    });
    // Altitudes compensées, station par station (altitude compensée du point aval de chaque station).
    let elevation = i.startElevation.si;
    deltas.forEach((delta, index) => {
      elevation += delta + correction;
      ctx.trace.step({
        id: `S${String(index + 1)}`,
        label: `Altitude compensée après la station ${String(index + 1)}`,
        formula: 'Z_{k} = Z_{k-1} + \\delta_k + c',
        substitutions: [
          { symbol: '\\delta_k', value: delta, unit: 'm' },
          { symbol: 'c', value: correction, unit: 'm' },
        ],
        value: elevation,
        unit: 'm',
      });
    });
    return ok({
      deltaSum,
      computedEndElevation: computedEnd,
      knownEndElevation: knownEnd,
      closure,
      stationCount: n,
      correctionPerStation: correction,
      compensatedEndElevation: elevation,
    });
  },
  verify(_input, output, ctx) {
    const coeffMm = ctx.params.scalar('topo.leveling.closure_tolerance_coeff', 'mm');
    const toleranceMm = coeffMm * Math.sqrt(output.stationCount);
    return [
      checkLimit({
        rule: 'topo.leveling.closure',
        label: 'Fermeture de nivellement dans la tolérance',
        measured: Math.abs(fromSI(output.closure, 'mm')),
        limit: toleranceMm,
        comparison: '<=',
        severity: 'BLOCKING',
        unit: 'mm',
      }),
    ];
  },
};
