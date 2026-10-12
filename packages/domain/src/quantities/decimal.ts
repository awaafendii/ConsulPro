import { err, ok, type Result } from '@consulpro/calc-core';

import type { DomainError } from '../errors';

/*
 * Décimaux exacts des quantitatifs (05-conventions : l'argent n'est jamais un `number`).
 * Une valeur est un entier BigInt exprimé en dix-millièmes, exactement comme une colonne
 * NUMERIC(18,4) ; l'API la transporte en chaîne (« 1250.5 »). Aucun flottant n'intervient
 * dans les montants : produit exact, puis arrondi bancaire à l'unité monétaire de la devise.
 */

/** Nombre de décimales stockées (NUMERIC(18,4)). */
export const DECIMAL_SCALE = 4;
const FACTOR = 10n ** BigInt(DECIMAL_SCALE);
/** 14 chiffres avant la virgule au plus (NUMERIC(18,4)). */
const MAX = 10n ** 18n - 1n;
const PATTERN = /^(\d{1,14})(?:\.(\d{1,4}))?$/;

/** Valeur décimale exacte, en dix-millièmes. */
export type Decimal = bigint;

/** Lit une décimale positive ou nulle (« 12 », « 12.5 », « 0.0004 ») ; 4 décimales au plus. */
export function parseDecimal(text: string): Result<Decimal, DomainError> {
  const match = PATTERN.exec(text.trim());
  if (!match) {
    return err({
      code: 'DECIMAL_INVALID',
      message: 'Nombre positif attendu, avec 14 chiffres et 4 décimales au plus (ex. 1250.5).',
    });
  }
  const units = BigInt(match[1] ?? '0');
  const fraction = BigInt((match[2] ?? '').padEnd(DECIMAL_SCALE, '0'));
  return ok(units * FACTOR + fraction);
}

/** Écriture canonique, sans zéros superflus : 12.5000 → « 12.5 », 12.0000 → « 12 ». */
export function formatDecimal(value: Decimal): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const units = abs / FACTOR;
  const fraction = (abs % FACTOR).toString().padStart(DECIMAL_SCALE, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${units.toString()}${fraction ? `.${fraction}` : ''}`;
}

/**
 * Arrondi bancaire (au pair le plus proche) d'un entier exprimé avec `scale` décimales,
 * ramené à `decimals` décimales, puis réexprimé en dix-millièmes.
 */
function roundHalfEven(value: bigint, scale: number, decimals: number): Decimal {
  const drop = 10n ** BigInt(scale - decimals);
  let quotient = value / drop;
  const remainder = value % drop;
  const twice = 2n * (remainder < 0n ? -remainder : remainder);
  if (twice > drop || (twice === drop && quotient % 2n !== 0n)) {
    quotient += value < 0n ? -1n : 1n;
  }
  return quotient * 10n ** BigInt(DECIMAL_SCALE - decimals);
}

/** Arrondit une décimale à `decimals` décimales (0 à 4), au pair le plus proche. */
export function roundDecimal(value: Decimal, decimals: number): Decimal {
  return roundHalfEven(value, DECIMAL_SCALE, checkDecimals(decimals));
}

/**
 * Produit exact `a × b`, arrondi au pair le plus proche à `decimals` décimales :
 * montant d'une ligne = quantité × prix unitaire, à l'unité monétaire de la devise.
 */
export function multiplyDecimal(a: Decimal, b: Decimal, decimals: number): Decimal {
  return roundHalfEven(a * b, 2 * DECIMAL_SCALE, checkDecimals(decimals));
}

/**
 * Quantité calculée par un moteur (double précision) convertie en décimale, à la précision
 * déclarée par le moteur (4 décimales au plus). `null` si la valeur n'est pas représentable
 * (négative, non finie, hors NUMERIC(18,4)).
 */
export function decimalFromNumber(value: number, precision: number): Decimal | null {
  if (!Number.isFinite(value) || value < 0 || value >= 1e14) return null;
  if (!Number.isInteger(precision) || precision < 0) {
    throw new RangeError(`Précision invalide : ${String(precision)}`);
  }
  const parsed = parseDecimal(value.toFixed(Math.min(precision, DECIMAL_SCALE)));
  return parsed.ok ? parsed.value : null;
}

/** Valeur dans les bornes de NUMERIC(18,4). */
export const isStorableDecimal = (value: Decimal): boolean => value >= 0n && value <= MAX;

/** Somme exacte. */
export const sumDecimals = (values: Iterable<Decimal>): Decimal => {
  let total = 0n;
  for (const value of values) total += value;
  return total;
};

function checkDecimals(decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > DECIMAL_SCALE) {
    throw new RangeError(
      `Nombre de décimales hors de [0, ${String(DECIMAL_SCALE)}] : ${String(decimals)}`,
    );
  }
  return decimals;
}
