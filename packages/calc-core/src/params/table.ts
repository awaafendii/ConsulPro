import { err, ok, type Result } from '../result/result';
import { findUnit, fromSI, toSI } from '../units/registry';
import type { NumericAxis, TableValue } from './parameter';

export interface TableError {
  readonly code:
    | 'TABLE_INVALID'
    | 'AXIS_MISSING'
    | 'CATEGORY_UNKNOWN'
    | 'COORDINATE_TYPE'
    | 'OUT_OF_RANGE'
    | 'NOT_ON_GRID'
    | 'CELL_UNDEFINED';
  readonly message: string;
}

export interface TableReading {
  /** Valeur dans l'unité des cellules. */
  readonly value: number;
  readonly unit: TableValue['unit'];
  readonly si: number;
}

/** Coordonnées : chaîne pour un axe catégoriel, nombre en SI pour un axe numérique. */
export type TableCoordinates = Readonly<Record<string, string | number>>;

const GRID_TOLERANCE = 1e-9;

function sameValue(a: number, b: number): boolean {
  return Math.abs(a - b) <= GRID_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
}

export function validateTable(table: TableValue): Result<TableValue, TableError> {
  if (table.axes.length === 0) {
    return err({ code: 'TABLE_INVALID', message: 'Une table doit avoir au moins un axe.' });
  }
  if (!findUnit(table.unit)) {
    return err({ code: 'TABLE_INVALID', message: `Unité de cellule inconnue : ${table.unit}` });
  }
  const names = new Set<string>();
  let expectedCells = 1;
  for (const axis of table.axes) {
    if (names.has(axis.name)) {
      return err({ code: 'TABLE_INVALID', message: `Axe en double : ${axis.name}` });
    }
    names.add(axis.name);
    if (axis.values.length === 0) {
      return err({ code: 'TABLE_INVALID', message: `Axe vide : ${axis.name}` });
    }
    if (axis.kind === 'CATEGORY') {
      if (new Set(axis.values).size !== axis.values.length) {
        return err({
          code: 'TABLE_INVALID',
          message: `Catégories en double sur l'axe ${axis.name}`,
        });
      }
    } else {
      if (!findUnit(axis.unit)) {
        return err({ code: 'TABLE_INVALID', message: `Unité inconnue sur l'axe ${axis.name}` });
      }
      for (let i = 1; i < axis.values.length; i++) {
        if (!((axis.values[i] ?? Number.NaN) > (axis.values[i - 1] ?? Number.NaN))) {
          return err({
            code: 'TABLE_INVALID',
            message: `Les valeurs de l'axe ${axis.name} doivent être strictement croissantes.`,
          });
        }
      }
    }
    expectedCells *= axis.values.length;
  }
  if (table.cells.length !== expectedCells) {
    return err({
      code: 'TABLE_INVALID',
      message: `Nombre de cellules incorrect : ${table.cells.length} au lieu de ${expectedCells}.`,
    });
  }
  return ok(table);
}

type Weighted = readonly { readonly index: number; readonly weight: number }[];

function numericPositions(axis: NumericAxis, si: number): Result<Weighted, TableError> {
  const x = fromSI(si, axis.unit);
  const values = axis.values;
  const first = values[0] ?? Number.NaN;
  const last = values[values.length - 1] ?? Number.NaN;
  const exact = values.findIndex((v) => sameValue(v, x));
  if (exact >= 0) return ok([{ index: exact, weight: 1 }]);

  const outOfRange = (): Result<Weighted, TableError> =>
    err({
      code: 'OUT_OF_RANGE',
      message: `Coordonnée ${x} hors de l'axe ${axis.name} [${first} ; ${last}] (pas d'extrapolation).`,
    });

  switch (axis.lookup) {
    case 'EXACT':
      return err({
        code: 'NOT_ON_GRID',
        message: `La coordonnée ${x} ne figure pas sur l'axe ${axis.name} (lecture exacte exigée).`,
      });
    case 'NEXT_UPPER': {
      const i = values.findIndex((v) => v > x);
      return i < 0 ? outOfRange() : ok([{ index: i, weight: 1 }]);
    }
    case 'NEXT_LOWER': {
      const i = values.findLastIndex((v) => v < x);
      return i < 0 ? outOfRange() : ok([{ index: i, weight: 1 }]);
    }
    case 'LINEAR': {
      const upper = values.findIndex((v) => v > x);
      if (upper <= 0) return outOfRange();
      const lo = values[upper - 1] ?? Number.NaN;
      const hi = values[upper] ?? Number.NaN;
      const t = (x - lo) / (hi - lo);
      return ok([
        { index: upper - 1, weight: 1 - t },
        { index: upper, weight: t },
      ]);
    }
  }
}

/**
 * Lit une table (interpolation multilinéaire sur les axes `LINEAR`).
 * Toute cellule `null` participant à la lecture rend la lecture impossible.
 */
export function readTable(
  table: TableValue,
  coordinates: TableCoordinates,
): Result<TableReading, TableError> {
  const perAxis: Weighted[] = [];
  for (const axis of table.axes) {
    const coordinate = coordinates[axis.name];
    if (coordinate === undefined) {
      return err({
        code: 'AXIS_MISSING',
        message: `Coordonnée manquante pour l'axe ${axis.name}.`,
      });
    }
    if (axis.kind === 'CATEGORY') {
      if (typeof coordinate !== 'string') {
        return err({
          code: 'COORDINATE_TYPE',
          message: `L'axe ${axis.name} attend une catégorie.`,
        });
      }
      const index = axis.values.indexOf(coordinate);
      if (index < 0) {
        return err({
          code: 'CATEGORY_UNKNOWN',
          message: `Catégorie « ${coordinate} » inconnue sur l'axe ${axis.name}.`,
        });
      }
      perAxis.push([{ index, weight: 1 }]);
    } else {
      if (typeof coordinate !== 'number') {
        return err({
          code: 'COORDINATE_TYPE',
          message: `L'axe ${axis.name} attend une valeur numérique.`,
        });
      }
      const positions = numericPositions(axis, coordinate);
      if (!positions.ok) return positions;
      perAxis.push(positions.value);
    }
  }

  let total = 0;
  const visit = (axisIndex: number, offset: number, weight: number): TableError | null => {
    if (axisIndex === table.axes.length) {
      const cell = table.cells[offset];
      if (cell === null || cell === undefined) {
        return {
          code: 'CELL_UNDEFINED',
          message: 'La table ne définit pas de valeur pour ces coordonnées.',
        };
      }
      total += weight * cell;
      return null;
    }
    const stride = table.axes
      .slice(axisIndex + 1)
      .reduce((product, axis) => product * axis.values.length, 1);
    for (const { index, weight: w } of perAxis[axisIndex] ?? []) {
      const failure = visit(axisIndex + 1, offset + index * stride, weight * w);
      if (failure) return failure;
    }
    return null;
  };
  const failure = visit(0, 0, 1);
  if (failure) return err(failure);
  return ok({ value: total, unit: table.unit, si: toSI(total, table.unit) });
}
