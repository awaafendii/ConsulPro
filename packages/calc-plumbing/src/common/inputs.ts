import { quantity } from '@consulpro/calc-core';
import { z } from 'zod';

/*
 * Schémas d'entrée communs aux moteurs de plomberie. Les bornes écartent les saisies hors du
 * domaine du bâtiment (ou absurdes), pas les choix de conception.
 */

// --- Appareils sanitaires (codes des tables du NF DTU 60.11) -----------------------------

export const FIXTURES = [
  'SINK',
  'WASHBASIN',
  'HAND_BASIN',
  'BIDET',
  'BATHTUB',
  'SHOWER',
  'WC_CISTERN',
  'WC_FLUSH_VALVE',
  'URINAL',
  'LAUNDRY_TUB',
  'WASHING_MACHINE',
  'DISHWASHER',
  'TAP_15',
  'TAP_20',
] as const;
export const fixtureSchema = z.enum(FIXTURES);
export type Fixture = z.infer<typeof fixtureSchema>;

export const FIXTURE_LABELS: Readonly<Record<Fixture, string>> = {
  SINK: 'Évier',
  WASHBASIN: 'Lavabo',
  HAND_BASIN: 'Lave-mains',
  BIDET: 'Bidet',
  BATHTUB: 'Baignoire',
  SHOWER: 'Douche',
  WC_CISTERN: 'WC à réservoir de chasse',
  WC_FLUSH_VALVE: 'WC à robinet de chasse',
  URINAL: 'Urinoir',
  LAUNDRY_TUB: 'Bac à laver',
  WASHING_MACHINE: 'Lave-linge',
  DISHWASHER: 'Lave-vaisselle',
  TAP_15: 'Poste d’eau (robinet DN 15)',
  TAP_20: 'Poste d’eau (robinet DN 20)',
};

/** Saisie directe des appareils : une entrée entière facultative par type. */
export const FIXTURE_COUNT_KEYS: Readonly<Record<Fixture, string>> = {
  SINK: 'sink',
  WASHBASIN: 'washbasin',
  HAND_BASIN: 'handBasin',
  BIDET: 'bidet',
  BATHTUB: 'bathtub',
  SHOWER: 'shower',
  WC_CISTERN: 'wcCistern',
  WC_FLUSH_VALVE: 'wcFlushValve',
  URINAL: 'urinal',
  LAUNDRY_TUB: 'laundryTub',
  WASHING_MACHINE: 'washingMachine',
  DISHWASHER: 'dishwasher',
  TAP_15: 'tap15',
  TAP_20: 'tap20',
};

const fixtureCount = z.number().int().min(0).max(10_000);

/** Champs `{ sink?: n, washbasin?: n, … }` d'un schéma d'entrée. */
export const fixtureCountFields = Object.fromEntries(
  FIXTURES.map((f) => [FIXTURE_COUNT_KEYS[f], fixtureCount.optional()]),
) as Record<string, z.ZodOptional<typeof fixtureCount>>;

/** Nombre d'appareils par type, d'après les champs saisis (types absents : zéro). */
export function countsFromFields(input: Readonly<Record<string, unknown>>): Map<Fixture, number> {
  const counts = new Map<Fixture, number>();
  for (const fixture of FIXTURES) {
    const value = input[FIXTURE_COUNT_KEYS[fixture]];
    if (typeof value === 'number' && value > 0) counts.set(fixture, value);
  }
  return counts;
}

export const FIXTURE_COUNT_INPUTS = FIXTURES.map((f) => ({
  key: FIXTURE_COUNT_KEYS[f],
  label: `Nombre : ${FIXTURE_LABELS[f]}`,
  kind: 'integer' as const,
  min: 0,
  optional: true,
}));

// --- Canalisations (décision Q8) -----------------------------------------------------------

export const MATERIALS = [
  'PVC_PN16',
  'PVC_DRAIN',
  'PPR_PN20',
  'PEHD_PN16',
  'CU',
  'STEEL_GALV',
] as const;
export type Material = (typeof MATERIALS)[number];

export const SUPPLY_MATERIALS = ['PVC_PN16', 'PPR_PN20', 'PEHD_PN16', 'CU', 'STEEL_GALV'] as const;
export const supplyMaterialSchema = z.enum(SUPPLY_MATERIALS);
export type SupplyMaterial = z.infer<typeof supplyMaterialSchema>;

