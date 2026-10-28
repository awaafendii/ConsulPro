import { fromSI, ok, quantity, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { join, normalizeAngle, TAU, TOPO_HYPOTHESIS } from '../common/geometry';

/*
 * Implantation (03-modules.md §3.4) : depuis une station orientée, angle horizontal à afficher
 * et distance horizontale vers chaque point à implanter. Géométrie pure, aucun paramètre.
 */

const coordinate = quantity('length', { min: -1e8, max: 1e8 });
/** Gisement du zéro du limbe (orientation de la station) dans [0 ; 2π]. */
const orientation = quantity('angle', { min: 0, max: TAU + 1e-6 });

const stakeoutInput = z.object({
  xS: coordinate,
  yS: coordinate,
  orientation,
  xT: coordinate,
  yT: coordinate,
});
const stakeoutOutput = z.object({
  horizontalAngle: z.number().min(0).lt(TAU),
  distance: z.number().nonnegative(),
  bearing: z.number().min(0).lt(TAU),
});

export const topoStakeout: EngineDefinition<
  z.output<typeof stakeoutInput>,
  z.output<typeof stakeoutOutput>
> = {
  id: 'topo.stakeout',
  version: '1.0.0',
  discipline: 'TOPO',
  title: 'Implantation d’un point',
  inputSchema: stakeoutInput,
  outputSchema: stakeoutOutput,
  parameters: [],
  formulas: [
    {
      id: 'stakeout',
      label: 'Angle et distance d’implantation',
      latex:
        'G = \\operatorname{atan2}(X_T - X_S, Y_T - Y_S) ; \\; H_z = G - G_0 ; \\; D = \\sqrt{(X_T - X_S)^2 + (Y_T - Y_S)^2}',
      symbols: [
        { symbol: 'G', meaning: 'gisement station → point', unit: 'gon' },
        { symbol: 'G_0', meaning: 'gisement du zéro du limbe (orientation)', unit: 'gon' },
        { symbol: 'H_z', meaning: 'angle horizontal à afficher', unit: 'gon' },
        { symbol: 'D', meaning: 'distance horizontale', unit: 'm' },
      ],
      source: 'Topométrie — implantation polaire',
    },
  ],
  hypotheses: [TOPO_HYPOTHESIS],
  presentation: {
    description:
      'Fiche d’implantation : angle horizontal et distance depuis une station orientée vers un point à implanter.',
    inputs: [
      { key: 'xS', label: 'X de la station (Est)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      { key: 'yS', label: 'Y de la station (Nord)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      {
        key: 'orientation',
        label: 'Orientation (gisement du zéro du limbe)',
        kind: 'quantity',
        unitKind: 'angle',
        units: ['gon', 'deg', 'rad'],
        help: 'Gisement correspondant à la lecture horizontale nulle, après mise en station orientée.',
      },
      { key: 'xT', label: 'X du point à implanter (Est)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      { key: 'yT', label: 'Y du point à implanter (Nord)', kind: 'quantity', unitKind: 'length', units: ['m'] },
    ],
    outputs: [
      { key: 'horizontalAngle', label: 'Angle horizontal à afficher', unit: 'gon', precision: 4 },
      { key: 'distance', label: 'Distance horizontale', unit: 'm', precision: 3 },
      { key: 'bearing', label: 'Gisement station → point', unit: 'gon', precision: 4 },
    ],
  },
  calculate(i, ctx) {
    const r = join({ x: i.xS.si, y: i.yS.si }, { x: i.xT.si, y: i.yT.si });
    if (r.distance === 0) {
      ctx.warn.warn(
        'TOPO.NULL_DISTANCE',
        'Le point à implanter coïncide avec la station : distance nulle, angle indéterminé (0 retenu).',
      );
    }
    const horizontalAngle = normalizeAngle(r.bearing - i.orientation.si);
    ctx.trace.step({
      id: 'T1',
      label: 'Gisement station → point',
      formula: 'G = \\operatorname{atan2}(X_T - X_S, Y_T - Y_S)',
      substitutions: [
        { symbol: '\\Delta X', value: r.deltaX, unit: 'm' },
        { symbol: '\\Delta Y', value: r.deltaY, unit: 'm' },
      ],
      value: fromSI(r.bearing, 'gon'),
      unit: 'gon',
    });
    ctx.trace.step({
      id: 'T2',
      label: 'Angle horizontal à afficher',
      formula: 'H_z = G - G_0',
      substitutions: [
        { symbol: 'G', value: fromSI(r.bearing, 'gon'), unit: 'gon' },
        { symbol: 'G_0', value: fromSI(i.orientation.si, 'gon'), unit: 'gon' },
      ],
      value: fromSI(horizontalAngle, 'gon'),
      unit: 'gon',
    });
    ctx.trace.step({
      id: 'T3',
      label: 'Distance horizontale',
      formula: 'D = \\sqrt{\\Delta X^2 + \\Delta Y^2}',
      value: r.distance,
      unit: 'm',
    });
    return ok({ horizontalAngle, distance: r.distance, bearing: r.bearing });
  },
  verify() {
    return [];
  },
};
