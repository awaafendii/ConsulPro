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
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly type: 'choice';
      readonly required: boolean;
      readonly options: readonly { readonly value: string; readonly label: string }[];
    }
  | {
      readonly key: string;
      readonly label: string;
      /** Nombre sans unité (coefficient, effectif). */
      readonly type: 'number';
      readonly required: boolean;
      readonly integer: boolean;
      readonly min: number;
      /** Borne basse exclue (coefficient strictement positif). */
      readonly exclusiveMin: boolean;
      readonly max: number;
    };

export interface DatasetKind {
  readonly id: string;
  readonly discipline: Discipline;
  readonly label: string;
  readonly columns: readonly ColumnDefinition[];
  readonly maxRows: number;
  /** Règles entre lignes (ex. cohérence d'une arborescence), après validation des colonnes. */
  readonly check?: (rows: readonly DatasetRow[]) => RowError[];
}

const coefficient = (key: string, label: string): ColumnDefinition => ({
  key,
  label,
  type: 'number',
  required: false,
  integer: false,
  min: 0,
  exclusiveMin: true,
  max: 1,
});

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
  ELEC_BOARD_TREE: {
    id: 'ELEC_BOARD_TREE',
    discipline: 'ELEC',
    label: 'Tableaux, départs et récepteurs',
    maxRows: 2000,
    columns: [
      { key: 'code', label: 'Repère', type: 'text', required: true, maxLength: 20 },
      {
        key: 'parent',
        label: 'Tableau amont (repère)',
        type: 'text',
        required: false,
        maxLength: 20,
      },
      {
        key: 'type',
        label: 'Nature',
        type: 'choice',
        required: true,
        options: [
          { value: 'BOARD', label: 'Tableau' },
          { value: 'LOAD', label: 'Départ / récepteurs' },
        ],
      },
      { key: 'designation', label: 'Désignation', type: 'text', required: false, maxLength: 120 },
      {
        key: 'power',
        label: 'Puissance unitaire installée',
        type: 'quantity',
        required: false,
        unitKind: 'power',
        units: ['kW', 'W'],
        positive: true,
      },
      {
        key: 'count',
        label: 'Nombre de récepteurs',
        type: 'number',
        required: false,
        integer: true,
        min: 1,
        exclusiveMin: false,
        max: 10_000,
      },
      coefficient('ku', 'Coefficient d’utilisation ku'),
      coefficient('cosPhi', 'cos φ'),
      coefficient('ks', 'Coefficient de simultanéité ks (tableau)'),
    ],
    check: (rows) => checkBoardTree(rows),
  },
} as const satisfies Record<string, DatasetKind>;

export type DatasetKindId = keyof typeof DATASET_KINDS;

export function isDatasetKind(value: string): value is DatasetKindId {
  return Object.hasOwn(DATASET_KINDS, value);
}

export type CellValue = string | number | { readonly value: number; readonly unit: string } | null;
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
      if (column.type === 'choice') {
        if (typeof cell !== 'string' || !column.options.some((o) => o.value === cell)) {
          fault(column.key, `${column.label} : choix non admis.`);
          continue;
        }
        row[column.key] = cell;
        continue;
      }
      if (column.type === 'number') {
        if (typeof cell !== 'number' || !Number.isFinite(cell)) {
          fault(column.key, `${column.label} : nombre attendu.`);
          continue;
        }
        if (column.integer && !Number.isInteger(cell)) {
          fault(column.key, `${column.label} : nombre entier attendu.`);
          continue;
        }
        const tooLow = column.exclusiveMin ? cell <= column.min : cell < column.min;
        if (tooLow || cell > column.max) {
          const bound = column.exclusiveMin ? 'supérieure à' : 'au moins égale à';
          fault(
            column.key,
            `${column.label} : valeur ${bound} ${String(column.min)} et au plus ${String(column.max)} attendue.`,
          );
          continue;
        }
        row[column.key] = cell;
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
  if (errors.length === 0 && kind.check && normalized.length > 0) {
    errors.push(...kind.check(normalized));
  }
  return errors.length > 0 ? err(errors) : ok(normalized);
}

/**
 * Arborescence électrique : repères uniques, un seul tableau d'origine (sans amont), amont
 * toujours un tableau, aucune boucle ; un départ porte puissance et cos φ, un tableau n'en a
 * pas (ils viennent de ses départs) et seul un tableau porte un ks.
 */
export function checkBoardTree(rows: readonly DatasetRow[]): RowError[] {
  const errors: RowError[] = [];
  const text = (row: DatasetRow, key: string) => {
    const value = row[key];
    return typeof value === 'string' ? value : '';
  };
  const byCode = new Map<string, DatasetRow>();
  rows.forEach((row, index) => {
    const code = text(row, 'code');
    if (byCode.has(code)) {
      errors.push({ row: index + 1, column: 'code', message: `Repère « ${code} » en double.` });
    } else byCode.set(code, row);
  });
  let roots = 0;
  rows.forEach((row, index) => {
    const line = index + 1;
    const board = text(row, 'type') === 'BOARD';
    const parent = text(row, 'parent');
    if (parent === '') {
      roots += 1;
      if (!board) {
        errors.push({
          row: line,
          column: 'parent',
          message: 'Un départ se rattache à un tableau amont.',
        });
      } else if (roots > 1) {
        errors.push({
          row: line,
          column: 'parent',
          message: 'Un seul tableau d’origine (sans amont) : rattachez ce tableau à un autre.',
        });
      }
    } else {
      const upstream = byCode.get(parent);
      if (!upstream) {
        errors.push({
          row: line,
          column: 'parent',
          message: `Tableau amont « ${parent} » inconnu.`,
        });
      } else if (text(upstream, 'type') !== 'BOARD') {
        errors.push({
          row: line,
          column: 'parent',
          message: `« ${parent} » n’est pas un tableau.`,
        });
      }
    }
    const filled = (key: string) => row[key] !== null && row[key] !== undefined;
    if (board) {
      for (const key of ['power', 'count', 'ku', 'cosPhi']) {
        if (filled(key)) {
          errors.push({
            row: line,
            column: key,
            message:
              'Un tableau n’a ni puissance ni coefficients propres : ils viennent de ses départs.',
          });
        }
      }
    } else {
      if (!filled('power')) {
        errors.push({
          row: line,
          column: 'power',
          message: 'Puissance obligatoire pour un départ.',
        });
      }
      if (!filled('cosPhi')) {
        errors.push({ row: line, column: 'cosPhi', message: 'cos φ obligatoire pour un départ.' });
      }
      if (filled('ks')) {
        errors.push({ row: line, column: 'ks', message: 'Seul un tableau porte un ks.' });
      }
    }
  });
  if (roots === 0) {
    errors.push({ row: 1, column: 'parent', message: 'Aucun tableau d’origine (sans amont).' });
  }
  // Boucles : chaque chaîne d'amont doit remonter à l'origine.
  rows.forEach((row, index) => {
    const seen = new Set<string>();
    let code = text(row, 'code');
    while (code !== '') {
      if (seen.has(code)) {
        errors.push({ row: index + 1, column: 'parent', message: 'Boucle dans l’arborescence.' });
        break;
      }
      seen.add(code);
      const current = byCode.get(code);
      code = current ? text(current, 'parent') : '';
    }
  });
  return errors;
}
