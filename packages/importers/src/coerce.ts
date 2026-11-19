/**
 * Coercition des cellules brutes (chaînes) vers les valeurs typées attendues par
 * `validateRows` du domaine : texte, choix (par valeur ou libellé), nombre, grandeur
 * `{ value, unit }`. La coercition ne lève jamais : une entrée non convertible est laissée
 * telle quelle pour que la validation émette l'erreur de cellule exacte. Pur et déterministe.
 */

import type { ColumnDefinition } from '@consulpro/domain';

import { normalizeText } from './normalize';

// Espaces (ordinaire, tabulation, insécable, fine insécable) et apostrophe : séparateurs de
// milliers possibles, à retirer avant l'analyse. Construits par code pour éviter une
// échappatoire Unicode littérale (piège connu, voir CLAUDE.md).
const THOUSANDS = new RegExp(
  `[ \t${String.fromCharCode(0x00a0)}${String.fromCharCode(0x202f)}']`,
  'g',
);
const NUMERIC = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

/**
 * Analyse un nombre en notation française (virgule décimale, espaces de milliers) ou anglaise
 * (point décimal, virgules de milliers). Renvoie `null` si la chaîne n'est pas un nombre.
 */
export function parseNumber(raw: string): number | null {
  const stripped = raw.trim().replace(THOUSANDS, '');
  if (stripped === '') return null;
  let s = stripped;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // Le dernier séparateur rencontré est le séparateur décimal ; l'autre marque les milliers.
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (hasComma) {
    // Une seule virgule : décimale ; plusieurs : séparateurs de milliers.
    s = s.split(',').length - 1 > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot && s.split('.').length - 1 > 1) {
    // Plusieurs points : séparateurs de milliers (le nombre est entier).
    s = s.replace(/\./g, '');
  }
  if (!NUMERIC.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Degrés-minutes-secondes : « 45°30'15" », minutes et secondes facultatives, signe possible.
// Les guillemets prime (′ ″) et droits (' ") sont acceptés. Pur : regex sur une chaîne.
const DMS = /^([+-]?\d+(?:[.,]\d+)?)\s*°(?:\s*(\d+(?:[.,]\d+)?)\s*['′])?(?:\s*(\d+(?:[.,]\d+)?)\s*["″])?$/;

/** Analyse un angle en degrés-minutes-secondes vers des degrés décimaux ; `null` sinon. */
export function parseAngle(raw: string): number | null {
  const match = DMS.exec(raw.trim());
  if (!match) return null;
  const [, d = '0', m = '0', s = '0'] = match;
  const degrees = parseNumber(d);
  const minutes = parseNumber(m);
  const seconds = parseNumber(s);
  /* c8 ignore next -- défensif : les groupes DMS sont numériques, parseNumber ne peut échouer. */
  if (degrees === null || minutes === null || seconds === null) return null;
  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  return degrees < 0 || d.trim().startsWith('-') ? -magnitude : magnitude;
}

/** Rapproche une saisie d'un choix admis (par valeur ou libellé) ; sinon renvoie la saisie. */
function matchChoice(
  options: readonly { readonly value: string; readonly label: string }[],
  text: string,
): string {
  const target = normalizeText(text);
  for (const option of options) {
    if (normalizeText(option.value) === target || normalizeText(option.label) === target) {
      return option.value;
    }
  }
  return text;
}

/**
 * Convertit une cellule brute selon la définition de colonne. `unit` impose l'unité d'une
 * grandeur (sinon la première unité admise par la colonne). Une cellule vide donne `null`.
 */
export function coerceCell(column: ColumnDefinition, raw: string, unit?: string): unknown {
  const text = raw.trim();
  if (text === '') return null;
  switch (column.type) {
    case 'text':
      return text;
    case 'choice':
      return matchChoice(column.options, text);
    case 'number': {
      const n = parseNumber(text);
      return n === null ? text : n;
    }
    case 'quantity': {
      const n = parseNumber(text);
      if (n !== null) {
        const admissible =
          unit !== undefined && (column.units as readonly string[]).includes(unit);
        return { value: n, unit: admissible ? unit : (column.units[0] ?? '') };
      }
      // Angle en degrés-minutes-secondes : converti en degrés décimaux (notation « deg »).
      if (column.unitKind === 'angle') {
        const degrees = parseAngle(text);
        if (degrees !== null) return { value: degrees, unit: 'deg' };
      }
      return text;
    }
  }
}

/**
 * Convertit une ligne (enregistrement clé → cellule brute) en enregistrement typé prêt pour
 * `validateRows`. `units` impose, par clé de colonne, l'unité des grandeurs. Les colonnes
 * absentes de l'entrée sont laissées absentes (vues comme vides à la validation).
 */
export function coerceRow(
  columns: readonly ColumnDefinition[],
  raw: Readonly<Record<string, string>>,
  units: Readonly<Record<string, string>> = {},
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of columns) {
    const cell = raw[column.key];
    if (cell === undefined) continue;
    row[column.key] = coerceCell(column, cell, units[column.key]);
  }
  return row;
}
