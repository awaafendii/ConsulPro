import { z } from 'zod';

import { findUnit, type UnitKind, type UnitOfKind } from './registry';

/**
 * Grandeur saisie et validée : valeur et unité d'origine, plus sa valeur en SI.
 * Les moteurs calculent sur `si` ; `value` et `unit` sont conservés pour la traçabilité.
 */
export interface Measured<K extends UnitKind = UnitKind> {
  readonly value: number;
  readonly unit: UnitOfKind<K>;
  readonly si: number;
}

export interface QuantityBounds {
  /** Bornes exprimées en SI. */
  readonly min?: number;
  readonly max?: number;
  readonly exclusiveMin?: boolean;
  readonly exclusiveMax?: boolean;
}

/**
 * Schéma Zod d'une grandeur `{ value, unit }` d'une grandeur donnée, avec bornes physiques en SI.
 * Codes d'erreur : `UNIT_INCOMPATIBLE`, `OUT_OF_RANGE`.
 */
export function quantity<K extends UnitKind>(kind: K, bounds: QuantityBounds = {}) {
  return z.object({ value: z.number(), unit: z.string() }).transform((input, ctx): Measured<K> => {
    const def = findUnit(input.unit);
    if (def?.kind !== kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['unit'],
        message: `Unité « ${input.unit} » incompatible avec la grandeur ${kind}`,
        params: { code: 'UNIT_INCOMPATIBLE' },
      });
      return z.NEVER;
    }
    const si = input.value * def.factor + def.offset;
    const { min, max, exclusiveMin = false, exclusiveMax = false } = bounds;
    const belowMin = min !== undefined && (exclusiveMin ? si <= min : si < min);
    const aboveMax = max !== undefined && (exclusiveMax ? si >= max : si > max);
    if (belowMin || aboveMax) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: describeBounds(bounds),
        params: { code: 'OUT_OF_RANGE' },
      });
      return z.NEVER;
    }
    return { value: input.value, unit: def.symbol as UnitOfKind<K>, si };
  });
}

function describeBounds({ min, max, exclusiveMin, exclusiveMax }: QuantityBounds): string {
  const parts: string[] = [];
  if (min !== undefined) parts.push(`${exclusiveMin ? '>' : '≥'} ${min}`);
  if (max !== undefined) parts.push(`${exclusiveMax ? '<' : '≤'} ${max}`);
  return `Valeur hors du domaine admissible (en SI : ${parts.join(' et ')})`;
}
