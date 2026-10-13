import { err, ok, type Result } from '@consulpro/calc-core';

import type { DomainError } from '../errors';
import { isCurrency, type Currency } from '../quantities/currency';
import { isCountry, type Country } from './countries';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 48;
export const NAME_MAX = 120;

/** Segments réservés : ils entreraient en conflit avec des routes de l'application. */
const RESERVED_SLUGS = new Set([
  'api',
  'connexion',
  'inscription',
  'invitation',
  'mot-de-passe-oublie',
  'reinitialiser',
  'organisations',
  'nouveau',
  'admin',
  'static',
]);

export interface NewOrganization {
  readonly name: string;
  readonly slug: string;
}

export function validateNewOrganization(
  input: NewOrganization,
): Result<NewOrganization, DomainError> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > NAME_MAX) {
    return err({
      code: 'ORGANIZATION_NAME_INVALID',
      message: `Le nom doit comporter entre 2 et ${NAME_MAX} caractères.`,
    });
  }
  const slug = input.slug.trim();
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) {
    return err({
      code: 'ORGANIZATION_SLUG_INVALID',
      message: `L'identifiant doit comporter ${SLUG_MIN} à ${SLUG_MAX} caractères : minuscules, chiffres et tirets.`,
    });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return err({
      code: 'ORGANIZATION_SLUG_RESERVED',
      message: `L'identifiant « ${slug} » est réservé.`,
    });
  }
  return ok({ name, slug });
}

export interface OrganizationSettings {
  readonly name: string;
  readonly country: Country | null;
  readonly currency: Currency;
}

/** Paramètres modifiables d'une organisation : nom, pays, devise des quantitatifs. */
export function validateOrganizationSettings(input: {
  readonly name: string;
  readonly country: string | null;
  readonly currency: string;
}): Result<OrganizationSettings, DomainError> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > NAME_MAX) {
    return err({
      code: 'ORGANIZATION_NAME_INVALID',
      message: `Le nom doit comporter entre 2 et ${NAME_MAX} caractères.`,
    });
  }
  if (input.country !== null && !isCountry(input.country)) {
    return err({
      code: 'ORGANIZATION_COUNTRY_INVALID',
      message: `Le pays « ${input.country} » n’est pas proposé.`,
    });
  }
  if (!isCurrency(input.currency)) {
    return err({
      code: 'ORGANIZATION_CURRENCY_INVALID',
      message: `La devise « ${input.currency} » n’est pas proposée.`,
    });
  }
  return ok({ name, country: input.country, currency: input.currency });
}
