import { describe, expect, it } from 'vitest';

import type { TableValue } from '../params/parameter';
import { readTable, validateTable } from '../params/table';

/** Table fictive de test (aucune valeur normative). */
const capacity: TableValue = {
  axes: [
    { name: 'method', kind: 'CATEGORY', values: ['B', 'C'] },
    { name: 'section', kind: 'NUMERIC', unit: 'mm2', values: [1.5, 2.5, 4], lookup: 'NEXT_UPPER' },
  ],
  unit: 'A',
  cells: [10, 20, 30, 11, 21, null],
};

const curve: TableValue = {
  axes: [{ name: 'x', kind: 'NUMERIC', unit: 'm', values: [0, 10, 20], lookup: 'LINEAR' }],
  unit: '1',
  cells: [0, 1, 4],
};

const grid: TableValue = {
  axes: [
    { name: 'x', kind: 'NUMERIC', unit: 'm', values: [0, 1], lookup: 'LINEAR' },
    { name: 'y', kind: 'NUMERIC', unit: 'm', values: [0, 1], lookup: 'LINEAR' },
  ],
  unit: '1',
  cells: [0, 10, 20, 30],
};

describe('validateTable', () => {
  it('accepte une table cohérente', () => {
    expect(validateTable(capacity).ok).toBe(true);
  });

  it.each([
    ['sans axe', { axes: [], unit: '1', cells: [] }],
    ['unité de cellule inconnue', { ...curve, unit: 'zz' }],
    ['axe en double', { ...grid, axes: [grid.axes[0], grid.axes[0]] }],
    ['axe vide', { axes: [{ name: 'x', kind: 'CATEGORY', values: [] }], unit: '1', cells: [] }],
    [
      'catégories en double',
      { axes: [{ name: 'c', kind: 'CATEGORY', values: ['a', 'a'] }], unit: '1', cells: [1, 2] },
    ],
    [
      'unité d’axe inconnue',
      {
        axes: [{ name: 'x', kind: 'NUMERIC', unit: 'zz', values: [1], lookup: 'EXACT' }],
        unit: '1',
        cells: [1],
      },
    ],
    [
      'axe non croissant',
      {
        axes: [{ name: 'x', kind: 'NUMERIC', unit: 'm', values: [2, 1], lookup: 'EXACT' }],
        unit: '1',
        cells: [1, 2],
      },
    ],
    ['nombre de cellules', { ...curve, cells: [1, 2] }],
  ])('refuse : %s', (_label, table) => {
    const r = validateTable(table as TableValue);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('TABLE_INVALID');
  });
});

describe('readTable', () => {
  it('lit une valeur exacte sur la grille (coordonnée numérique en SI)', () => {
    const r = readTable(capacity, { method: 'C', section: 2.5e-6 });
    expect(r).toEqual({ ok: true, value: { value: 21, unit: 'A', si: 21 } });
  });

  it('NEXT_UPPER retient la valeur d’axe immédiatement supérieure', () => {
    expect(readTable(capacity, { method: 'B', section: 2e-6 })).toMatchObject({
      ok: true,
      value: { value: 20 },
    });
  });

  it('NEXT_UPPER au-delà de l’axe : hors domaine, pas d’extrapolation', () => {
    expect(readTable(capacity, { method: 'B', section: 6e-6 })).toMatchObject({
      ok: false,
      error: { code: 'OUT_OF_RANGE' },
    });
  });

  it('NEXT_LOWER retient la valeur immédiatement inférieure', () => {
    const lower: TableValue = {
      ...curve,
      axes: [{ ...curve.axes[0]!, lookup: 'NEXT_LOWER' } as TableValue['axes'][number]],
    };
    expect(readTable(lower, { x: 15 })).toMatchObject({ ok: true, value: { value: 1 } });
    expect(readTable(lower, { x: -1 })).toMatchObject({
      ok: false,
      error: { code: 'OUT_OF_RANGE' },
    });
  });

  it('EXACT refuse une coordonnée hors grille', () => {
    const exact: TableValue = {
      ...curve,
      axes: [{ ...curve.axes[0]!, lookup: 'EXACT' } as TableValue['axes'][number]],
    };
    expect(readTable(exact, { x: 10 })).toMatchObject({ ok: true, value: { value: 1 } });
    expect(readTable(exact, { x: 5 })).toMatchObject({ ok: false, error: { code: 'NOT_ON_GRID' } });
  });

  it('LINEAR interpole sans extrapoler', () => {
    const r = readTable(curve, { x: 15 });
    expect(r.ok && r.value.value).toBeCloseTo(2.5, 12);
    expect(readTable(curve, { x: 25 })).toMatchObject({
      ok: false,
      error: { code: 'OUT_OF_RANGE' },
    });
    expect(readTable(curve, { x: -0.5 })).toMatchObject({
      ok: false,
      error: { code: 'OUT_OF_RANGE' },
    });
  });

  it('interpolation bilinéaire', () => {
    const r = readTable(grid, { x: 0.5, y: 0.5 });
    expect(r.ok && r.value.value).toBeCloseTo(15, 12);
    const corner = readTable(grid, { x: 1, y: 0.25 });
    expect(corner.ok && corner.value.value).toBeCloseTo(22.5, 12);
  });

  it('signale les coordonnées manquantes, de mauvais type ou inconnues', () => {
    expect(readTable(capacity, { section: 2.5e-6 })).toMatchObject({
      ok: false,
      error: { code: 'AXIS_MISSING' },
    });
    expect(readTable(capacity, { method: 1, section: 2.5e-6 })).toMatchObject({
      ok: false,
      error: { code: 'COORDINATE_TYPE' },
    });
    expect(readTable(capacity, { method: 'B', section: 'gros' })).toMatchObject({
      ok: false,
      error: { code: 'COORDINATE_TYPE' },
    });
    expect(readTable(capacity, { method: 'Z', section: 2.5e-6 })).toMatchObject({
      ok: false,
      error: { code: 'CATEGORY_UNKNOWN' },
    });
  });

  it('une cellule non définie rend la lecture impossible', () => {
    expect(readTable(capacity, { method: 'C', section: 4e-6 })).toMatchObject({
      ok: false,
      error: { code: 'CELL_UNDEFINED' },
    });
  });

  it('une cellule non définie de poids nul n’empêche pas la lecture', () => {
    const sparse: TableValue = { ...curve, cells: [0, 1, null] };
    expect(readTable(sparse, { x: 10 })).toMatchObject({ ok: true, value: { value: 1 } });
  });
});
