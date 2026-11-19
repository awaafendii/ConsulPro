/**
 * Clé de comparaison insensible à la casse, aux accents et à la ponctuation. Sert au
 * rapprochement des en-têtes (mapping) et des libellés de choix (coercition). Pur.
 *
 * La plage des marques diacritiques combinantes (U+0300–U+036F) est construite par code de
 * caractère : les outils d'édition transforment une échappatoire `\uXXXX` littérale en
 * caractère réel, ce qui rendrait la source illisible (piège connu, voir CLAUDE.md).
 */

const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

/** Minuscule sans accents ni caractères non alphanumériques (ex. « X (Est) » → « xest »). */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
