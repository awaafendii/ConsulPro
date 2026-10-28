import { checkLimit, ok, quantity, type Check, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { TOPO_HYPOTHESIS } from '../common/geometry';

/*
 * Contrôle (03-modules.md §3.4) : écarts entre coordonnées théoriques et levées (ΔX, ΔY, ΔZ,
 * écart planimétrique), comparés aux tolérances du projet ou de l'organisation (TO_VERIFY).
 */

const coordinate = quantity('length', { min: -1e8, max: 1e8 });
const altitude = quantity('length', { min: -1e4, max: 1e4 });

const controlInput = z
  .object({
    xT: coordinate,
    yT: coordinate,
    zT: altitude.optional(),
    xM: coordinate,
    yM: coordinate,
    zM: altitude.optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.zT === undefined) !== (v.zM === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [v.zT === undefined ? 'zT' : 'zM'],
        message: 'Altitude théorique et altitude levée : fournir les deux ou aucune.',
        params: { code: 'ALTITUDE_PAIR' },
      });
    }
  });
const controlOutput = z.object({
  deltaX: z.number(),
  deltaY: z.number(),
  deltaZ: z.number().nullable(),
  planimetricDeviation: z.number().nonnegative(),
  altimetricDeviation: z.number().nonnegative().nullable(),
});

export const topoControl: EngineDefinition<
  z.output<typeof controlInput>,
  z.output<typeof controlOutput>
> = {
  id: 'topo.control',
  version: '1.0.0',
  discipline: 'TOPO',
  title: 'Contrôle de points',
  inputSchema: controlInput,
  outputSchema: controlOutput,
  parameters: [
    {
      key: 'topo.control.planimetric_tolerance',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Tolérance d’écart planimétrique au contrôle',
    },
    {
      key: 'topo.control.altimetric_tolerance',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Tolérance d’écart altimétrique au contrôle',
    },
  ],
  formulas: [
    {
      id: 'control',
      label: 'Écarts au contrôle',
      latex:
        '\\Delta X = X_M - X_T ; \\; \\Delta Y = Y_M - Y_T ; \\; e_p = \\sqrt{\\Delta X^2 + \\Delta Y^2} ; \\; \\Delta Z = Z_M - Z_T',
      symbols: [
        { symbol: 'T', meaning: 'coordonnées théoriques', unit: 'm' },
        { symbol: 'M', meaning: 'coordonnées levées', unit: 'm' },
        { symbol: 'e_p', meaning: 'écart planimétrique', unit: 'm' },
      ],
      source: 'Topométrie — contrôle de coordonnées',
    },
  ],
  hypotheses: [TOPO_HYPOTHESIS],
  presentation: {
    description:
      'Écarts entre coordonnées théoriques et levées (ΔX, ΔY, ΔZ, écart planimétrique) et comparaison aux tolérances.',
    inputs: [
      { key: 'xT', label: 'X théorique (Est)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      { key: 'yT', label: 'Y théorique (Nord)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      {
        key: 'zT',
        label: 'Altitude théorique',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
        help: 'Contrôle altimétrique : fournir l’altitude théorique et l’altitude levée, ou aucune.',
      },
      { key: 'xM', label: 'X levé (Est)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      { key: 'yM', label: 'Y levé (Nord)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      {
        key: 'zM',
        label: 'Altitude levée',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
      },
    ],
    outputs: [
      { key: 'deltaX', label: 'Écart ΔX (Est)', unit: 'm', precision: 4 },
      { key: 'deltaY', label: 'Écart ΔY (Nord)', unit: 'm', precision: 4 },
      { key: 'deltaZ', label: 'Écart ΔZ (altitude)', unit: 'm', precision: 4 },
      { key: 'planimetricDeviation', label: 'Écart planimétrique', unit: 'm', precision: 4 },
      { key: 'altimetricDeviation', label: 'Écart altimétrique', unit: 'm', precision: 4 },
    ],
  },
  calculate(i, ctx) {
    const deltaX = i.xM.si - i.xT.si;
    const deltaY = i.yM.si - i.yT.si;
    const planimetricDeviation = Math.hypot(deltaX, deltaY);
    const deltaZ = i.zT !== undefined && i.zM !== undefined ? i.zM.si - i.zT.si : null;
    ctx.trace.step({
      id: 'T1',
      label: 'Écarts de coordonnées',
      formula: '\\Delta X = X_M - X_T ; \\; \\Delta Y = Y_M - Y_T',
      substitutions: [
        { symbol: '\\Delta X', value: deltaX, unit: 'm' },
        { symbol: '\\Delta Y', value: deltaY, unit: 'm' },
      ],
      value: planimetricDeviation,
      unit: 'm',
    });
    return ok({
      deltaX,
      deltaY,
      deltaZ,
      planimetricDeviation,
      altimetricDeviation: deltaZ === null ? null : Math.abs(deltaZ),
    });
  },
  verify(_input, output, ctx) {
    const checks: Check[] = [
      checkLimit({
        rule: 'topo.control.planimetric',
        label: 'Écart planimétrique dans la tolérance',
        measured: output.planimetricDeviation,
        limit: ctx.params.scalar('topo.control.planimetric_tolerance', 'm'),
        comparison: '<=',
        severity: 'BLOCKING',
        unit: 'm',
      }),
    ];
    if (output.altimetricDeviation !== null) {
      checks.push(
        checkLimit({
          rule: 'topo.control.altimetric',
          label: 'Écart altimétrique dans la tolérance',
          measured: output.altimetricDeviation,
          limit: ctx.params.scalar('topo.control.altimetric_tolerance', 'm'),
          comparison: '<=',
          severity: 'WARNING',
          unit: 'm',
        }),
      );
    }
    return checks;
  },
};
