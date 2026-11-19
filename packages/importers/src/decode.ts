/**
 * Décodage des octets source en texte, tolérant à l'encodage. Les fichiers CSV « Excel FR »
 * sont souvent en Windows-1252 (ANSI), pas en UTF-8 : décoder un tel fichier en UTF-8
 * corromprait les accents. On tente donc l'UTF-8 strict d'abord (il rejette les séquences
 * invalides), et on se rabat sur Windows-1252 — qui n'échoue jamais — en cas de rejet.
 *
 * Pur et déterministe : `TextDecoder` est une transformation sans I/O ni état. La marque
 * d'ordre des octets éventuelle (UTF-8 BOM) est retirée par le décodeur, puis par les
 * parseurs en aval ; Windows-1252 n'a pas de BOM.
 */

/** Décode des octets en chaîne : UTF-8 si valide, sinon Windows-1252 (sans jamais lever). */
export function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
