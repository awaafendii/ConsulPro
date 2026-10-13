import type { Currency } from '../quantities/currency';

/**
 * Pays proposés pour une organisation (ISO 3166-1 alpha-2) et leur devise usuelle, préremplie à
 * la sélection du pays mais modifiable. Décision Q3 (2026-10-13) : la Guinée en priorité.
 * Le pays est une information de l'organisation : il ne choisit aucun référentiel.
 */
export const COUNTRIES = {
  GN: { currency: 'GNF' },
  SN: { currency: 'XOF' },
  CI: { currency: 'XOF' },
  ML: { currency: 'XOF' },
  BF: { currency: 'XOF' },
  NE: { currency: 'XOF' },
  BJ: { currency: 'XOF' },
  TG: { currency: 'XOF' },
  CM: { currency: 'XAF' },
  GA: { currency: 'XAF' },
  CG: { currency: 'XAF' },
  TD: { currency: 'XAF' },
  CF: { currency: 'XAF' },
  CD: { currency: 'CDF' },
  MA: { currency: 'MAD' },
  FR: { currency: 'EUR' },
} as const satisfies Record<string, { currency: Currency }>;

export type Country = keyof typeof COUNTRIES;

export const COUNTRY_CODES = Object.keys(COUNTRIES) as readonly Country[];

export const isCountry = (code: string): code is Country => Object.hasOwn(COUNTRIES, code);
