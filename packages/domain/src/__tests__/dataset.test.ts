import { describe, expect, it } from 'vitest';

import { checkBoardTree, checkUniquePointId, DATASET_KINDS, validateRows } from '../dataset/kinds';
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

describe('jeux de données topographiques (Phase 7)', () => {
  const m = (value: number) => ({ value, unit: 'm' });
  const gon = (value: number) => ({ value, unit: 'gon' });

  it('points : matricule et X/Y obligatoires ; Z, code et description facultatifs', () => {
    const result = validateRows('TOPO_POINTS', [
      { pointId: 'S1', x: m(1000), y: m(2000) },
      {
        pointId: 'S2',
        x: m(1010.5),
        y: m(2005),
        z: m(120.3),
        code: 'BORNE',
        description: 'Angle de parcelle',
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({ pointId: 'S1', x: { value: 1000, unit: 'm' }, z: null });
    expect(result.value[1]).toMatchObject({ z: { value: 120.3, unit: 'm' }, code: 'BORNE' });
    expect(DATASET_KINDS.TOPO_POINTS.discipline).toBe('TOPO');
  });

  it('points refusés : matricule manquant, unité angulaire pour X, Y non numérique', () => {
    const result = validateRows('TOPO_POINTS', [
      { x: m(1), y: m(2) },
      { pointId: 'A', x: gon(1), y: m(2) },
      { pointId: 'B', x: m(1), y: { value: 'x', unit: 'm' } },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((e) => `${String(e.row)}:${e.column}`)).toEqual(['1:pointId', '2:x', '3:y']);
  });

  it('matricules uniques (checkUniquePointId)', () => {
    const refused = validateRows('TOPO_POINTS', [
      { pointId: 'P1', x: m(0), y: m(0) },
      { pointId: 'P1', x: m(1), y: m(1) },
    ]);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error).toEqual([
      { row: 2, column: 'pointId', message: 'Matricule « P1 » en double.' },
    ]);
    // Appel direct : un matricule non textuel (défensif) compte comme « » puis double.
    expect(checkUniquePointId([{ pointId: 1 }, { pointId: null }]).map((e) => e.row)).toEqual([2]);
  });

  it('observations valides : station et visée obligatoires, angles en gon ou degrés', () => {
    const result = validateRows('TOPO_OBSERVATIONS', [
      { station: 'S1', target: 'P1', horizontalAngle: gon(123.456) },
      {
        station: 'S1',
        target: 'P2',
        horizontalAngle: { value: 95, unit: 'deg' },
        zenithAngle: gon(100),
        slopeDistance: m(42.3),
      },
    ]);
    expect(result.ok).toBe(true);
    expect(DATASET_KINDS.TOPO_OBSERVATIONS.discipline).toBe('TOPO');
  });

  it('observations refusées : station manquante, angle en mètres, distance non positive', () => {
    const result = validateRows('TOPO_OBSERVATIONS', [
      { target: 'P1', horizontalAngle: gon(1) },
      { station: 'S', target: 'P', horizontalAngle: m(1) },
      { station: 'S', target: 'P', horizontalAngle: gon(1), slopeDistance: m(0) },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.map((e) => `${String(e.row)}:${e.column}`)).toEqual([
      '1:station',
      '2:horizontalAngle',
      '3:slopeDistance',
    ]);
  });
});
