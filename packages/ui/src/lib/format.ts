/*
 * Formatage pour l'affichage (05-conventions §3) : espace insécable comme séparateur
 * de milliers, virgule décimale. Aucun arrondi n'est appliqué aux valeurs stockées ;
 * seul l'affichage est arrondi, selon la précision demandée.
 */

/** Espace insécable et espace fine insécable (typographie française). */
const NBSP = String.fromCharCode(0xa0);
const NARROW_NBSP = String.fromCharCode(0x202f);

const cache = new Map<string, Intl.NumberFormat>();

function formatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', options);
    cache.set(key, f);
  }
  return f;
}

/** Nombre avec un nombre fixe de décimales. */
export function formatNumber(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '—';
  return formatter({ minimumFractionDigits: precision, maximumFractionDigits: precision }).format(
    value,
  );
}

/** Nombre sans précision déclarée : au plus `maxDecimals` décimales, sans zéros inutiles. */
export function formatAuto(value: number, maxDecimals = 4): string {
  if (!Number.isFinite(value)) return '—';
  return formatter({ maximumFractionDigits: maxDecimals }).format(value);
}

/** Valeur suivie de son unité (espace insécable ; espace fine insécable avant `%`). */
export function withUnit(text: string, unit: string | undefined): string {
  if (!unit) return text;
  return unit === '%' ? `${text}${NARROW_NBSP}%` : `${text}${NBSP}${unit}`;
}

/** Affichage d'une unité à partir de son symbole (dictionnaire fourni par l'API). */
export function unitLabel(
  symbol: string | undefined,
  units: Readonly<Record<string, string>>,
): string | undefined {
  if (symbol === undefined || symbol === '1') return undefined;
  return units[symbol] ?? symbol;
}

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export function formatDateTime(value: Date | string): string {
  return dateTime.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDate(value: Date | string): string {
  return dateOnly.format(typeof value === 'string' ? new Date(value) : value);
}
