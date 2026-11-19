/**
 * Assemblage pur du pipeline d'import : une grille de chaînes devient des lignes typées prêtes
 * pour `validateRows` du domaine. Chaque ligne est projetée selon le rapprochement des colonnes
 * (automatique par défaut) puis ses cellules sont coercées vers les types attendus. Déterministe.
 */

import type { ColumnDefinition } from '@consulpro/domain';

import { coerceRow } from './coerce';
import type { Grid } from './delimited';
import { applyMapping, autoMap, type ColumnMapping } from './mapping';

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
