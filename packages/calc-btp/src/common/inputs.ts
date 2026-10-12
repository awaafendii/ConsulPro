import { quantity } from '@consulpro/calc-core';
import { z } from 'zod';

/*
 * Schémas d'entrée communs aux moteurs BTP. Les bornes physiques sont larges : elles
 * écartent les saisies absurdes (signe, ordre de grandeur), pas les choix de conception.
 */

/** Longueur strictement positive, au plus `max` mètres. */
export const length = (max = 1000) => quantity('length', { min: 0, exclusiveMin: true, max });

/** Surface strictement positive, au plus `max` m². */
export const area = (max = 1e6) => quantity('area', { min: 0, exclusiveMin: true, max });

/** Surface positive ou nulle (déductions). */
export const areaOrZero = (max = 1e6) => quantity('area', { min: 0, max });

/** Volume positif ou nul, au plus `max` m³. */
export const volume = (max = 1e7) => quantity('volume', { min: 0, max });

/** Nombre entier d'éléments identiques. */
export const count = (max = 100_000) => z.number().int().min(1).max(max);

export const yesNo = z.enum(['YES', 'NO']);

/** Nomenclature d'aciers : barres de même diamètre et de même longueur, par ligne. */
export const barSchedule = z
  .array(
    z.object({
      diameter: quantity('length', { min: 0.004, max: 0.05 }),
      length: length(50),
      count: count(),
    }),
  )
  .max(200);

/** Choix du mode d'estimation des aciers (absent : ratio, hypothèse tracée). */
export const steelFields = {
  steelMode: z.enum(['RATIO', 'SCHEDULE']).optional(),
  schedule: barSchedule.optional(),
};

/** Une nomenclature est exigée quand le mode « nomenclature » est choisi. */
export function scheduleRequired(
  input: {
    steelMode?: 'RATIO' | 'SCHEDULE' | undefined;
    schedule?: readonly unknown[] | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  if (input.steelMode === 'SCHEDULE' && (input.schedule?.length ?? 0) === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['schedule'],
      message: 'Nomenclature d’aciers vide : ajoutez au moins une ligne de barres.',
      params: { code: 'SCHEDULE_REQUIRED' },
    });
  }
}

/** Présentations réutilisées dans les formulaires. */
export const LENGTH_UNITS = ['m', 'cm'] as const;
export const SMALL_LENGTH_UNITS = ['cm', 'm', 'mm'] as const;

export const STEEL_PRESENTATION = [
  {
    key: 'steelMode',
    label: 'Estimation des aciers',
    kind: 'enum',
    optional: true,
    options: [
      { value: 'RATIO', label: 'Ratio du référentiel (kg/m³)' },
      { value: 'SCHEDULE', label: 'Nomenclature saisie' },
    ],
    help: 'Sans choix : ratio du référentiel d’usages (hypothèse tracée).',
  },
  {
    key: 'schedule',
    label: 'Nomenclature d’aciers',
    kind: 'list',
    optional: true,
    maxItems: 200,
    fields: [
      { key: 'diameter', label: 'Diamètre', kind: 'quantity', unitKind: 'length', units: ['mm'] },
      {
        key: 'length',
        label: 'Longueur d’une barre',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
      },
      { key: 'count', label: 'Nombre de barres', kind: 'integer', min: 1 },
    ],
  },
] as const;
