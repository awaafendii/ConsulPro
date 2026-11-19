import { readFileSync } from 'node:fs';

import { DATASET_KINDS, validateRows } from '@consulpro/domain';
import { describe, expect, it } from 'vitest';

import { detectFormat } from '../detect';
import { gridToRows, readGrid } from '../pipeline';

/* Corpus de fixtures d'import (Phase 7, critère de sortie) : chaque fichier de `__fixtures__`
   exerce une difficulté réelle de lecture, de rapprochement et de coercition, de bout en bout
   (octets → grille → lignes typées → validation par le domaine). Voir __fixtures__/README.md. */

const bytes = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`../../__fixtures__/${name}`, import.meta.url)));

const ROOMS = DATASET_KINDS.ROOMS.columns;
const POINTS = DATASET_KINDS.TOPO_POINTS.columns;
const OBS = DATASET_KINDS.TOPO_OBSERVATIONS.columns;

describe('détection par le contenu', () => {
  it('reconnaît un classeur XLSX à sa signature, un texte sinon (extension ignorée)', () => {
    expect(detectFormat(bytes('points.xlsx'))).toBe('xlsx');
    expect(detectFormat(bytes('rooms-utf8-bom.csv'))).toBe('delimited');
    expect(detectFormat(bytes('rooms-fr-win1252.csv'))).toBe('delimited');
  });
});

describe('CSV Excel FR (Windows-1252)', () => {
  it('décode les accents, le séparateur ; et la virgule décimale', () => {
    const grid = readGrid(bytes('rooms-fr-win1252.csv'));
    expect(grid.headers).toEqual(['Pièce', 'Niveau', 'Surface']);
    const rows = gridToRows(ROOMS, grid, undefined, { area: 'm2' });
    expect(validateRows('ROOMS', rows).ok).toBe(true);
    expect(rows[0]).toMatchObject({ name: 'Séjour', level: 'RDC', area: { value: 24.5, unit: 'm2' } });
    expect(rows[2]).toMatchObject({ name: "Salle d'eau", area: { value: 5.75, unit: 'm2' } });
  });
});

describe('CSV UTF-8 avec BOM', () => {
  it('retire la marque d’ordre des octets du premier en-tête', () => {
    const grid = readGrid(bytes('rooms-utf8-bom.csv'));
    expect(grid.headers).toEqual(['Pièce', 'Niveau', 'Surface']);
    const rows = gridToRows(ROOMS, grid, undefined, { area: 'm2' });
    expect(validateRows('ROOMS', rows).ok).toBe(true);
    expect(rows[0]).toMatchObject({ name: 'Séjour', area: { value: 24.5, unit: 'm2' } });
  });
});

describe('collage Excel (TSV)', () => {
  it('devine la tabulation et analyse les espaces de milliers', () => {
    const grid = readGrid(bytes('points-excel-paste.tsv'));
    expect(grid.headers).toEqual(['Matricule', 'X (Est)', 'Y (Nord)', 'Z (altitude)']);
    const rows = gridToRows(POINTS, grid, undefined, { x: 'm', y: 'm', z: 'm' });
    expect(validateRows('TOPO_POINTS', rows).ok).toBe(true);
    expect(rows[0]).toMatchObject({
      pointId: 'P1',
      x: { value: 1000.25, unit: 'm' },
      y: { value: 2000.75, unit: 'm' },
      z: { value: 145.1, unit: 'm' },
    });
  });
});

describe('collage Word (tableau HTML)', () => {
  it('lit le tableau, développe les entités et rapproche les colonnes', () => {
    const grid = readGrid(bytes('observations-word.html'));
    expect(grid.headers).toEqual(['Station', 'Point visé', 'Lecture horizontale']);
    const rows = gridToRows(OBS, grid, undefined, { horizontalAngle: 'gon' });
    expect(validateRows('TOPO_OBSERVATIONS', rows).ok).toBe(true);
    expect(rows[0]).toMatchObject({
      station: 'S1',
      target: 'V1',
      horizontalAngle: { value: 123.4567, unit: 'gon' },
    });
  });
});

describe('angles (DMS et décimal)', () => {
  it('convertit les degrés-minutes-secondes en degrés décimaux et garde le gon décimal', () => {
    const grid = readGrid(bytes('observations-angles.csv'));
    const rows = gridToRows(OBS, grid, undefined, {
      horizontalAngle: 'gon',
      zenithAngle: 'gon',
      slopeDistance: 'm',
    });
    expect(validateRows('TOPO_OBSERVATIONS', rows).ok).toBe(true);
    const h0 = rows[0]?.horizontalAngle as { value: number; unit: string };
    expect(h0.unit).toBe('deg');
    expect(h0.value).toBeCloseTo(123.758333, 5);
    expect(rows[1]?.horizontalAngle).toEqual({ value: 45.5, unit: 'deg' });
    expect(rows[2]?.horizontalAngle).toEqual({ value: 90, unit: 'deg' });
    // Un angle en décimal garde l'unité imposée (gon).
    expect(rows[0]?.zenithAngle).toEqual({ value: 98.7654, unit: 'gon' });
  });
});

describe('injection de formules (hostile)', () => {
  it('importe les cellules commençant par = + - @ comme du texte littéral', () => {
    const grid = readGrid(bytes('rooms-formula-injection.csv'));
    const rows = gridToRows(ROOMS, grid, undefined, { area: 'm2' });
    expect(validateRows('ROOMS', rows).ok).toBe(true);
    expect(rows.map((r) => r.name)).toEqual(['=SUM(1+1)', '+cmd|calc', '-2+3', '@SUM(A1)']);
  });
});

describe('classeur XLSX', () => {
  it('ne lit que la première feuille, saute la ligne vide et lit la valeur des formules', () => {
    const grid = readGrid(bytes('points.xlsx'));
    expect(grid.headers).toEqual(['Matricule', 'X (Est)', 'Y (Nord)', 'Z (altitude)', 'Somme X']);
    // La formule B2+B4 est lue comme sa valeur en cache, jamais comme « =… ».
    expect(grid.rows[0]?.[4]).toBe('2010.25');
    expect(grid.rows.some((row) => row.some((cell) => cell.startsWith('=')))).toBe(false);
    const rows = gridToRows(POINTS, grid, undefined, { x: 'm', y: 'm', z: 'm' });
    expect(validateRows('TOPO_POINTS', rows).ok).toBe(true);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ pointId: 'P1', x: { value: 1000.25, unit: 'm' } });
    expect(rows[2]).toMatchObject({ pointId: 'P3', y: { value: 2030.8, unit: 'm' } });
  });
});
