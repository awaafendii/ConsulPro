/**
 * Cœur du pipeline d'import (Phase 7). Package pur et déterministe : il transforme une
 * entrée brute (fichier ou collage) en grille de chaînes, puis — dans les modules à venir —
 * en lignes typées à valider par le domaine (`validateRows`). Aucune I/O, aucun aléa.
 */

export { DELIMITERS, parseDelimited, sniffDelimiter } from './delimited';
export type { Delimiter, Grid } from './delimited';

export { detectFormat, isXlsx } from './detect';
export type { SourceFormat } from './detect';
