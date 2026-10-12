/*
 * Affichage et saisie des décimales exactes de l'API (« 1250.5 »). Intl formate directement la
 * chaîne (aucun passage par un flottant) ; les montants arrivent déjà arrondis par le serveur.
 */

type NumericString = `${number}`;

const asNumeric = (value: string) => value as NumericString;

/** Quantité : jusqu'à 4 décimales, sans zéros superflus (« 3,456 »). */
export function formatQuantity(value: string, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(asNumeric(value));
}

/** Montant dans la devise (« 224 640 F CFA »), à l'unité monétaire de la devise. */
export function formatMoney(value: string, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(asNumeric(value));
}

/** Prix unitaire : la devise, mais toutes les décimales saisies (4 au plus). */
export function formatUnitPrice(value: string, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 4,
  }).format(asNumeric(value));
}

/** Nom de la devise (« franc CFA (BCEAO) »), ou son code si inconnu. */
export function currencyName(currency: string, locale: string): string {
  return new Intl.DisplayNames(locale, { type: 'currency' }).of(currency) ?? currency;
}

const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;

/**
 * Saisie française vers la forme de l'API : espaces retirés (\s couvre les espaces
 * insécables), virgule décimale acceptée.
 * `null` si la saisie n'est pas un nombre positif à 4 décimales au plus.
 */
export function parseDecimalInput(text: string): string | null {
  const normalized = text.replace(/\s/g, '').replace(',', '.');
  return DECIMAL.test(normalized) ? normalized : null;
}

/** Forme de saisie d'une décimale de l'API (virgule décimale). */
export const toDecimalInput = (value: string | null): string => (value ?? '').replace('.', ',');
