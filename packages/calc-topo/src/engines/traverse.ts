import { checkLimit, err, fromSI, ok, quantity, type Check, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { normalizeAngle, TAU, TOPO_HYPOTHESIS } from '../common/geometry';

/*
 * Polygonale (03-modules.md §3.4) : cheminement fermé, encadré ou ouvert. Transmission des
 * gisements par les angles de station (angles à droite), fermeture angulaire et compensation
 * (répartition égale), fermeture planimétrique f_X / f_Y / f_L, compensation de Bowditch
 * (proportionnelle aux longueurs) et précision relative. Tolérances explicites (TO_VERIFY).
 *
 * Convention : angle de station = angle horizontal à droite (sens horaire) de la visée arrière
 * vers la visée avant. Transmission : G_k = G_{k-1} + angle_k − 200 gon. Le premier tronçon est
 * orienté par le gisement de départ (l'angle de la première ligne est ignoré).
 */

const PI = Math.PI;

const coordinate = quantity('length', { min: -1e8, max: 1e8 });
const bearingQ = quantity('angle', { min: 0, max: TAU + 1e-6 });
const legDistance = quantity('length', { min: 0, exclusiveMin: true, max: 1e5 });

const leg = z.object({ angle: bearingQ, distance: legDistance });

const traverseInput = z.object({
  type: z.enum(['CLOSED', 'LINKED', 'OPEN']),
  x0: coordinate,
  y0: coordinate,
  initialBearing: bearingQ,
  closingBearing: bearingQ.optional(),
  endX: coordinate.optional(),
  endY: coordinate.optional(),
  legs: z.array(leg).min(1).max(1000),
});
const traverseOutput = z.object({
  angularMisclosure: z.number().nullable(),
  fX: z.number().nullable(),
  fY: z.number().nullable(),
  fL: z.number().nonnegative().nullable(),
  perimeter: z.number().positive(),
  relativePrecision: z.number().nonnegative().nullable(),
  relativeDenominator: z.number().nullable(),
  endX: z.number(),
  endY: z.number(),
  numberOfLegs: z.number().int().positive(),
});

/** Écart angulaire signé a − b ramené dans [−π ; π). */
function signedDelta(a: number, b: number): number {
  return (((a - b + PI) % TAU) + TAU) % TAU - PI;
}

export const topoTraverse: EngineDefinition<
  z.output<typeof traverseInput>,
  z.output<typeof traverseOutput>
> = {
  id: 'topo.traverse',
  version: '1.0.0',
  discipline: 'TOPO',
  title: 'Polygonale (cheminement)',
  inputSchema: traverseInput,
  outputSchema: traverseOutput,
  parameters: [
    {
      key: 'topo.traverse.angular_tolerance_coeff',
      kind: 'SCALAR',
      unitKind: 'angle',
      description: 'Coefficient de tolérance de fermeture angulaire (× √n)',
    },
    {
      key: 'topo.traverse.relative_precision_min',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Précision relative planimétrique minimale exigée',
    },
  ],
  formulas: [
    {
      id: 'bearings',
      label: 'Transmission des gisements',
      latex: 'G_k = G_{k-1} + \\alpha_k - 200^{\\text{gon}}',
      symbols: [
        { symbol: 'G_k', meaning: 'gisement du tronçon k', unit: 'gon' },
        { symbol: '\\alpha_k', meaning: 'angle de station (à droite)', unit: 'gon' },
      ],
      source: 'Topométrie — transmission des gisements',
    },
    {
      id: 'closure',
      label: 'Fermeture planimétrique et compensation de Bowditch',
      latex:
        'f_X = \\sum \\Delta X - \\Delta X_{th} ; \\; f_Y = \\sum \\Delta Y - \\Delta Y_{th} ; \\; f_L = \\sqrt{f_X^2 + f_Y^2} ; \\; \\Delta X_k^{\\prime} = \\Delta X_k - f_X \\frac{d_k}{\\sum d}',
      symbols: [
        { symbol: 'f_L', meaning: 'erreur de fermeture planimétrique', unit: 'm' },
        { symbol: 'd_k', meaning: 'longueur du tronçon k', unit: 'm' },
      ],
      source: 'Topométrie — compensation de Bowditch',
    },
  ],
  hypotheses: [
    TOPO_HYPOTHESIS,
    {
      code: 'TOPO.TRAVERSE_ANGLE',
      text: 'Angle de station = angle horizontal à droite (sens horaire) de la visée arrière vers la visée avant ; le premier tronçon est orienté par le gisement de départ.',
    },
  ],
  presentation: {
    description:
      'Fermeture angulaire et planimétrique d’un cheminement fermé, encadré ou ouvert ; compensation de Bowditch et précision relative.',
    inputs: [
      {
        key: 'type',
        label: 'Type de cheminement',
        kind: 'enum',
        options: [
          { value: 'CLOSED', label: 'Fermé (retour au point de départ)' },
          { value: 'LINKED', label: 'Encadré (entre deux points connus)' },
          { value: 'OPEN', label: 'Ouvert (sans contrôle de fermeture)' },
        ],
      },
      { key: 'x0', label: 'X du point de départ (Est)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      { key: 'y0', label: 'Y du point de départ (Nord)', kind: 'quantity', unitKind: 'length', units: ['m'] },
      {
        key: 'initialBearing',
        label: 'Gisement de départ (premier tronçon)',
        kind: 'quantity',
        unitKind: 'angle',
        units: ['gon', 'deg', 'rad'],
      },
      {
        key: 'closingBearing',
        label: 'Gisement d’arrivée connu',
        kind: 'quantity',
        unitKind: 'angle',
        units: ['gon', 'deg', 'rad'],
        optional: true,
        help: 'Permet la fermeture angulaire et sa compensation (répartition égale).',
      },
      {
        key: 'endX',
        label: 'X du point d’arrivée (Est)',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
        help: 'Polygonale encadrée uniquement.',
      },
      {
        key: 'endY',
        label: 'Y du point d’arrivée (Nord)',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
        help: 'Polygonale encadrée uniquement.',
      },
      {
        key: 'legs',
        label: 'Tronçons (angle de station et longueur)',
        kind: 'list',
        maxItems: 1000,
        fields: [
          { key: 'angle', label: 'Angle de station (à droite)', kind: 'quantity', unitKind: 'angle', units: ['gon', 'deg', 'rad'] },
          { key: 'distance', label: 'Longueur du tronçon', kind: 'quantity', unitKind: 'length', units: ['m'] },
        ],
      },
    ],
    outputs: [
      { key: 'angularMisclosure', label: 'Erreur de fermeture angulaire', unit: 'gon', precision: 4 },
      { key: 'fX', label: 'Fermeture f_X (Est)', unit: 'm', precision: 4 },
      { key: 'fY', label: 'Fermeture f_Y (Nord)', unit: 'm', precision: 4 },
      { key: 'fL', label: 'Fermeture planimétrique f_L', unit: 'm', precision: 4 },
      { key: 'perimeter', label: 'Périmètre (ΣD)', unit: 'm', precision: 3 },
      { key: 'relativePrecision', label: 'Précision relative (f_L / ΣD)', unit: '1', precision: 6 },
      { key: 'relativeDenominator', label: 'Précision relative 1 / N', unit: '1', precision: 0 },
      { key: 'endX', label: 'X d’arrivée compensé (Est)', unit: 'm', precision: 4 },
      { key: 'endY', label: 'Y d’arrivée compensé (Nord)', unit: 'm', precision: 4 },
      { key: 'numberOfLegs', label: 'Nombre de tronçons', unit: '1', precision: 0 },
    ],
  },
  calculate(i, ctx) {
    const n = i.legs.length;
    const open = i.type === 'OPEN';

    // Point d'arrivée connu (polygonale encadrée) : exigé, sinon aucune valeur.
    let end: { x: number; y: number } | null = null;
    if (i.type === 'LINKED') {
      if (i.endX === undefined || i.endY === undefined) {
        return err({
          code: 'END_REQUIRED',
          message: 'Une polygonale encadrée exige les coordonnées du point d’arrivée.',
        });
      }
      end = { x: i.endX.si, y: i.endY.si };
    }

    // Transmission des gisements (le premier tronçon est orienté par le gisement de départ).
    const segments: { distance: number; bearing: number }[] = [];
    let running = normalizeAngle(i.initialBearing.si);
    i.legs.forEach((item, k) => {
      running = k === 0 ? running : normalizeAngle(running + item.angle.si - PI);
      segments.push({ distance: item.distance.si, bearing: running });
    });

    // Compensation angulaire (répartition égale) si le gisement d'arrivée est connu.
    let misclosure: number | null = null;
    if (!open && i.closingBearing !== undefined && n >= 2) {
      const fa = signedDelta(running, i.closingBearing.si);
      misclosure = fa;
      segments.forEach((segment, k) => {
        segment.bearing = normalizeAngle(segment.bearing - (fa * k) / (n - 1));
      });
      ctx.trace.step({
        id: 'A',
        label: 'Fermeture angulaire',
        formula: 'f_a = G_n^{calc} - G_n^{conn}',
        substitutions: [{ symbol: 'f_a', value: fromSI(fa, 'gon'), unit: 'gon' }],
        value: fromSI(fa, 'gon'),
        unit: 'gon',
      });
    }

    // Accroissements par tronçon.
    let sumX = 0;
    let sumY = 0;
    let perimeter = 0;
    const deltas = segments.map((segment) => {
      const dx = segment.distance * Math.sin(segment.bearing);
      const dy = segment.distance * Math.cos(segment.bearing);
      sumX += dx;
      sumY += dy;
      perimeter += segment.distance;
      return { dx, dy, distance: segment.distance, bearing: segment.bearing };
    });
    const provEndX = i.x0.si + sumX;
    const provEndY = i.y0.si + sumY;

    // Fermeture planimétrique (fermé : retour au départ ; encadré : point connu ; ouvert : aucune).
    const target = open ? null : i.type === 'CLOSED' ? { x: i.x0.si, y: i.y0.si } : end;
    const closure =
      target === null
        ? null
        : (() => {
            const fX = provEndX - target.x;
            const fY = provEndY - target.y;
            return { fX, fY, fL: Math.hypot(fX, fY) };
          })();
    const relativePrecision = closure === null ? null : closure.fL / perimeter;
    const relativeDenominator =
      closure === null || closure.fL === 0 ? null : perimeter / closure.fL;
    const endX = target === null ? provEndX : target.x;
    const endY = target === null ? provEndY : target.y;

    // Trace : gisement et point compensé (Bowditch) de chaque tronçon.
    let cx = i.x0.si;
    let cy = i.y0.si;
    deltas.forEach((d, k) => {
      const factor = closure === null ? 0 : d.distance / perimeter;
      cx += d.dx - (closure === null ? 0 : closure.fX * factor);
      cy += d.dy - (closure === null ? 0 : closure.fY * factor);
      ctx.trace.step({
        id: `L${String(k + 1)}`,
        label: `Tronçon ${String(k + 1)}`,
        formula: 'X_k = X_{k-1} + \\Delta X_k^{\\prime} ; \\; Y_k = Y_{k-1} + \\Delta Y_k^{\\prime}',
        substitutions: [
          { symbol: 'G_k', value: fromSI(d.bearing, 'gon'), unit: 'gon' },
          { symbol: 'X_k', value: cx, unit: 'm' },
          { symbol: 'Y_k', value: cy, unit: 'm' },
        ],
        value: d.distance,
        unit: 'm',
      });
    });
    if (closure !== null) {
      ctx.trace.step({
        id: 'F',
        label: 'Fermeture planimétrique',
        formula: 'f_L = \\sqrt{f_X^2 + f_Y^2}',
        substitutions: [
          { symbol: 'f_X', value: closure.fX, unit: 'm' },
          { symbol: 'f_Y', value: closure.fY, unit: 'm' },
        ],
        value: closure.fL,
        unit: 'm',
      });
    }

    return ok({
      angularMisclosure: misclosure,
      fX: closure === null ? null : closure.fX,
      fY: closure === null ? null : closure.fY,
      fL: closure === null ? null : closure.fL,
      perimeter,
      relativePrecision,
      relativeDenominator,
      endX,
      endY,
      numberOfLegs: n,
    });
  },
  verify(input, output, ctx) {
    const checks: Check[] = [];
    if (output.relativePrecision !== null) {
      checks.push(
        checkLimit({
          rule: 'topo.traverse.relative-precision',
          label: 'Précision relative planimétrique dans la tolérance',
          measured: output.relativePrecision,
          limit: ctx.params.scalar('topo.traverse.relative_precision_min', '1'),
          comparison: '<=',
          severity: 'BLOCKING',
          unit: '1',
        }),
      );
    }
    if (output.angularMisclosure !== null) {
      const coeffGon = ctx.params.scalar('topo.traverse.angular_tolerance_coeff', 'gon');
      checks.push(
        checkLimit({
          rule: 'topo.traverse.angular-closure',
          label: 'Fermeture angulaire dans la tolérance',
          measured: Math.abs(fromSI(output.angularMisclosure, 'gon')),
          limit: coeffGon * Math.sqrt(input.legs.length),
          comparison: '<=',
          severity: 'WARNING',
          unit: 'gon',
        }),
      );
    }
    return checks;
  },
};
