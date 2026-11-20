/**
 * Parseur délimité pur (CSV, TSV, collage Excel/Word) → grille de chaînes.
 *
 * Conforme RFC 4180 : champs facultativement entre guillemets doubles, guillemet
 * littéral échappé par doublement (`""`), séparateur et retour à la ligne autorisés
 * dans un champ cité, fins de ligne CRLF ou LF, marque d'ordre des octets (BOM) retirée.
 *
 * Déterministe et sans dépendance : aucune I/O, aucun aléa (principe P2). La grille n'est
 * pas typée ni validée ici — c'est le rôle du mapping puis de `validateRows` (domaine).
 */

/** Grille brute : ligne d'en-têtes + lignes de cellules, toutes en chaînes. */
export interface Grid {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** Séparateurs reconnus. L'ordre fixe le départage en cas d'égalité (virgule d'abord). */
export const DELIMITERS = [',', ';', '\t'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/** Retire la marque d'ordre des octets (U+FEFF) en tête de texte, si présente. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Première ligne physique (jusqu'au premier CR/LF), pour deviner le séparateur. */
function firstLine(text: string): string {
  const index = text.search(/\r|\n/);
  return index === -1 ? text : text.slice(0, index);
}

/** Compte les occurrences d'un caractère hors des zones entre guillemets. */
function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line.charAt(i);
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch === delimiter) {
      count += 1;
    }
  }
  return count;
}

/**
 * Devine le séparateur d'après la première ligne : celui qui apparaît le plus souvent
 * (hors guillemets). En l'absence de tout séparateur, la virgule (colonne unique).
 */
export function sniffDelimiter(text: string): Delimiter {
  const line = firstLine(stripBom(text));
  let best: Delimiter = DELIMITERS[0];
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    const count = countOutsideQuotes(line, delimiter);
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

/** Machine à états RFC 4180 : texte → enregistrements (tableaux de champs bruts). */
function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = (): void => {
    record.push(field);
    field = '';
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      if (text.charAt(i + 1) === '\n') i += 1;
      endRecord();
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Fin de l'entrée : clôturer le dernier enregistrement seulement s'il a du contenu, afin
  // qu'un retour à la ligne final ne crée pas d'enregistrement vide fantôme.
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

/**
 * Analyse un texte délimité en grille. La première ligne est l'en-tête. Le séparateur est
 * fourni ou deviné. Un texte vide (ou réduit au BOM) donne une grille vide.
 */
export function parseDelimited(input: string, delimiter?: Delimiter): Grid {
  const text = stripBom(input);
  const records = parseRecords(text, delimiter ?? sniffDelimiter(text));
  const [headers = [], ...rows] = records;
  return { headers, rows };
}
