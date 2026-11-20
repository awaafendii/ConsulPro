import { DATASET_KINDS } from '@consulpro/domain';
import { describe, expect, it } from 'vitest';

import { coerceCell, parseAngle } from '../coerce';
import { decodeBytes } from '../decode';
import { isHtml, parseHtmlTable } from '../html';
import { exceedsCellCap } from '../xlsx';

const ANGLE = DATASET_KINDS.TOPO_OBSERVATIONS.columns.find((c) => c.key === 'horizontalAngle')!;

/* Extensions du moteur d'import (Phase 7) : décodage tolérant à l'encodage, lecture de tableaux
   HTML (collage Excel/Word), angles DMS, et garde-fou contre les classeurs surdimensionnés. */

describe('decodeBytes', () => {
  it('décode l’UTF-8 valide', () => {
    expect(decodeBytes(new Uint8Array([0x63, 0x61, 0x66, 0xc3, 0xa9]))).toBe('café');
  });

  it('se rabat sur Windows-1252 quand l’UTF-8 est invalide', () => {
    // 0xE9 seul est une séquence UTF-8 invalide ; en Windows-1252 c'est « é ».
    expect(decodeBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('café');
  });
});

describe('isHtml', () => {
  it('reconnaît un fragment contenant un tableau ou un document HTML', () => {
    expect(isHtml('  <table><tr><td>1</td></tr></table>')).toBe(true);
    expect(isHtml('<html><body><table></table></body></html>')).toBe(true);
    expect(isHtml('a,b\n1,2')).toBe(false);
    expect(isHtml('<p>sans tableau</p>')).toBe(false);
  });
});

describe('parseHtmlTable', () => {
  it('développe les colspan et décode les entités', () => {
    const html =
      '<table><tr><th colspan="2">A</th><th>B</th></tr>' +
      '<tr><td>x&amp;y</td><td>Caf&#233;</td><td>Caf&#xe9;</td></tr></table>';
    const grid = parseHtmlTable(html);
    expect(grid.headers).toEqual(['A', '', 'B']);
    expect(grid.rows[0]).toEqual(['x&y', 'Café', 'Café']);
  });

  it('remplace les sauts de ligne et l’espace insécable, et normalise les espaces', () => {
    const grid = parseHtmlTable('<table><tr><td>a<br>b</td><td>c&nbsp;&nbsp;d</td></tr></table>');
    expect(grid.headers).toEqual(['a b', 'c d']);
  });

  it('analyse les <tr> même sans balise <table> (collage partiel)', () => {
    const grid = parseHtmlTable('<tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr>');
    expect(grid.headers).toEqual(['1', '2']);
    expect(grid.rows[0]).toEqual(['3', '4']);
  });
});

describe('parseAngle', () => {
  it('convertit les degrés-minutes-secondes en degrés décimaux', () => {
    expect(parseAngle('123°45\'30"')).toBeCloseTo(123.758333, 5);
    expect(parseAngle("45°30'")).toBe(45.5);
    expect(parseAngle('90°')).toBe(90);
  });

  it('gère le signe négatif et les guillemets typographiques', () => {
    expect(parseAngle('-10°30′')).toBe(-10.5);
    expect(parseAngle('-0°30′')).toBe(-0.5);
    expect(parseAngle('12°00′30″')).toBeCloseTo(12.008333, 5);
  });

  it('renvoie null pour ce qui n’est pas du DMS', () => {
    expect(parseAngle('12,5')).toBeNull();
    expect(parseAngle('abc')).toBeNull();
    expect(parseAngle('')).toBeNull();
  });
});

describe('coerceCell sur une colonne d’angle', () => {
  it('convertit un DMS en degrés et laisse un texte non reconnu tel quel', () => {
    expect(coerceCell(ANGLE, '123°', 'gon')).toEqual({ value: 123, unit: 'deg' });
    // Ni nombre ni DMS : laissé tel quel pour que la validation signale l'erreur de cellule.
    expect(coerceCell(ANGLE, 'nord-est', 'gon')).toBe('nord-est');
  });
});

describe('garde-fou XLSX (classeur surdimensionné)', () => {
  it('refuse une plage déclarée démesurée, accepte une plage ordinaire', () => {
    // 702 colonnes × 300 000 lignes ≫ 6 M cellules (archive « zip bomb »).
    expect(exceedsCellCap('A1:ZZ300000')).toBe(true);
    expect(exceedsCellCap('A1:E5')).toBe(false);
    // Un levé dense de 50 000 points reste admis.
    expect(exceedsCellCap('A1:Z50000')).toBe(false);
  });
});
