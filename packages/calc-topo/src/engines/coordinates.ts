import { fromSI, ok, quantity, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { join, normalizeAngle, radiate, TAU, TOPO_HYPOTHESIS } from '../common/geometry';

/*
 * Calculs de coordonnées (03-modules.md §3.4) : problème inverse (gisement et distance entre
 * deux points) et problème direct (rayonnement d'un point lancé). Les conversions d'unités
 * angulaires (gon, degrés, radians) sont assurées par la saisie et l'affichage des grandeurs.
 * Aucun paramètre de référentiel : géométrie pure.
 */

/** Coordonnée projetée (Est ou Nord), de −100 000 km à +100 000 km. */
const coordinate = quantity('length', { min: -1e8, max: 1e8 });
/** Distance horizontale strictement positive (1 000 km au plus). */
const distance = quantity('length', { min: 0, exclusiveMin: true, max: 1e6 });
/**
 * Gisement dans [0 ; 2π] (0 à 400 gon), normalisé par le moteur. La borne haute tolère un
 * epsilon : 400 gon converti en radians dépasse 2π d'un ULP (arrondi de 400 × π/200).
 */
const bearing = quantity('angle', { min: 0, max: TAU + 1e-6 });

const joinInput = z.object({
  mode: z.literal('JOIN'),
  x1: coordinate,
  y1: coordinate,
  x2: coordinate,
  y2: coordinate,
});
const radiationInput = z.object({
  mode: z.literal('RADIATION'),
  x1: coordinate,
  y1: coordinate,
  bearing,
  distance,
});
const coordinatesInput = z.discriminatedUnion('mode', [joinInput, radiationInput]);

const coordinatesOutput = z.object({
  x: z.number(),
  y: z.number(),
  deltaX: z.number(),
  deltaY: z.number(),
  distance: z.number().nonnegative(),
  bearing: z.number().min(0).lt(TAU),
});

export const topoCoordinates: EngineDefinition<
  z.output<typeof coordinatesInput>,
  z.output<typeof coordinatesOutput>
> = {
  id: 'topo.coordinates',
  version: '1.0.0',
  discipline: 'TOPO',
  title: 'Coordonnées : gisement-distance et rayonnement',
  inputSchema: coordinatesInput,
  outputSchema: coordinatesOutput,
  parameters: [],
  formulas: [
    {
      id: 'join',
      label: 'Gisement et distance entre deux points (problème inverse)',
      latex:
        '\\Delta X = X_B - X_A ; \\; \\Delta Y = Y_B - Y_A ; \\; D = \\sqrt{\\Delta X^2 + \\Delta Y^2} ; \\; G = \\operatorname{atan2}(\\Delta X, \\Delta Y)',
      symbols: [
        { symbol: 'X', meaning: 'abscisse (Est)', unit: 'm' },
        { symbol: 'Y', meaning: 'ordonnée (Nord)', unit: 'm' },
        { symbol: 'D', meaning: 'distance horizontale', unit: 'm' },
        { symbol: 'G', meaning: 'gisement depuis le Nord, sens horaire', unit: 'gon' },
      ],
      source: 'Topométrie — convention gisement Nord (axe Y), sens horaire',
    },
    {
      id: 'radiate',
      label: 'Rayonnement d’un point lancé (problème direct)',
      latex:
        '\\Delta X = D \\sin G ; \\; \\Delta Y = D \\cos G ; \\; X_B = X_A + \\Delta X ; \\; Y_B = Y_A + \\Delta Y',
      symbols: [
        { symbol: 'D', meaning: 'distance horizontale', unit: 'm' },
        { symbol: 'G', meaning: 'gisement depuis le Nord, sens horaire', unit: 'gon' },
      ],
      source: 'Topométrie — rayonnement',
    },
  ],
  hypotheses: [TOPO_HYPOTHESIS],
  presentation: {
    description:
      'Gisement et distance entre deux points (problème inverse), ou coordonnées d’un point lancé par rayonnement (problème direct).',
    inputs: [
      {
        key: 'mode',
        label: 'Calcul',
        kind: 'enum',
        options: [
          { value: 'JOIN', label: 'Gisement et distance entre deux points' },
          { value: 'RADIATION', label: 'Rayonnement (point lancé)' },
        ],
      },
      {
        key: 'x1',
        label: 'X du point de station (Est)',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
      },
      {
        key: 'y1',
        label: 'Y du point de station (Nord)',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
      },
      {
        key: 'x2',
        label: 'X du point visé (Est)',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
        help: 'Problème inverse uniquement.',
      },
      {
        key: 'y2',
        label: 'Y du point visé (Nord)',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
        help: 'Problème inverse uniquement.',
      },
      {
        key: 'bearing',
        label: 'Gisement',
        kind: 'quantity',
        unitKind: 'angle',
        units: ['gon', 'deg', 'rad'],
        optional: true,
        help: 'Rayonnement uniquement. Compté depuis le Nord, sens horaire.',
      },
      {
        key: 'distance',
        label: 'Distance horizontale',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m', 'km'],
        optional: true,
        help: 'Rayonnement uniquement.',
      },
    ],
    outputs: [
      { key: 'bearing', label: 'Gisement', unit: 'gon', precision: 4 },
      { key: 'distance', label: 'Distance horizontale', unit: 'm', precision: 3 },
      { key: 'deltaX', label: 'Accroissement ΔX (Est)', unit: 'm', precision: 3 },
      { key: 'deltaY', label: 'Accroissement ΔY (Nord)', unit: 'm', precision: 3 },
      { key: 'x', label: 'X du point visé (Est)', unit: 'm', precision: 3 },
      { key: 'y', label: 'Y du point visé (Nord)', unit: 'm', precision: 3 },
    ],
  },
  calculate(i, ctx) {
    if (i.mode === 'JOIN') {
      const r = join({ x: i.x1.si, y: i.y1.si }, { x: i.x2.si, y: i.y2.si });
      if (r.distance === 0) {
        ctx.warn.warn(
          'TOPO.NULL_DISTANCE',
          'Les deux points sont confondus : distance nulle, gisement indéterminé (0 retenu).',
        );
      }
      ctx.trace.step({
        id: 'T1',
        label: 'Accroissements de coordonnées',
        formula: '\\Delta X = X_B - X_A ; \\; \\Delta Y = Y_B - Y_A',
        substitutions: [
          { symbol: '\\Delta X', value: r.deltaX, unit: 'm' },
          { symbol: '\\Delta Y', value: r.deltaY, unit: 'm' },
        ],
        value: r.distance,
        unit: 'm',
      });
      ctx.trace.step({
        id: 'T2',
        label: 'Distance horizontale',
        formula: 'D = \\sqrt{\\Delta X^2 + \\Delta Y^2}',
        substitutions: [
          { symbol: '\\Delta X', value: r.deltaX, unit: 'm' },
          { symbol: '\\Delta Y', value: r.deltaY, unit: 'm' },
        ],
        value: r.distance,
        unit: 'm',
      });
      ctx.trace.step({
        id: 'T3',
        label: 'Gisement',
        formula: 'G = \\operatorname{atan2}(\\Delta X, \\Delta Y) \\; (\\text{Nord, sens horaire})',
        substitutions: [
          { symbol: '\\Delta X', value: r.deltaX, unit: 'm' },
          { symbol: '\\Delta Y', value: r.deltaY, unit: 'm' },
        ],
        value: fromSI(r.bearing, 'gon'),
        unit: 'gon',
      });
      return ok({
        x: i.x2.si,
        y: i.y2.si,
        deltaX: r.deltaX,
        deltaY: r.deltaY,
        distance: r.distance,
        bearing: r.bearing,
      });
    }

    const g = normalizeAngle(i.bearing.si);
    const r = radiate({ x: i.x1.si, y: i.y1.si }, g, i.distance.si);
    ctx.trace.step({
      id: 'T1',
      label: 'Accroissements de coordonnées',
      formula: '\\Delta X = D \\sin G ; \\; \\Delta Y = D \\cos G',
      substitutions: [
        { symbol: 'D', value: i.distance.si, unit: 'm' },
        { symbol: 'G', value: fromSI(g, 'gon'), unit: 'gon' },
      ],
      value: r.deltaX,
      unit: 'm',
    });
    ctx.trace.step({
      id: 'T2',
      label: 'Coordonnées du point visé',
      formula: 'X_B = X_A + \\Delta X ; \\; Y_B = Y_A + \\Delta Y',
      substitutions: [
        { symbol: '\\Delta X', value: r.deltaX, unit: 'm' },
        { symbol: '\\Delta Y', value: r.deltaY, unit: 'm' },
      ],
      value: r.x,
      unit: 'm',
    });
    return ok({
      x: r.x,
      y: r.y,
      deltaX: r.deltaX,
      deltaY: r.deltaY,
      distance: i.distance.si,
      bearing: g,
    });
  },
  verify() {
    return [];
  },
};
