import { fromSI, ok, quantity, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { normalizeAngle, TAU, TOPO_HYPOTHESIS } from '../common/geometry';

/*
 * Levé par rayonnement (03-modules.md §3.4) : point levé depuis une station orientée, avec
 * réduction de la distance inclinée à l'horizontale et calcul de l'altitude. Géométrie pure.
 *
 * Angle zénithal compté depuis le zénith : 100 gon = visée horizontale. D_h = D sin V,
 * dénivelée instrumentale = D cos V, puis Δh = D cos V + h_i − h_v.
 */

const coordinate = quantity('length', { min: -1e8, max: 1e8 });
const altitude = quantity('length', { min: -1e4, max: 1e4 });
const orientation = quantity('angle', { min: 0, max: TAU + 1e-6 });
const reading = quantity('angle', { min: 0, max: TAU + 1e-6 });
/** Angle zénithal dans [0 ; π] (0 à 200 gon), le zénith valant 0. */
const zenith = quantity('angle', { min: 0, max: Math.PI + 1e-6 });
const slopeDistance = quantity('length', { min: 0, exclusiveMin: true, max: 1e5 });
/** Hauteur d'instrument ou de voyant (0 à 10 m). */
const height = quantity('length', { min: 0, max: 10 });

const surveyInput = z.object({
  xS: coordinate,
  yS: coordinate,
  zS: altitude,
  instrumentHeight: height.optional(),
  orientation,
  horizontalReading: reading,
  slopeDistance,
  zenithAngle: zenith,
  targetHeight: height.optional(),
});
const surveyOutput = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  horizontalDistance: z.number().nonnegative(),
  deltaH: z.number(),
  bearing: z.number().min(0).lt(TAU),
});

export const topoRadiationSurvey: EngineDefinition<
  z.output<typeof surveyInput>,
  z.output<typeof surveyOutput>
