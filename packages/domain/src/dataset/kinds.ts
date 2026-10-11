import {
  err,
  findUnit,
  ok,
  type Result,
  type UnitKind,
  type UnitSymbol,
} from '@consulpro/calc-core';

import type { Discipline } from '../project/project';

/*
 * Jeux de données typés (02-modele-de-donnees.md §3.3). Chaque type déclare ses colonnes ;
 * chaque enregistrement crée une révision immuable dont les lignes sont validées ici.
 * Les types propres à chaque métier s'ajoutent avec leur phase (points topographiques en 7…).
 */

export type ColumnDefinition =
  | {
      readonly key: string;
      readonly label: string;
      readonly type: 'text';
      readonly required: boolean;
      readonly maxLength: number;
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly type: 'quantity';
      readonly required: boolean;
      readonly unitKind: UnitKind;
      /** Unités acceptées ; la première est proposée par défaut. */
      readonly units: readonly UnitSymbol[];
      /** Valeur strictement positive (en SI). */
      readonly positive: boolean;
    };

export interface DatasetKind {
  readonly id: string;
  readonly discipline: Discipline;
  readonly label: string;
  readonly columns: readonly ColumnDefinition[];
  readonly maxRows: number;
}

export const DATASET_KINDS = {
  ROOMS: {
    id: 'ROOMS',
    discipline: 'BTP',
    label: 'Pièces d’un bâtiment',
    maxRows: 5000,
    columns: [
      { key: 'name', label: 'Pièce', type: 'text', required: true, maxLength: 120 },
      { key: 'level', label: 'Niveau', type: 'text', required: false, maxLength: 40 },
      {
        key: 'area',
        label: 'Surface',
        type: 'quantity',
        required: true,
        unitKind: 'area',
        units: ['m2'],
        positive: true,
      },
      {
        key: 'height',
        label: 'Hauteur sous plafond',
        type: 'quantity',
        required: false,
        unitKind: 'length',
        units: ['m', 'cm'],
        positive: true,
      },
    ],
  },
} as const satisfies Record<string, DatasetKind>;

export type DatasetKindId = keyof typeof DATASET_KINDS;

export function isDatasetKind(value: string): value is DatasetKindId {
  return Object.hasOwn(DATASET_KINDS, value);
}

export type CellValue = string | { readonly value: number; readonly unit: string } | null;
export type DatasetRow = Readonly<Record<string, CellValue>>;

export interface RowError {
  readonly row: number;
  readonly column: string;
  readonly message: string;
}

/**
 * Valide et normalise les lignes d'un jeu de données (colonnes inconnues retirées, textes
 * rognés, cellules vides à null). Toutes les erreurs sont renvoyées, ligne par ligne.
 */
export function validateRows(
  kindId: DatasetKindId,
  rows: readonly Readonly<Record<string, unknown>>[],
): Result<DatasetRow[], RowError[]> {
  const kind: DatasetKind = DATASET_KINDS[kindId];
  const errors: RowError[] = [];
  if (rows.length > kind.maxRows) {
    return err([{ row: 0, column: '', message: `Au plus ${String(kind.maxRows)} lignes.` }]);
  }
  const normalized = rows.map((raw, index) => {
    const row: Record<string, CellValue> = {};
    const fault = (column: string, message: string) => {
      errors.push({ row: index + 1, column, message });
    };
    for (const column of kind.columns) {
      const cell = raw[column.key];
      const empty =
        cell === undefined || cell === null || (typeof cell === 'string' && cell.trim() === '');
      if (empty) {
        row[column.key] = null;
        if (column.required) fault(column.key, `${column.label} : valeur obligatoire.`);
        continue;
      }
      if (column.type === 'text') {
        if (typeof cell !== 'string') {
          fault(column.key, `${column.label} : texte attendu.`);
          continue;
        }
        const text = cell.trim();
        if (text.length > column.maxLength) {
          fault(column.key, `${column.label} : ${String(column.maxLength)} caractères au plus.`);
        }
        row[column.key] = text;
        continue;
      }
      const quantity = cell as { value?: unknown; unit?: unknown };
      const unit = typeof quantity.unit === 'string' ? findUnit(quantity.unit) : undefined;
      if (typeof quantity.value !== 'number' || !Number.isFinite(quantity.value)) {
        fault(column.key, `${column.label} : nombre attendu.`);
        continue;
      }
      if (
        unit?.kind !== column.unitKind ||
        !(column.units as readonly string[]).includes(unit.symbol)
      ) {
        fault(column.key, `${column.label} : unité non admise.`);
        continue;
      }
      if (column.positive && quantity.value <= 0) {
        fault(column.key, `${column.label} : valeur strictement positive attendue.`);
        continue;
      }
      row[column.key] = { value: quantity.value, unit: unit.symbol };
    }
    return row;
  });
  return errors.length > 0 ? err(errors) : ok(normalized);
}
