import { DATASET_KINDS, validateRows } from '@consulpro/domain';
import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';

import type { Grid } from '../delimited';
import { gridToRows, readGrid } from '../pipeline';

const topoPoints = DATASET_KINDS.TOPO_POINTS.columns;

describe('gridToRows', () => {
  it('auto-rapproche puis coerce une grille en lignes typées', () => {
    const grid: Grid = {
      headers: ['Matricule', 'X (Est)', 'Y (Nord)'],
      rows: [['P1', '100,5', '200,25']],
    };
    expect(gridToRows(topoPoints, grid, undefined, { x: 'm', y: 'm' })).toEqual([
      { pointId: 'P1', x: { value: 100.5, unit: 'm' }, y: { value: 200.25, unit: 'm' } },
    ]);
  });

  it('respecte un rapprochement imposé', () => {
    const grid: Grid = { headers: ['c0', 'c1'], rows: [['P9', '7,25']] };
    const mapping = [
      { key: 'pointId', sourceIndex: 0 },
      { key: 'x', sourceIndex: 1 },
    ];
    expect(gridToRows(topoPoints, grid, mapping, { x: 'm' })).toEqual([
      { pointId: 'P9', x: { value: 7.25, unit: 'm' } },
    ]);
  });

  it('produit des lignes acceptées par validateRows du domaine', () => {
    const grid: Grid = {
      headers: ['Matricule', 'X (Est)', 'Y (Nord)', 'Z (altitude)'],
      rows: [
        ['P1', '1 000,00', '2 000,50', '12,3'],
        ['P2', '1 010,25', '2 015,75', '13,0'],
      ],
    };
    const rows = gridToRows(topoPoints, grid, undefined, { x: 'm', y: 'm', z: 'm' });
    const result = validateRows('TOPO_POINTS', rows);
    expect(result.ok).toBe(true);
  });
});

describe('readGrid', () => {
  it('décode des octets texte comme une grille délimitée', () => {
    const bytes = new TextEncoder().encode('a,b\n1,2');
    expect(readGrid(bytes)).toEqual({ headers: ['a', 'b'], rows: [['1', '2']] });
  });

  it('respecte un séparateur imposé', () => {
    const bytes = new TextEncoder().encode('a;b\n1;2');
    expect(readGrid(bytes, ';')).toEqual({ headers: ['a', 'b'], rows: [['1', '2']] });
  });

  it('reconnaît et lit un classeur XLSX par sa signature', () => {
    const sheet = utils.aoa_to_sheet([
      ['pointId', 'x'],
      ['P1', 100.5],
    ]);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, sheet, 'Feuille1');
    const bytes = new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    expect(readGrid(bytes)).toEqual({ headers: ['pointId', 'x'], rows: [['P1', '100.5']] });
  });
});
