import { describe, expect, it } from 'vitest';

import { checkBoardTree, DATASET_KINDS, validateRows } from '../dataset/kinds';
import { checkNetworkTree, FIXTURE_TYPES } from '../dataset/plumbing';

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

describe('jeux de données de plomberie (Phase 6)', () => {
  const m = (value: number) => ({ value, unit: 'm' });
  const segment = (code: string, parent: string | null, extra: Record<string, unknown> = {}) => ({
    code,
    parent,
    length: m(5),
    elevation: m(0),
    location: 'FLOOR',
    ...extra,
  });

  it('réseau valide : une origine, des amonts connus, des appareils typés et comptés', () => {
    const result = validateRows('PLUMBING_NETWORK', [
      segment('A', null),
      segment('B', 'A', { fixture: 'WASHBASIN', count: 2 }),
    ]);
    expect(result.ok).toBe(true);
  });

  it('réseau refusé : doublon, amont inconnu, deux origines, boucle, appareils incomplets', () => {
    const errors = checkNetworkTree([
      { code: 'A', parent: null },
      { code: 'A', parent: null },
      { code: 'B', parent: 'X' },
      { code: 'C', parent: 'D' },
      { code: 'D', parent: 'C' },
      { code: 'E', parent: 'A', fixture: 'SINK', count: null },
    ]);
    expect(errors.map((e) => `${String(e.row)}:${e.column}`)).toEqual([
      '2:code',
      '2:parent',
      '3:parent',
      '6:count',
      '4:parent',
      '5:parent',
    ]);
    expect(
      checkNetworkTree([
        { code: 'A', parent: 'B' },
        { code: 'B', parent: 'A' },
      ]),
    ).toContainEqual(expect.objectContaining({ message: 'Aucun tronçon d’origine (sans amont).' }));
  });

  it('inventaire des appareils : type parmi ceux du DTU, nombre entier positif', () => {
    expect(
      validateRows('SANITARY_FIXTURES', [
        { level: 'RDC', room: 'WC', fixture: 'WC_CISTERN', count: 2 },
      ]).ok,
    ).toBe(true);
    const refused = validateRows('SANITARY_FIXTURES', [{ fixture: 'JACUZZI', count: 0 }]);
    expect(refused.ok).toBe(false);
    expect(FIXTURE_TYPES.map((f) => f.value)).toContain('TAP_20');
  });
});
