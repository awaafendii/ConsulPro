/**
 * Devises proposées pour les quantitatifs et les bibliothèques de prix (décision I5 :
 * devise par organisation). Nombre de décimales de l'unité monétaire : norme ISO 4217.
 * Aucune conversion entre devises n'est faite : un prix ne s'applique qu'à un quantitatif
 * de la même devise.
 */
export const CURRENCIES = {
  XOF: { decimals: 0 },
  XAF: { decimals: 0 },
  GNF: { decimals: 0 },
  CDF: { decimals: 2 },
  MAD: { decimals: 2 },
  EUR: { decimals: 2 },
  USD: { decimals: 2 },
} as const satisfies Record<string, { decimals: number }>;

export type Currency = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as readonly Currency[];

export const isCurrency = (code: string): code is Currency => Object.hasOwn(CURRENCIES, code);

/** Décimales de l'unité monétaire (XOF : 0, EUR : 2). */
export const currencyDecimals = (currency: Currency): number => CURRENCIES[currency].decimals;
