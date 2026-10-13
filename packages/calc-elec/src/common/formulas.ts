import {
  fromSI,
  ParameterAccessError,
  type CalcContext,
  type ParameterRequirement,
  type TableCoordinates,
  type UnitSymbol,
} from '@consulpro/calc-core';

import type { Device, System } from './inputs';

/*
 * Formules partagées des moteurs électriques (UTE C 15-105, NF C 15-100). Chaque étape est
 * tracée (formule, substitutions, résultat) ; aucune valeur normative n'est codée ici : elles
 * viennent des référentiels retenus par le projet.
 */

export const SQRT3 = Math.sqrt(3);

export const PROTECTION_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'elec.protection.k2',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Courant conventionnel de fonctionnement I2 / In, par dispositif et calibre',
  },
  {
    key: 'elec.overload.i2_limit',
    kind: 'SCALAR',
    unitKind: 'dimensionless',
    description: 'Rapport maximal I2 / Iz (protection contre les surcharges)',
  },
];

export const SIZING_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'elec.cable.iz',
    kind: 'TABLE',
    unitKind: 'current',
    description: 'Courants admissibles des canalisations',
  },
  {
    key: 'elec.cable.temperature_factor',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Facteur de correction de température ambiante',
  },
  {
    key: 'elec.cable.grouping_factor',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Facteur de correction de groupement',
  },
];

export const DROP_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'elec.conductor.resistivity',
    kind: 'TABLE',
    unitKind: 'resistivity',
    description: 'Résistivité des conducteurs en service (ρ1)',
  },
  {
    key: 'elec.conductor.reactance',
    kind: 'SCALAR',
    unitKind: 'linearReactance',
    description: 'Réactance linéique des conducteurs (λ)',
  },
  {
    key: 'elec.voltage_drop.limit',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Chute de tension maximale admise',
  },
];

/**
 * Valeur d'une table dans l'unité demandée ; `null` si la case est vide (calibre ou section
 * absent de la gamme). Toute autre impossibilité de lecture est une erreur de paramètre.
 */
export function tableValueOrNull(
  ctx: Pick<CalcContext, 'params'>,
  key: string,
  coordinates: TableCoordinates,
  unit: UnitSymbol,
): number | null {
  const reading = ctx.params.table(key, coordinates);
  if (!reading.ok) {
    if (reading.error.code === 'CELL_UNDEFINED') return null;
    throw new ParameterAccessError(key, `${key} : ${reading.error.message}`);
  }
  // Stryker disable next-line ConditionalExpression: équivalent à l’arrondi près (évite un aller-retour SI).
  return reading.value.unit === unit ? reading.value.value : fromSI(reading.value.si, unit);
}

/** Valeur d'une table : une case vide est aussi une erreur de paramètre, jamais une valeur. */
export function tableValue(
  ctx: Pick<CalcContext, 'params'>,
  key: string,
  coordinates: TableCoordinates,
  unit: UnitSymbol,
): number {
  const value = tableValueOrNull(ctx, key, coordinates, unit);
  if (value === null) {
    throw new ParameterAccessError(key, `${key} : la table ne définit pas de valeur ici.`);
  }
  return value;
}

/** Tension simple U0 (entre phase et neutre). */
export const phaseVoltage = (system: System, voltage: number): number =>
  system === 'MONO' ? voltage : voltage / SQRT3;

/** Courant d'emploi et puissance apparente d'un récepteur (en A et en VA). */
export function designCurrent(
  ctx: CalcContext,
  id: string,
  input: { power: number; system: System; voltage: number; cosPhi: number },
): { current: number; apparent: number } {
  const apparent = input.power / input.cosPhi;
  const mono = input.system === 'MONO';
  const current = mono ? apparent / input.voltage : apparent / (SQRT3 * input.voltage);
  ctx.trace.step({
    id,
    label: 'Courant d’emploi',
    formula: mono
      ? 'I_B = \\frac{P}{V \\cos\\varphi}'
      : 'I_B = \\frac{P}{\\sqrt{3}\\, U \\cos\\varphi}',
    substitutions: [
      { symbol: 'P', value: input.power, unit: 'W' },
      { symbol: mono ? 'V' : 'U', value: input.voltage, unit: 'V' },
      { symbol: '\\cos\\varphi', value: input.cosPhi },
    ],
    value: current,
    unit: 'A',
    source: 'UTE C 15-105 (courant d’emploi)',
  });
  return { current, apparent };
}

