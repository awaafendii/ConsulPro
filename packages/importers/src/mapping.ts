/**
 * Rapprochement des colonnes d'une grille importée avec les colonnes attendues d'un
 * `DatasetKind`. L'auto-mapping associe chaque colonne du type à l'en-tête dont la forme
 * normalisée correspond à sa clé ou à son libellé ; un rapprochement manuel se construit
 * directement comme un tableau de `ColumnMapping`. Pur et déterministe.
 */

import type { ColumnDefinition } from '@consulpro/domain';

import { normalizeText } from './normalize';

/** Rattachement d'une colonne du type à une colonne source (par indice), ou `null` si absente. */
export interface ColumnMapping {
  readonly key: string;
  readonly sourceIndex: number | null;
}

/**
 * Associe automatiquement chaque colonne du type à un en-tête. Pour chaque colonne, on
 * cherche un en-tête libre dont la forme normalisée égale celle de la clé puis, à défaut,
 * celle du libellé. Un en-tête déjà pris n'est pas réutilisé (rapprochement un pour un).
 */
export function autoMap(
  columns: readonly ColumnDefinition[],
  headers: readonly string[],
): ColumnMapping[] {
  const normalizedHeaders = headers.map(normalizeText);
  const taken = new Set<number>();
  return columns.map((column) => {
    for (const candidate of [column.key, column.label]) {
      const target = normalizeText(candidate);
      const index = normalizedHeaders.findIndex((h, i) => h === target && !taken.has(i));
      if (index !== -1) {
        taken.add(index);
        return { key: column.key, sourceIndex: index };
      }
    }
    return { key: column.key, sourceIndex: null };
  });
}

/**
 * Projette une ligne de grille en enregistrement clé → cellule brute, selon le rapprochement.
 * Les colonnes non rattachées sont omises (elles seront vues comme vides à la validation).
 */
export function applyMapping(
  mapping: readonly ColumnMapping[],
  row: readonly string[],
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const { key, sourceIndex } of mapping) {
    if (sourceIndex === null) continue;
    record[key] = row[sourceIndex] ?? '';
  }
  return record;
}
