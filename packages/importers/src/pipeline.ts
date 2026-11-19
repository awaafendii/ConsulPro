/**
 * Assemblage pur du pipeline d'import : une grille de chaînes devient des lignes typées prêtes
 * pour `validateRows` du domaine. Chaque ligne est projetée selon le rapprochement des colonnes
 * (automatique par défaut) puis ses cellules sont coercées vers les types attendus. Déterministe.
 */

import type { ColumnDefinition } from '@consulpro/domain';

import { coerceRow } from './coerce';
import { parseDelimited, type Delimiter, type Grid } from './delimited';
import { detectFormat } from './detect';
import { applyMapping, autoMap, type ColumnMapping } from './mapping';
import { parseXlsx } from './xlsx';

/**
 * Lit des octets source en grille de chaînes : un classeur XLSX est reconnu par sa signature et
 * lu par SheetJS ; tout le reste est décodé en texte (UTF-8) et analysé comme délimité. Le
 * séparateur est deviné sauf s'il est imposé. Déterministe.
 */
export function readGrid(bytes: Uint8Array, delimiter?: Delimiter): Grid {
  if (detectFormat(bytes) === 'xlsx') return parseXlsx(bytes);
  return parseDelimited(new TextDecoder().decode(bytes), delimiter);
}

/**
 * Transforme une grille en lignes typées (enregistrements clé → valeur) selon les colonnes du
 * type. `mapping` rattache les colonnes aux en-têtes (auto-mapping par défaut) ; `units` impose,
 * par clé de colonne, l'unité des grandeurs. La validation reste à la charge du domaine.
 */
export function gridToRows(
  columns: readonly ColumnDefinition[],
  grid: Grid,
  mapping: readonly ColumnMapping[] = autoMap(columns, grid.headers),
  units: Readonly<Record<string, string>> = {},
): Record<string, unknown>[] {
  return grid.rows.map((row) => coerceRow(columns, applyMapping(mapping, row), units));
}
