import type { OutputPresentation, ParameterRequirement } from '@consulpro/calc-core';
import { z } from 'zod';

import type { Materials } from './quantities';

/** Sortie numérique positive ou nulle. */
export const nonNegative = z.number().nonnegative();

/** Matériaux d'un béton ou d'un mortier, communs à tous les moteurs (mêmes clés : cumul). */
export const materialShape = {
  cement: nonNegative,
  cementBags: nonNegative,
  sand: nonNegative,
  gravel: nonNegative,
  water: nonNegative,
};

export const MATERIAL_OUTPUTS: readonly OutputPresentation[] = [
  { key: 'cement', label: 'Ciment', unit: 'kg', precision: 0, family: 'MATERIAL', additive: true },
  {
    key: 'cementBags',
    label: 'Ciment (sacs, valeur exacte)',
    unit: '1',
    precision: 1,
    family: 'MATERIAL',
    additive: true,
  },
  { key: 'sand', label: 'Sable', unit: 'm3', precision: 3, family: 'MATERIAL', additive: true },
  { key: 'gravel', label: 'Gravier', unit: 'm3', precision: 3, family: 'MATERIAL', additive: true },
  { key: 'water', label: 'Eau', unit: 'L', precision: 0, family: 'MATERIAL', additive: true },
];

export function materialValues(materials: Materials, bags: number) {
  return {
    cement: materials.cement,
    cementBags: bags,
    sand: materials.sand,
    gravel: materials.gravel,
    water: materials.water,
  };
}

/** Réunit des listes de paramètres en écartant les doublons (une déclaration par clé). */
export function requirements(
  ...lists: readonly (readonly ParameterRequirement[])[]
): ParameterRequirement[] {
  const byKey = new Map<string, ParameterRequirement>();
  for (const list of lists) for (const r of list) byKey.set(r.key, r);
  return [...byKey.values()];
}

export const BTP_HYPOTHESIS = {
  code: 'BTP.QUANTITIES_ONLY',
  text: 'Calcul de quantités (métré) : aucun dimensionnement structurel. Les sections et aciers sont ceux saisis ou estimés par ratio.',
} as const;
