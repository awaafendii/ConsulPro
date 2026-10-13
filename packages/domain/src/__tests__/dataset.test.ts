import { describe, expect, it } from 'vitest';

import { checkBoardTree, DATASET_KINDS, validateRows } from '../dataset/kinds';

const kw = (value: number) => ({ value, unit: 'kW' });
const board = (code: string, parent: string | null, extra: Record<string, unknown> = {}) => ({
  code,
  parent,
  type: 'BOARD',
  ...extra,
});
const load = (code: string, parent: string, extra: Record<string, unknown> = {}) => ({
  code,
  parent,
  type: 'LOAD',
  power: kw(2),
  cosPhi: 0.85,
  ...extra,
});

describe('arborescence électrique (ELEC_BOARD_TREE)', () => {
  it('accepte un TGBT, un tableau divisionnaire et leurs départs', () => {
    const rows = [
      board('TGBT', null, { ks: 0.8 }),
      board('TD1', 'TGBT'),
      load('D1', 'TD1', { count: 10, ku: 0.75, designation: 'Éclairage' }),
      load('D2', 'TGBT'),
    ];
    const result = validateRows('ELEC_BOARD_TREE', rows);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({ code: 'TGBT', parent: null, ks: 0.8, power: null });
    expect(result.value[2]).toMatchObject({ count: 10, ku: 0.75, power: { value: 2, unit: 'kW' } });
    expect(DATASET_KINDS.ELEC_BOARD_TREE.discipline).toBe('ELEC');
  });

  it('contrôle les colonnes choix et nombre', () => {
    const result = validateRows('ELEC_BOARD_TREE', [
      { code: 'X', type: 'AUTRE' },
      board('T', null, { ks: 1.2 }),
      load('L1', 'T', { count: 2.5, cosPhi: 0 }),
      load('L2', 'T', { count: 'trois' }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((e) => [e.row, e.column])).toEqual([
      [1, 'type'],
      [2, 'ks'],
      [3, 'count'],
      [3, 'cosPhi'],
      [4, 'count'],
    ]);
    expect(result.error[1]?.message).toContain('supérieure à 0 et au plus 1');
    expect(result.error[2]?.message).toContain('entier');
  });

  it('règles de l’arbre : origine unique, amont tableau, boucles, données propres', () => {
    const errors = checkBoardTree(
      [
        board('TGBT', null, { power: kw(1) }),
        board('TGBT2', null),
        load('D1', 'INCONNU'),
        load('D2', 'D1', { cosPhi: null, ks: 0.5 }),
        load('D1', 'TGBT', { power: null }),
        { code: 'L', parent: null, type: 'LOAD', power: kw(1), cosPhi: 0.9 },
      ].map((r) => ({ power: null, count: null, ku: null, cosPhi: null, ks: null, ...r })),
    );
    expect(errors.map((e) => `${String(e.row)}:${e.column}`)).toEqual([
      '5:code',
      '1:power',
      '2:parent',
      '3:parent',
      '4:parent',
      '4:cosPhi',
      '4:ks',
      '5:power',
      '6:parent',
    ]);
  });

  it('détecte une boucle sans origine', () => {
    const errors = checkBoardTree([
      { code: 'A', parent: 'B', type: 'BOARD' },
      { code: 'B', parent: 'A', type: 'BOARD' },
    ]);
    expect(errors.map((e) => e.message)).toEqual([
      'Aucun tableau d’origine (sans amont).',
      'Boucle dans l’arborescence.',
      'Boucle dans l’arborescence.',
    ]);
  });

  it('un jeu vide reste enregistrable (saisie en cours)', () => {
    expect(validateRows('ELEC_BOARD_TREE', [])).toEqual({ ok: true, value: [] });
  });
});
