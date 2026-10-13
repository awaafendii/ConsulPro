import { quantity } from '@consulpro/calc-core';
import { z } from 'zod';

/*
 * Schémas d'entrée communs aux moteurs électriques. Les bornes écartent les saisies hors du
 * domaine de la basse tension (ou absurdes), pas les choix de conception.
 */

/** Réseau : monophasé (phase et neutre) ou triphasé. */
export const systemSchema = z.enum(['MONO', 'TRI']);
export type System = z.infer<typeof systemSchema>;

/** Tension nominale : V entre phase et neutre en monophasé, U entre phases en triphasé. */
export const voltage = quantity('voltage', { min: 0, exclusiveMin: true, max: 1000 });

/** Puissance active strictement positive (10 MW au plus). */
export const power = quantity('power', { min: 0, exclusiveMin: true, max: 1e7 });

/** Facteur de puissance cos φ, dans ]0 ; 1]. */
export const cosPhi = quantity('dimensionless', { min: 0, exclusiveMin: true, max: 1 });

/** Courant strictement positif (6 300 A au plus). */
export const current = quantity('current', { min: 0, exclusiveMin: true, max: 6300 });

/** Courant de court-circuit ou pouvoir de coupure (200 kA au plus). */
export const shortCircuitCurrent = quantity('current', {
  min: 0,
  exclusiveMin: true,
  max: 200_000,
});

/** Longueur de canalisation (2 km au plus). */
export const length = quantity('length', { min: 0, exclusiveMin: true, max: 2000 });

/** Section d'âme : 0,5 à 1 000 mm². */
export const section = quantity('area', { min: 0.5e-6, max: 1000e-6 });

/** Température ambiante (air) : −10 à 70 °C, en kelvins pour les bornes (SI). */
export const ambient = quantity('temperature', { min: 263.15, max: 343.15 });

/** Chute de tension en amont, en % (0 à 20 %). */
export const upstreamDrop = quantity('dimensionless', { min: 0, max: 0.2 });

export const deviceSchema = z.enum(['BREAKER', 'FUSE_GG']);
export type Device = z.infer<typeof deviceSchema>;

export const methodSchema = z.enum(['B', 'C', 'E']);
export const insulationSchema = z.enum(['PVC', 'PR']);
export const arrangementSchema = z.enum(['BUNCHED', 'SINGLE_LAYER']);
export const materialSchema = z.enum(['CU', 'AL']);
export const usageSchema = z.enum(['LIGHTING', 'OTHER']);
export const supplySchema = z.enum(['PUBLIC_LV', 'PRIVATE_SUBSTATION']);

/** Nombre de circuits jointifs (y compris celui calculé). */
export const circuits = z.number().int().min(1).max(100);

/** Le mode de pose est exigé dès que le circuit est groupé avec d'autres. */
export function arrangementRequired(
  input: { circuits?: number | undefined; arrangement?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if ((input.circuits ?? 1) > 1 && input.arrangement === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['arrangement'],
      message: 'Précisez la disposition des circuits groupés.',
      params: { code: 'ARRANGEMENT_REQUIRED' },
    });
  }
}

// --- Présentation (formulaires) -----------------------------------------------------------

export const SYSTEM_INPUT = {
  key: 'system',
  label: 'Réseau',
  kind: 'enum',
  options: [
    { value: 'MONO', label: 'Monophasé (phase et neutre)' },
    { value: 'TRI', label: 'Triphasé' },
  ],
} as const;

export const VOLTAGE_INPUT = {
  key: 'voltage',
  label: 'Tension nominale',
  kind: 'quantity',
  unitKind: 'voltage',
  units: ['V', 'kV'],
  help: 'V entre phase et neutre en monophasé (ex. 230 V) ; U entre phases en triphasé (ex. 400 V).',
} as const;

export const COS_PHI_INPUT = {
  key: 'cosPhi',
  label: 'Facteur de puissance cos φ',
  kind: 'quantity',
  unitKind: 'dimensionless',
  units: ['1'],
} as const;

export const POWER_INPUT = {
  key: 'power',
  label: 'Puissance active absorbée',
  kind: 'quantity',
  unitKind: 'power',
  units: ['kW', 'W'],
} as const;

export const CURRENT_INPUT = {
  key: 'current',
  label: 'Courant d’emploi I_B',
  kind: 'quantity',
  unitKind: 'current',
  units: ['A'],
} as const;

export const DEVICE_INPUT = {
  key: 'device',
  label: 'Dispositif de protection',
  kind: 'enum',
  options: [
    { value: 'BREAKER', label: 'Disjoncteur' },
    { value: 'FUSE_GG', label: 'Fusible gG' },
  ],
} as const;

export const RATING_INPUT = {
  key: 'rating',
  label: 'Calibre de la protection I_n',
  kind: 'quantity',
  unitKind: 'current',
  units: ['A'],
  optional: true,
  help: 'Sans saisie : plus petit calibre normalisé au moins égal à I_B (référentiel).',
} as const;

export const SIZING_INPUTS = [
  {
    key: 'method',
    label: 'Méthode de référence (mode de pose)',
    kind: 'enum',
    options: [
      { value: 'B', label: 'B — conduits ou goulottes, encastrés ou apparents' },
      { value: 'C', label: 'C — câbles fixés sur paroi' },
      { value: 'E', label: 'E — câbles multiconducteurs à l’air libre ou sur chemin perforé' },
    ],
  },
  {
    key: 'insulation',
    label: 'Isolant',
    kind: 'enum',
    options: [
      { value: 'PVC', label: 'PVC (70 °C)' },
      { value: 'PR', label: 'PR / EPR (90 °C)' },
    ],
  },
  {
    key: 'ambient',
    label: 'Température ambiante',
    kind: 'quantity',
    unitKind: 'temperature',
    units: ['degC'],
    help: 'Obligatoire : en Afrique de l’Ouest, souvent 35 à 40 °C ou plus. Lue à la valeur du tableau immédiatement supérieure.',
  },
  {
    key: 'circuits',
    label: 'Nombre de circuits jointifs',
    kind: 'integer',
    min: 1,
    optional: true,
    help: 'Circuit compris. Sans saisie : circuit seul.',
  },
  {
    key: 'arrangement',
    label: 'Disposition des circuits groupés',
    kind: 'enum',
    optional: true,
    options: [
      { value: 'BUNCHED', label: 'En faisceau, enfermés ou noyés' },
      { value: 'SINGLE_LAYER', label: 'Simple couche sur paroi ou plancher' },
    ],
  },
] as const;

export const DROP_INPUTS = [
  {
    key: 'usage',
    label: 'Usage du circuit',
    kind: 'enum',
    options: [
      { value: 'LIGHTING', label: 'Éclairage' },
      { value: 'OTHER', label: 'Autres usages' },
    ],
  },
  {
    key: 'supply',
    label: 'Alimentation de l’installation',
    kind: 'enum',
    options: [
      { value: 'PUBLIC_LV', label: 'Réseau public basse tension' },
      { value: 'PRIVATE_SUBSTATION', label: 'Poste HTA/BT privé' },
    ],
  },
  {
    key: 'upstream',
    label: 'Chute de tension en amont',
    kind: 'quantity',
    unitKind: 'dimensionless',
    units: ['%'],
    optional: true,
    help: 'Depuis l’origine de l’installation jusqu’au tableau du circuit. Sans saisie : 0 %.',
  },
] as const;

export const ELEC_HYPOTHESIS = {
  code: 'ELEC.STEADY_STATE',
  text: 'Régime permanent sinusoïdal à 50 Hz ; en triphasé, charge équilibrée (neutre non chargé).',
} as const;
