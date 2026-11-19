import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';

import { parseXlsx } from '../xlsx';

/** Construit les octets d'un classeur XLSX à une feuille depuis un tableau de tableaux. */
function workbookBytes(aoa: readonly (readonly unknown[])[]): Uint8Array {
  const sheet = utils.aoa_to_sheet(aoa as unknown[][]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Feuille1');
  return write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

describe('parseXlsx', () => {
  it('lit la première feuille en grille de chaînes', () => {
    const bytes = workbookBytes([
      ['pointId', 'x', 'y'],
      ['P1', 100.5, 200.25],
      ['P2', 101, 201],
    ]);
    const grid = parseXlsx(bytes);
    expect(grid.headers).toEqual(['pointId', 'x', 'y']);
    expect(grid.rows).toEqual([
      ['P1', '100.5', '200.25'],
      ['P2', '101', '201'],
    ]);
  });

  it('met booléens et nombres en chaîne et comble les cellules vides', () => {
    const bytes = workbookBytes([
      ['a', 'b', 'c'],
      [true, '', 42],
    ]);
    const grid = parseXlsx(bytes);
    expect(grid.rows).toEqual([['true', '', '42']]);
  });
});
