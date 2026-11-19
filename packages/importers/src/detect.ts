/**
 * Détection du format d'un contenu importé, à partir de ses octets. Un classeur XLSX est
 * une archive ZIP : il commence par la signature locale `PK\x03\x04`. Tout le reste est
 * traité comme texte délimité (CSV, TSV, collage). Pur et déterministe.
 */

export type SourceFormat = 'xlsx' | 'delimited';

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;

/** `true` si les octets commencent par la signature ZIP (donc un classeur XLSX probable). */
export function isXlsx(bytes: Uint8Array): boolean {
  if (bytes.length < ZIP_SIGNATURE.length) return false;
  return ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

/** Déduit le format depuis les octets : XLSX si signature ZIP, sinon texte délimité. */
export function detectFormat(bytes: Uint8Array): SourceFormat {
  return isXlsx(bytes) ? 'xlsx' : 'delimited';
}