> = {
  id: 'topo.radiation-survey',
  version: '1.0.0',
  discipline: 'TOPO',
  title: 'Levé par rayonnement',
  inputSchema: surveyInput,
  outputSchema: surveyOutput,
  parameters: [],
  formulas: [
    {
      id: 'reduction',
      label: 'Réduction à l’horizontale et dénivelée',
      latex:
        'D_h = D \\sin V ; \\; \\Delta h = D \\cos V + h_i - h_v ; \\; G = G_0 + H_z',
      symbols: [
        { symbol: 'D', meaning: 'distance inclinée', unit: 'm' },
        { symbol: 'V', meaning: 'angle zénithal (zénith = 0)', unit: 'gon' },
        { symbol: 'h_i', meaning: 'hauteur de l’instrument', unit: 'm' },
        { symbol: 'h_v', meaning: 'hauteur du voyant', unit: 'm' },
      ],
      source: 'Topométrie — rayonnement tridimensionnel',
    },
    {
      id: 'coordinates',
      label: 'Coordonnées du point levé',
      latex: 'X = X_S + D_h \\sin G ; \\; Y = Y_S + D_h \\cos G ; \\; Z = Z_S + \\Delta h',
      symbols: [{ symbol: 'G', meaning: 'gisement de la visée', unit: 'gon' }],
      source: 'Topométrie — rayonnement',
    },
  ],
  hypotheses: [TOPO_HYPOTHESIS],
  presentation: {
    description:
      'Coordonnées et altitude d’un point levé par rayonnement depuis une station orientée, distance inclinée réduite à l’horizontale.',
    inputs: [
      { key: 'xS', label: 'X de la station (Est)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      { key: 'yS', label: 'Y de la station (Nord)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      { key: 'zS', label: 'Altitude de la station', kind: 'quantity', unitKind: 'length', units: ['m'] },
      {
        key: 'instrumentHeight',
        label: 'Hauteur de l’instrument',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m', 'cm'],
        optional: true,
        help: 'Sans saisie : 0 (visée au sol de la station).',
      },
      {
        key: 'orientation',
        label: 'Orientation (gisement du zéro du limbe)',
        kind: 'quantity',
        unitKind: 'angle',
        units: ['gon', 'deg', 'rad'],
      },
      {
        key: 'horizontalReading',
        label: 'Lecture horizontale vers le point',
        kind: 'quantity',
        unitKind: 'angle',
        units: ['gon', 'deg', 'rad'],
      },
      {
        key: 'slopeDistance',
        label: 'Distance inclinée mesurée',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
      },
      {
        key: 'zenithAngle',
        label: 'Angle zénithal',
        kind: 'quantity',
        unitKind: 'angle',
        units: ['gon', 'deg', 'rad'],
        help: 'Compté depuis le zénith : 100 gon pour une visée horizontale.',
      },
      {
        key: 'targetHeight',
        label: 'Hauteur du voyant',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m', 'cm'],
        optional: true,
        help: 'Sans saisie : 0.',
      },
    ],
    outputs: [
      { key: 'x', label: 'X du point levé (Est)', unit: 'm', precision: 3 },
      { key: 'y', label: 'Y du point levé (Nord)', unit: 'm', precision: 3 },
      { key: 'z', label: 'Altitude du point levé', unit: 'm', precision: 3 },
      { key: 'horizontalDistance', label: 'Distance horizontale', unit: 'm', precision: 3 },
      { key: 'deltaH', label: 'Dénivelée station → point', unit: 'm', precision: 3 },
      { key: 'bearing', label: 'Gisement de la visée', unit: 'gon', precision: 4 },
    ],
  },
  calculate(i, ctx) {
    const hi = i.instrumentHeight?.si ?? 0;
    const hv = i.targetHeight?.si ?? 0;
    if (i.instrumentHeight === undefined) {
      ctx.assume.defaulted('instrumentHeight', 0, 'Hauteur d’instrument non saisie : 0 retenu.');
    }
    if (i.targetHeight === undefined) {
      ctx.assume.defaulted('targetHeight', 0, 'Hauteur de voyant non saisie : 0 retenu.');
    }
    const g = normalizeAngle(i.orientation.si + i.horizontalReading.si);
    const horizontal = i.slopeDistance.si * Math.sin(i.zenithAngle.si);
    const deltaH = i.slopeDistance.si * Math.cos(i.zenithAngle.si) + hi - hv;
    ctx.trace.step({
      id: 'T1',
      label: 'Gisement de la visée',
      formula: 'G = G_0 + H_z',
      substitutions: [
        { symbol: 'G_0', value: fromSI(i.orientation.si, 'gon'), unit: 'gon' },
        { symbol: 'H_z', value: fromSI(i.horizontalReading.si, 'gon'), unit: 'gon' },
      ],
      value: fromSI(g, 'gon'),
      unit: 'gon',
    });
    ctx.trace.step({
      id: 'T2',
      label: 'Réduction à l’horizontale et dénivelée',
      formula: 'D_h = D \\sin V ; \\; \\Delta h = D \\cos V + h_i - h_v',
      substitutions: [
        { symbol: 'D', value: i.slopeDistance.si, unit: 'm' },
        { symbol: 'V', value: fromSI(i.zenithAngle.si, 'gon'), unit: 'gon' },
        { symbol: 'h_i', value: hi, unit: 'm' },
        { symbol: 'h_v', value: hv, unit: 'm' },
      ],
      value: horizontal,
      unit: 'm',
    });
    ctx.trace.step({
      id: 'T3',
      label: 'Coordonnées du point levé',
      formula: 'X = X_S + D_h \\sin G ; \\; Y = Y_S + D_h \\cos G ; \\; Z = Z_S + \\Delta h',
      value: deltaH,
      unit: 'm',
    });
    return ok({
      x: i.xS.si + horizontal * Math.sin(g),
      y: i.yS.si + horizontal * Math.cos(g),
      z: i.zS.si + deltaH,
      horizontalDistance: horizontal,
      deltaH,
      bearing: g,
    });
  },
  verify() {
    return [];
  },
};