export const MATERIAL_LABELS: Readonly<Record<Material, string>> = {
  PVC_PN16: 'Tube PVC pression PN16',
  PVC_DRAIN: 'Tube PVC évacuation',
  PPR_PN20: 'Tube PPR PN20',
  PEHD_PN16: 'Tube PEHD PN16',
  CU: 'Tube cuivre',
  STEEL_GALV: 'Tube acier galvanisé',
};

/** Désignation d'une dimension : diamètre extérieur, ou DN pour l'acier. */
export const sizeLabel = (material: Material, size: number): string =>
  material === 'STEEL_GALV' ? `DN${String(size)}` : `Ø${String(size)}`;

export const locationSchema = z.enum(['FLOOR', 'BASEMENT']);
export type Location = z.infer<typeof locationSchema>;

// --- Grandeurs -----------------------------------------------------------------------------

/** Débit d'eau strictement positif (1 m³/s au plus). */
export const flow = quantity('flowRate', { min: 0, exclusiveMin: true, max: 1 });
/** Longueur de canalisation (10 km au plus). */
export const pipeLength = quantity('length', { min: 0, exclusiveMin: true, max: 10_000 });
/** Pression relative (20 bar au plus). */
export const pressure = quantity('pressure', { min: 0, max: 2e6 });
/** Dénivelé : cote du point moins cote de l'origine (± 500 m). */
export const heightDifference = quantity('length', { min: -500, max: 500 });
/** Température de l'eau : 0 à 80 °C (bornes en kelvins, SI). */
export const waterTemperature = quantity('temperature', { min: 273.15, max: 353.15 });
/** Désignation d'un tube (diamètre extérieur ou DN), 6 à 500 mm. */
export const pipeSize = quantity('length', { min: 0.006, max: 0.5 });
/** Diamètre intérieur imposé (1 m au plus). */
export const innerDiameterInput = quantity('length', { min: 0, exclusiveMin: true, max: 1 });
/** Pente ou part (en %), strictement positive, 100 % au plus. */
export const positivePercent = quantity('dimensionless', { min: 0, exclusiveMin: true, max: 1 });

export const persons = z.number().int().min(1).max(100_000);

/**
 * Valeur qu'un raffinement du schéma garantit (champ exigé selon un autre champ) ; son absence
 * trahit une incohérence interne (erreur du moteur), jamais une valeur par défaut silencieuse.
 */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === undefined || value === null) {
    throw new Error(`${what} : valeur exigée par le schéma, absente`);
  }
  return value;
}

// --- Présentation ---------------------------------------------------------------------------

export const FLOW_INPUT = {
  key: 'flow',
  label: 'Débit',
  kind: 'quantity',
  unitKind: 'flowRate',
  units: ['L/s', 'm3/h', 'L/min'],
} as const;

export const SUPPLY_MATERIAL_INPUT = {
  key: 'material',
  label: 'Matériau des tubes',
  kind: 'enum',
  options: SUPPLY_MATERIALS.map((m) => ({ value: m, label: MATERIAL_LABELS[m] })),
} as const;

export const LOCATION_INPUT = {
  key: 'location',
  label: 'Emplacement',
  kind: 'enum',
  options: [
    { value: 'FLOOR', label: 'En étage' },
    { value: 'BASEMENT', label: 'Sous-sol ou vide sanitaire' },
  ],
  help: 'La vitesse maximale admise en dépend (NF DTU 60.11).',
} as const;

export const TEMPERATURE_INPUT = {
  key: 'temperature',
  label: 'Température de l’eau',
  kind: 'quantity',
  unitKind: 'temperature',
  units: ['degC'],
  help: 'Elle fixe la viscosité de l’eau. Eau froide en Guinée : souvent 25 à 30 °C.',
} as const;

export const UPSTREAM_PRESSURE_INPUT = {
  key: 'upstreamPressure',
  label: 'Pression disponible à l’origine',
  kind: 'quantity',
  unitKind: 'pressure',
  units: ['kPa', 'bar', 'mCE'],
  help: 'Pression du réseau public, du surpresseur ou hauteur d’eau du réservoir.',
} as const;

export const PLUMBING_HYPOTHESIS = {
  code: 'PLUMBING.STEADY_FLOW',
  text: 'Écoulement permanent d’eau à la température indiquée ; installation neuve (rugosité des tubes neufs).',
} as const;
