/**
 * Lecture d'un tableau HTML (octets déjà décodés) vers une grille de chaînes, de même forme
 * que le parseur délimité. Un copier-coller depuis Excel ou Word place dans le presse-papier
 * une variante HTML (`text/html`) : un `<table>` dont les lignes sont des `<tr>` et les
 * cellules des `<td>`/`<th>`. Ce module l'extrait sans DOM, par analyse de chaînes.
 *
 * Pur et déterministe : aucune I/O, aucun DOM, aucun aléa (principe P2). Les cellules fusionnées
 * horizontalement (`colspan`) sont développées en cellules vides ; le `rowspan` (fusion
 * verticale, rare dans un collage tabulaire) n'est pas reconstitué (limite documentée).
 */

import type { Grid } from './delimited';

const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/i;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const COLSPAN = /\bcolspan\s*=\s*["']?(\d+)/i;

/** `true` si le texte est un fragment HTML contenant un tableau (collage Excel/Word, .html). */
export function isHtml(text: string): boolean {
  const head = text.trimStart().slice(0, 2048).toLowerCase();
  return head.startsWith('<') && (head.includes('<table') || head.includes('<html'));
}

/** Décode les entités HTML courantes et numériques en caractères. */
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCharCode(Number(dec)));
}

/** Contenu d'une cellule : sauts de ligne en espace, balises retirées, entités décodées, espaces normalisés. */
function cellText(inner: string): string {
  const withoutTags = inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '');
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

/** Extrait les cellules d'une ligne `<tr>`, en développant les `colspan` en cellules vides. */
function parseRow(rowHtml: string): string[] {
  const cells: string[] = [];
  let match: RegExpExecArray | null;
  CELL.lastIndex = 0;
  while ((match = CELL.exec(rowHtml)) !== null) {
    const [, , attrs = '', inner = ''] = match;
    cells.push(cellText(inner));
    const span = COLSPAN.exec(attrs);
    const extra = span ? Number(span[1]) - 1 : 0;
    for (let i = 0; i < extra; i += 1) cells.push('');
  }
  return cells;
}

/** Lit le premier tableau HTML en grille brute (première ligne = en-têtes). */
export function parseHtmlTable(text: string): Grid {
  const table = TABLE.exec(text);
  let scope = text;
  if (table) {
    /* c8 ignore next -- le groupe capturant du tableau existe toujours sur une correspondance. */
    scope = table[1] ?? '';
  }
  const rows: string[][] = [];
  let match: RegExpExecArray | null;
  ROW.lastIndex = 0;
  while ((match = ROW.exec(scope)) !== null) {
    /* c8 ignore next -- le groupe capturant de la ligne existe toujours sur une correspondance. */
    rows.push(parseRow(match[1] ?? ''));
  }
  const [headers = [], ...body] = rows;
  return { headers, rows: body };
}
