import type { ParameterValueDto } from '@consulpro/contracts';
import { formatAuto, withUnit } from '@consulpro/ui';

/**
 * Valeur de paramètre affichable (aucun calcul : mise en forme seulement).
 * `units` : libellés d'affichage fournis par l'API (ex. m2 → m²).
 */
export function formatParameterValue(
  value: ParameterValueDto,
  units: Readonly<Record<string, string>>,
  tableLabel: (count: number) => string,
): string {
  switch (value.kind) {
    case 'SCALAR':
      return withUnit(formatAuto(value.value), units[value.unit] ?? value.unit);
    case 'ENUM':
      return value.value;
    case 'TABLE': {
      const cells = (value.table as { cells?: unknown }).cells;
      return tableLabel(Array.isArray(cells) ? cells.length : 0);
    }
  }
}