/** I2 / In du dispositif pour un calibre normalisé (lecture exacte). */
export function k2Of(ctx: CalcContext, device: Device, rating: number): number {
  const key = 'elec.protection.k2';
  const value = tableValueOrNull(ctx, key, { device, rating }, '1');
  if (value === null) {
    throw new ParameterAccessError(
      key,
      `${key} : calibre de ${String(rating)} A absent de la gamme normalisée du dispositif.`,
    );
  }
  return value;
}

/**
 * Calibre de la protection : celui saisi, sinon le plus petit calibre normalisé du dispositif
 * au moins égal au courant d'emploi (hypothèse tracée). `null` si aucun ne convient.
 */
export function protectionRating(
  ctx: CalcContext,
  id: string,
  input: { device: Device; current: number; rating?: number | undefined },
): { rating: number; k2: number } | null {
  if (input.rating !== undefined) {
    const k2 = k2Of(ctx, input.device, input.rating);
    ctx.trace.step({
      id,
      label: 'Calibre de la protection (saisi)',
      formula: 'I_2 = k_2 \\, I_n',
      substitutions: [
        { symbol: 'I_n', value: input.rating, unit: 'A' },
        { symbol: 'k_2', value: k2 },
      ],
      value: k2 * input.rating,
      unit: 'A',
      source: 'Référentiel UTE C 15-105 (elec.protection.k2)',
    });
    return { rating: input.rating, k2 };
  }
  ctx.assume.defaulted(
    'rating',
    'NORMALIZED',
    'Calibre : plus petit calibre normalisé du dispositif au moins égal à I_B.',
  );
  for (const rating of ctx.params.axisValues('elec.protection.k2', 'rating', 'A')) {
    if (rating < input.current) continue;
    const k2 = tableValueOrNull(ctx, 'elec.protection.k2', { device: input.device, rating }, '1');
    if (k2 === null) continue;
    ctx.trace.step({
      id,
      label: 'Calibre normalisé retenu',
      formula: 'I_n = \\min \\{ I_n^{norm} \\geq I_B \\} ; \\; I_2 = k_2 \\, I_n',
      substitutions: [
        { symbol: 'I_B', value: input.current, unit: 'A' },
        { symbol: 'k_2', value: k2 },
      ],
      value: rating,
      unit: 'A',
      source: 'Référentiel UTE C 15-105 (elec.protection.k2)',
    });
    return { rating, k2 };
  }
  return null;
}

/** Facteurs de correction : température ambiante et groupement (1 pour un circuit seul). */
export function correctionFactors(
  ctx: CalcContext,
  id: string,
  input: {
    insulation: string;
    ambient: number;
    circuits: number;
    arrangement?: string | undefined;
  },
): { temperature: number; grouping: number; total: number } {
  const temperature = tableValue(
    ctx,
    'elec.cable.temperature_factor',
    { insulation: input.insulation, ambient: input.ambient },
    '1',
  );
  const grouping =
    input.circuits === 1
      ? 1
      : tableValue(
          ctx,
          'elec.cable.grouping_factor',
          // Stryker disable next-line StringLiteral: inaccessible, le schéma exige la disposition dès 2 circuits.
          { arrangement: input.arrangement ?? '', circuits: input.circuits },
          '1',
        );
  const total = temperature * grouping;
  ctx.trace.step({
    id,
    label: 'Facteurs de correction',
    formula: 'f = f_T \\times f_G',
    substitutions: [
      { symbol: '\\theta_a', value: fromSI(input.ambient, 'degC'), unit: 'degC' },
      { symbol: 'f_T', value: temperature },
      { symbol: 'n', value: input.circuits },
      { symbol: 'f_G', value: grouping },
    ],
    value: total,
    source: 'Référentiel NF C 15-100 (tableaux 52K et 52N)',
  });
  return { temperature, grouping, total };
}

/**
 * Plus petite section du tableau dont le courant admissible atteint le courant requis
 * (cases vides ignorées), strictement supérieure à `above` (mm²) s'il est fourni. `null` sinon.
 */
