import { describe, expect, it } from 'vitest';

import { DELIMITERS, parseDelimited, sniffDelimiter, type Delimiter } from '../delimited';

describe('sniffDelimiter', () => {
  it('reconnaît la virgule, le point-virgule et la tabulation', () => {
    expect(sniffDelimiter('a,b,c')).toBe(',');
    expect(sniffDelimiter('a;b;c')).toBe(';');
    expect(sniffDelimiter('a\tb\tc')).toBe('\t');
  });

  it('choisit le séparateur le plus fréquent sur la première ligne', () => {
    expect(sniffDelimiter('a;b;c,d\n1;2;3;4')).toBe(';');
  });

  it('ignore les séparateurs à l’intérieur des guillemets', () => {
    // La virgule est entre guillemets ; seul le point-virgule compte.
    expect(sniffDelimiter('"a,b";c')).toBe(';');
  });

  it('retombe sur la virgule en l’absence de tout séparateur', () => {
    expect(sniffDelimiter('colonneunique')).toBe(',');
  });

  it('se fonde sur la première ligne uniquement', () => {
    expect(sniffDelimiter('a,b\n1;2;3;4')).toBe(',');
  });
});

describe('parseDelimited', () => {
  it('sépare en-tête et lignes', () => {
    const grid = parseDelimited('x,y\n1,2\n3,4');
    expect(grid.headers).toEqual(['x', 'y']);
    expect(grid.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('gère les champs cités : séparateur, retour à la ligne et guillemet échappé internes', () => {
    const grid = parseDelimited('nom,note\n"Dupont, Jean","ligne 1\nligne 2"\n"cite ""ok""",x');
    expect(grid.headers).toEqual(['nom', 'note']);
    expect(grid.rows).toEqual([
      ['Dupont, Jean', 'ligne 1\nligne 2'],
      ['cite "ok"', 'x'],
    ]);
  });

  it('accepte les fins de ligne CRLF', () => {
    const grid = parseDelimited('a,b\r\n1,2\r\n3,4\r\n');
    expect(grid.headers).toEqual(['a', 'b']);
    expect(grid.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('retire la marque d’ordre des octets (BOM)', () => {
    const grid = parseDelimited('﻿a,b\n1,2');
    expect(grid.headers).toEqual(['a', 'b']);
  });

  it('ignore un retour à la ligne final', () => {
    const grid = parseDelimited('a,b\n1,2\n');
    expect(grid.rows).toEqual([['1', '2']]);
  });

  it('conserve les lignes irrégulières (colonnes manquantes ou en trop)', () => {
    const grid = parseDelimited('a,b,c\n1,2\n3,4,5,6');
    expect(grid.rows).toEqual([
      ['1', '2'],
      ['3', '4', '5', '6'],
    ]);
  });

  it('respecte un séparateur imposé', () => {
    const grid = parseDelimited('a;b\n1;2', ';' satisfies Delimiter);
    expect(grid.headers).toEqual(['a', 'b']);
    expect(grid.rows).toEqual([['1', '2']]);
  });

  it('analyse un collage Excel (tabulations)', () => {
    const grid = parseDelimited('P1\t100.5\t200.25\nP2\t101\t201');
    expect(grid.headers).toEqual(['P1', '100.5', '200.25']);
    expect(grid.rows).toEqual([['P2', '101', '201']]);
  });

  it('renvoie une grille vide pour un texte vide ou réduit au BOM', () => {
    expect(parseDelimited('')).toEqual({ headers: [], rows: [] });
    expect(parseDelimited('﻿')).toEqual({ headers: [], rows: [] });
  });

  it('gère une cellule vide finale citée sans la confondre avec le fantôme de fin', () => {
    const grid = parseDelimited('a,b\n1,""');
    expect(grid.rows).toEqual([['1', '']]);
  });

  it('accepte une fin de ligne CR seule (ancien format Mac)', () => {
    const grid = parseDelimited('a,b\r1,2');
    expect(grid.headers).toEqual(['a', 'b']);
    expect(grid.rows).toEqual([['1', '2']]);
  });

  it('clôt un dernier champ non vide sans retour à la ligne', () => {
    const grid = parseDelimited('col\nvaleur');
    expect(grid.headers).toEqual(['col']);
    expect(grid.rows).toEqual([['valeur']]);
  });

  it('conserve une dernière cellule vide due à un séparateur final', () => {
    const grid = parseDelimited('a,b\n1,');
    expect(grid.rows).toEqual([['1', '']]);
  });

  it('expose la liste des séparateurs', () => {
    expect(DELIMITERS).toEqual([',', ';', '\t']);
  });
});
