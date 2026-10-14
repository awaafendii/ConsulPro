import type { DatasetRow, RowError } from './row';

/*
 * Plomberie (Phase 6) : types d'appareils sanitaires (NF DTU 60.11) et contrôle de
 * l'arborescence d'un réseau d'alimentation (un tronçon par ligne, rattaché à son amont).
 * Les codes des appareils sont ceux des tables des référentiels de plomberie.
 */

export const FIXTURE_TYPES = [
  { value: 'SINK', label: 'Évier' },
  { value: 'WASHBASIN', label: 'Lavabo' },
  { value: 'HAND_BASIN', label: 'Lave-mains' },
  { value: 'BIDET', label: 'Bidet' },
  { value: 'BATHTUB', label: 'Baignoire' },
  { value: 'SHOWER', label: 'Douche' },
  { value: 'WC_CISTERN', label: 'WC à réservoir de chasse' },
  { value: 'WC_FLUSH_VALVE', label: 'WC à robinet de chasse' },
  { value: 'URINAL', label: 'Urinoir' },
  { value: 'LAUNDRY_TUB', label: 'Bac à laver' },
  { value: 'WASHING_MACHINE', label: 'Lave-linge' },
  { value: 'DISHWASHER', label: 'Lave-vaisselle' },
  { value: 'TAP_15', label: 'Poste d’eau (robinet DN 15)' },
  { value: 'TAP_20', label: 'Poste d’eau (robinet DN 20)' },
] as const;

export type FixtureType = (typeof FIXTURE_TYPES)[number]['value'];

/** Emplacement d'un tronçon : la vitesse admissible en dépend (NF DTU 60.11). */
export const PIPE_LOCATIONS = [
  { value: 'FLOOR', label: 'En étage' },
  { value: 'BASEMENT', label: 'Sous-sol ou vide sanitaire' },
] as const;

const text = (row: DatasetRow, key: string) => {
  const value = row[key];
  return typeof value === 'string' ? value : '';
};
const filled = (row: DatasetRow, key: string) => row[key] !== null && row[key] !== undefined;

/**
 * Réseau d'alimentation : repères uniques, un seul tronçon d'origine (sans amont), amont connu,
 * aucune boucle ; un tronçon qui dessert des appareils en précise le type et le nombre.
 */
export function checkNetworkTree(rows: readonly DatasetRow[]): RowError[] {
  const errors: RowError[] = [];
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
    const parent = text(row, 'parent');
    if (parent === '') {
      roots += 1;
      if (roots > 1) {
        errors.push({
          row: line,
          column: 'parent',
          message: 'Un seul tronçon d’origine (sans amont) : rattachez ce tronçon à un autre.',
        });
      }
    } else if (!byCode.has(parent)) {
      errors.push({ row: line, column: 'parent', message: `Tronçon amont « ${parent} » inconnu.` });
    }
    if (filled(row, 'fixture') !== filled(row, 'count')) {
      errors.push({
        row: line,
        column: filled(row, 'fixture') ? 'count' : 'fixture',
        message: 'Précisez à la fois le type et le nombre des appareils desservis.',
      });
    }
  });
  if (roots === 0) {
    errors.push({ row: 1, column: 'parent', message: 'Aucun tronçon d’origine (sans amont).' });
  }
  rows.forEach((row, index) => {
    const seen = new Set<string>();
    let code = text(row, 'code');
    while (code !== '') {
      if (seen.has(code)) {
        errors.push({ row: index + 1, column: 'parent', message: 'Boucle dans le réseau.' });
        break;
      }
      seen.add(code);
      const current = byCode.get(code);
      code = current ? text(current, 'parent') : '';
    }
  });
  return errors;
}