export function smallestSection(
  ctx: CalcContext,
  input: { method: string; insulation: string; loaded: string; required: number },
  above = 0,
): { section: number; iz: number } | null {
  for (const section of ctx.params.axisValues('elec.cable.iz', 'section', 'mm2')) {
    if (section <= above) continue;
    const iz = tableValueOrNull(
      ctx,
      'elec.cable.iz',
      {
        method: input.method,
        insulation: input.insulation,
        loaded: input.loaded,
        section: section * 1e-6,
      },
      'A',
    );
    // Stryker disable next-line ConditionalExpression: équivalent (null >= requis est faux).
    if (iz !== null && iz >= input.required) return { section, iz };
  }
  return null;
}

/** Résistivité ρ1 (Ω·m, SI) et réactance linéique λ (Ω/m) des conducteurs. */
export function lineConstants(ctx: CalcContext, material: string) {
  return {
    resistivity: tableValue(ctx, 'elec.conductor.resistivity', { material }, 'ohm.m'),
    reactance: ctx.params.scalar('elec.conductor.reactance', 'ohm/m'),
  };
}

export interface DropInput {
  readonly system: System;
  /** ρ1 (Ω·m), λ (Ω/m), L (m), S (m²), I_B (A), U0 (V). */
  readonly resistivity: number;
  readonly reactance: number;
  readonly length: number;
  readonly section: number;
  readonly current: number;
  readonly cosPhi: number;
  readonly phaseVoltage: number;
}

/**
 * Chute de tension d'un circuit (UTE C 15-105) : b = 2 en monophasé, 1 en triphasé ;
 * rapportée à la tension simple U0. Renvoie ΔU (V) et ΔU (%), sans tracer.
 */
export function computeDrop(input: DropInput): { b: number; drop: number; percent: number } {
  const b = input.system === 'MONO' ? 2 : 1;
  const sin = Math.sqrt(1 - input.cosPhi ** 2);
  const drop =
    b *
    ((input.resistivity * input.length * input.cosPhi) / input.section +
      input.reactance * input.length * sin) *
    input.current;
  return { b, drop, percent: (100 * drop) / input.phaseVoltage };
}

/** Chute de tension, tracée. */
export function voltageDrop(
  ctx: CalcContext,
  id: string,
  input: DropInput,
): { drop: number; percent: number } {
  const { b, drop, percent } = computeDrop(input);
  ctx.trace.step({
    id,
    label: 'Chute de tension',
    formula:
      '\\Delta U = b \\left( \\rho_1 \\frac{L}{S} \\cos\\varphi + \\lambda L \\sin\\varphi \\right) I_B ; \\; \\Delta U\\% = 100 \\frac{\\Delta U}{U_0}',
    substitutions: [
      { symbol: 'b', value: b },
      { symbol: '\\rho_1', value: fromSI(input.resistivity, 'ohm.mm2/m'), unit: 'ohm.mm2/m' },
      { symbol: 'L', value: input.length, unit: 'm' },
      { symbol: 'S', value: fromSI(input.section, 'mm2'), unit: 'mm2' },
      { symbol: '\\lambda', value: fromSI(input.reactance, 'mohm/m'), unit: 'mohm/m' },
      { symbol: 'I_B', value: input.current, unit: 'A' },
      { symbol: 'U_0', value: input.phaseVoltage, unit: 'V' },
    ],
    value: percent,
    unit: '%',
    source: 'UTE C 15-105 (chutes de tension)',
  });
  return { drop, percent };
}

/** Valeur d'une grandeur saisie dans l'unité demandée (sans conversion si c'est la sienne). */
export const inUnit = (measured: { value: number; unit: string; si: number }, unit: UnitSymbol) =>
  // Stryker disable next-line ConditionalExpression: « toujours convertir » est équivalent à l’arrondi près.
  measured.unit === unit ? measured.value : fromSI(measured.si, unit);

/** Limite de chute de tension (%) selon l'alimentation et l'usage. */
export const dropLimit = (ctx: CalcContext, supply: string, usage: string): number =>
  tableValue(ctx, 'elec.voltage_drop.limit', { supply, usage }, '%');
