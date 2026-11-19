/**
 * Lecture seule d'un classeur XLSX (octets) vers une grille de chaînes, de même forme que le
 * parseur délimité. On lit la première feuille, sans formules ni styles ni HTML ; les valeurs
 * sont prises brutes puis mises en chaîne, la première ligne servant d'en-tête. Déterministe.
 *
 * S'appuie sur SheetJS (dépendance épinglée). La fonction peut lever si les octets ne forment
 * pas un classeur lisible : l'appelant (service d'import, couche application) convertit cette
 * exception en erreur d'import présentable.
 */

import { read, utils, type WorkSheet } from 'xlsx';

import type { Grid } from './delimited';

/** Valeur de cellule SheetJS en chaîne : nombres et booléens mis en texte, vide sinon. */
function toCellString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  /* c8 ignore next -- défensif : cellules SheetJS exotiques (erreur, date) exclues par les options de lecture. */
  return '';
}

/** Lit la première feuille d'un classeur XLSX en grille brute (en-têtes + lignes de chaînes). */
export function parseXlsx(bytes: Uint8Array): Grid {
  const workbook = read(bytes, {
    type: 'array',
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    sheetStubs: false,
  });
  const [firstSheetName] = workbook.SheetNames;
  /* c8 ignore next -- défensif : un classeur lisible contient au moins une feuille. */
  if (firstSheetName === undefined) return { headers: [], rows: [] };
  const sheet: WorkSheet | undefined = workbook.Sheets[firstSheetName];
  /* c8 ignore next -- défensif : la feuille nommée existe toujours dans un classeur lisible. */
  if (sheet === undefined) return { headers: [], rows: [] };
  const matrix = utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: false,
  });
  const stringified = matrix.map((row) => row.map(toCellString));
  const [headers = [], ...rows] = stringified;
  return { headers, rows };
}
