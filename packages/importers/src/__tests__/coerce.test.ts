import type { ColumnDefinition } from '@consulpro/domain';
import { describe, expect, it } from 'vitest';

import { coerceCell, coerceRow, parseNumber } from '../coerce';

const NBSP = String.fromCharCode(0x00a0);
const NNBSP = String.fromCharCode(0x202f);

const text: ColumnDefinition = {
  key: 't',
  label: 'Nom',
  type: 'text',
  required: true,
  maxLength: 10,
};
const choice: ColumnDefinition = {
  key: 'c',
  label: 'Nature',
  type: 'choice',
  required: true,
  options: [
    { value: 'BOARD', label: 'Tableau' },
    { value: 'LOAD', label: 'Départ / récepteurs' },
  ],
};
const count: ColumnDefinition = {
  key: 'n',
  label: 'Effectif',
  type: 'number',
  required: false,
  integer: true,
  min: 0,
  exclusiveMin: false,
  max: 100,
};
const length: ColumnDefinition = {
  key: 'x',
  label: 'X',
  type: 'quantity',
  required: true,
  unitKind: 'length',
  units: ['m'],
  positive: false,
};
const angle: ColumnDefinition = {
  key: 'a',
  label: 'Angle',
  type: 'quantity',
  required: true,
  unitKind: 'angle',
  units: ['gon', 'deg'],
  positive: false,
};
const noUnit: ColumnDefinition = {
  key: 'u',
  label: 'Sans unité',
  type: 'quantity',
  required: false,
  unitKind: 'length',
  units: [],
  positive: false,
};

describe('parseNumber', () => {
  it('lit un entier et un décimal au point', () => {
    expect(parseNumber('1234')).toBe(1234);
    expect(parseNumber('3.14')).toBe(3.14);
  });

  it('lit la virgule décimale française', () => {
    expect(parseNumber('3,14')).toBe(3.14);
    expect(parseNumber('-2,5')).toBe(-2.5);
    expect(parseNumber('+2')).toBe(2);
    expect(parseNumber(',5')).toBe(0.5);
  });

  it('retire les séparateurs de milliers (espaces, insécables, apostrophe)', () => {
    expect(parseNumber(`1${NBSP}234,56`)).toBe(1234.56);
    expect(parseNumber(`1${NNBSP}234`)).toBe(1234);
    expect(parseNumber('1 234')).toBe(1234);
    expect(parseNumber("1'234")).toBe(1234);
  });

  it('résout la notation mixte selon le dernier séparateur', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56); // FR : point = millier, virgule = décimale
    expect(parseNumber('1,234.56')).toBe(1234.56); // EN : virgule = millier, point = décimale
  });

  it('traite les séparateurs répétés comme des milliers', () => {
    expect(parseNumber('1.234.567')).toBe(1234567);
    expect(parseNumber('1,234,567')).toBe(1234567);
  });

  it('renvoie null pour une chaîne non numérique ou vide', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('12abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('   ')).toBeNull();
  });

  it('renvoie null pour un nombre qui déborde (non fini)', () => {
    expect(parseNumber('9'.repeat(400))).toBeNull();
  });
});

describe('coerceCell', () => {
  it('rogne un texte et vide une cellule blanche', () => {
    expect(coerceCell(text, '  Dupont ')).toBe('Dupont');
    expect(coerceCell(text, '   ')).toBeNull();
  });

  it('rapproche un choix par valeur ou par libellé (accents ignorés)', () => {
    expect(coerceCell(choice, 'board')).toBe('BOARD');
    expect(coerceCell(choice, 'Tableau')).toBe('BOARD');
    expect(coerceCell(choice, 'Départ / récepteurs')).toBe('LOAD');
  });

  it('laisse un choix inconnu tel quel (validé en aval)', () => {
    expect(coerceCell(choice, 'inconnu')).toBe('inconnu');
  });

  it('convertit un nombre et laisse une saisie non numérique telle quelle', () => {
    expect(coerceCell(count, '42')).toBe(42);
    expect(coerceCell(count, 'abc')).toBe('abc');
  });

  it('emballe une grandeur avec l’unité par défaut de la colonne', () => {
    expect(coerceCell(length, '12,5')).toEqual({ value: 12.5, unit: 'm' });
  });

  it('respecte une unité imposée admissible', () => {
    expect(coerceCell(angle, '100', 'gon')).toEqual({ value: 100, unit: 'gon' });
    expect(coerceCell(angle, '90', 'deg')).toEqual({ value: 90, unit: 'deg' });
  });

  it('retombe sur l’unité par défaut si l’unité imposée n’est pas admise', () => {
    expect(coerceCell(angle, '100', 'rad')).toEqual({ value: 100, unit: 'gon' });
  });

  it('rend une unité vide si la colonne n’en déclare aucune', () => {
    expect(coerceCell(noUnit, '5')).toEqual({ value: 5, unit: '' });
  });

  it('laisse une grandeur non numérique telle quelle', () => {
    expect(coerceCell(length, 'abc')).toBe('abc');
  });
});

describe('coerceRow', () => {
  it('convertit chaque colonne présente, grandeur avec unité imposée', () => {
    const row = coerceRow([text, length], { t: 'P1', x: '100,25' }, { x: 'm' });
    expect(row).toEqual({ t: 'P1', x: { value: 100.25, unit: 'm' } });
  });

  it('omet les colonnes absentes de l’entrée', () => {
    expect(coerceRow([text, length], { t: 'P1' })).toEqual({ t: 'P1' });
  });

  it('vide une cellule blanche', () => {
    expect(coerceRow([text], { t: '  ' })).toEqual({ t: null });
  });
});
