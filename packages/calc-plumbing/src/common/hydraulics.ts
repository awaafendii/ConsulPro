import {
  err,
  fromSI,
  ok,
  ParameterAccessError,
  type CalcContext,
  type ParameterRequirement,
  type Result,
  type TableCoordinates,
  type UnitSymbol,
} from '@consulpro/calc-core';

import { FIXTURE_LABELS, type Fixture, type Location, type Material } from './inputs';

/*
 * Formules partagées des moteurs de plomberie (NF DTU 60.11, Darcy-Weisbach et
 * Colebrook-White). Chaque étape est tracée ; aucune valeur normative n'est codée ici : elles
 * viennent des référentiels retenus par le projet.
 */

/** Pesanteur normale (valeur conventionnelle de la CGPM, 1901), en m/s². */
export const STANDARD_GRAVITY = 9.80665;

/** Nombre de Reynolds sous lequel l'écoulement est laminaire, et au-delà duquel il est turbulent. */
const LAMINAR_LIMIT = 2300;
const TURBULENT_LIMIT = 4000;

// --- Paramètres ----------------------------------------------------------------------------

export const CATALOG_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'plumbing.pipe.inner_diameter',
    kind: 'TABLE',
    unitKind: 'length',
    description: 'Diamètre intérieur des tubes par matériau et désignation',
  },
];

export const WATER_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'plumbing.water.density',
    kind: 'SCALAR',
    unitKind: 'density',
    description: 'Masse volumique de l’eau',
  },
];

export const FRICTION_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'plumbing.water.kinematic_viscosity',
    kind: 'TABLE',
    unitKind: 'kinematicViscosity',
    description: 'Viscosité cinématique de l’eau selon la température',
  },
  {
    key: 'plumbing.pipe.roughness',
    kind: 'TABLE',
    unitKind: 'length',
    description: 'Rugosité absolue des tubes neufs',
  },
];

export const BASE_FLOW_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'plumbing.fixture.base_flow',
    kind: 'TABLE',
    unitKind: 'flowRate',
    description: 'Débit de base des appareils sanitaires',
  },
  {
    key: 'plumbing.simultaneity.coefficient',
    kind: 'SCALAR',
    unitKind: 'dimensionless',
    description: 'Coefficient du coefficient de simultanéité',
  },
];

export const VELOCITY_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'plumbing.supply.max_velocity',
    kind: 'TABLE',
    unitKind: 'velocity',
    description: 'Vitesse maximale de l’eau selon l’emplacement',
  },
  {
    key: 'plumbing.supply.min_inner_diameter',
    kind: 'TABLE',
    unitKind: 'length',
    description: 'Diamètre intérieur minimal de l’alimentation d’un appareil',
  },
];

export const SINGULAR_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'plumbing.supply.singular_loss_ratio',
    kind: 'SCALAR',
    unitKind: 'dimensionless',
    description: 'Pertes de charge singulières forfaitaires',
  },
];

export const PRESSURE_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'plumbing.supply.min_pressure',
    kind: 'TABLE',
    unitKind: 'pressure',
    description: 'Pression minimale de fonctionnement des appareils',
  },
  {
    key: 'plumbing.supply.max_pressure',
    kind: 'SCALAR',
    unitKind: 'pressure',
    description: 'Pression statique maximale aux points de puisage',
  },
];

// --- Lecture des tables ------------------------------------------------------------------

/**
 * Valeur d'une table dans l'unité demandée ; `null` si la case est vide (dimension non
 * fabriquée). Toute autre impossibilité de lecture est une erreur de paramètre.
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

// --- Catalogue des tubes --------------------------------------------------------------------

export interface PipeSize {
  /** Désignation en mm (diamètre extérieur, ou DN pour l'acier). */
  readonly size: number;
  /** Diamètre intérieur (m, SI). */
  readonly inner: number;
}

/** Dimensions fabriquées d'un matériau, par désignation croissante. */
export function sizesOf(ctx: Pick<CalcContext, 'params'>, material: Material): PipeSize[] {
  return ctx.params.axisValues('plumbing.pipe.inner_diameter', 'size', 'mm').flatMap((size) => {
    const inner = tableValueOrNull(
      ctx,
      'plumbing.pipe.inner_diameter',
      { material, size: size * 1e-3 },
      'm',
    );
    return inner === null ? [] : [{ size, inner }];
  });
}

/**
 * Diamètre intérieur d'une désignation saisie (mm) ; null si elle n'existe pas dans le
 * catalogue ou n'est pas fabriquée dans ce matériau.
 */
export function innerDiameterOf(
  ctx: Pick<CalcContext, 'params'>,
  material: Material,
  size: number,
): number | null {
  const known = ctx.params
    .axisValues('plumbing.pipe.inner_diameter', 'size', 'mm')
    .find((s) => Math.abs(s - size) < 1e-6);
  return known === undefined
    ? null
    : tableValueOrNull(ctx, 'plumbing.pipe.inner_diameter', { material, size: known * 1e-3 }, 'm');
}

// --- Débits ---------------------------------------------------------------------------------

/** Coefficient de simultanéité y = a / √(x − 1) (1 pour un appareil, jamais au-delà de 1). */
export function simultaneity(coefficient: number, fixtures: number): number {
  return fixtures <= 1 ? 1 : Math.min(1, coefficient / Math.sqrt(fixtures - 1));
}

export interface FlowDemand {
  readonly fixtures: number;
  /** Somme des débits de base (m³/s). */
  readonly base: number;
  readonly simultaneity: number;
  /** Débit probable (m³/s). */
  readonly probable: number;
}

/** Débit de base, coefficient de simultanéité et débit probable, sans trace. */
export function demandOf(
  ctx: Pick<CalcContext, 'params'>,
  counts: ReadonlyMap<Fixture, number>,
): FlowDemand {
  let fixtures = 0;
  let base = 0;
  for (const [fixture, count] of counts) {
    fixtures += count;
    base += count * tableValue(ctx, 'plumbing.fixture.base_flow', { fixture }, 'm3/s');
  }
  const y = simultaneity(ctx.params.scalar('plumbing.simultaneity.coefficient', '1'), fixtures);
  return { fixtures, base, simultaneity: y, probable: y * base };
}

/** Débits tracés : débit de base, simultanéité, débit probable (trois étapes). */
export function tracedDemand(
  ctx: CalcContext,
  firstId: number,
  counts: ReadonlyMap<Fixture, number>,
): FlowDemand {
  const demand = demandOf(ctx, counts);
  const terms = [...counts].flatMap(([fixture, count]) => [
    { symbol: `n_{\\text{${FIXTURE_LABELS[fixture]}}}`, value: count },
    {
      symbol: `q_{\\text{${FIXTURE_LABELS[fixture]}}}`,
      value: tableValue(ctx, 'plumbing.fixture.base_flow', { fixture }, 'L/s'),
      unit: 'L/s' as const,
    },
  ]);
  ctx.trace.step({
    id: `T${String(firstId)}`,
    label: 'Débit de base',
    formula: 'Q_b = \\sum n_i \\, q_i',
    substitutions: terms,
    value: fromSI(demand.base, 'L/s'),
    unit: 'L/s',
    source: 'Référentiel NF DTU 60.11 (débits de base)',
  });
  const coefficient = ctx.params.scalar('plumbing.simultaneity.coefficient', '1');
  ctx.trace.step({
    id: `T${String(firstId + 1)}`,
    label: 'Coefficient de simultanéité',
    formula: 'y = \\min\\left(1, \\frac{a}{\\sqrt{x - 1}}\\right)',
    substitutions: [
      { symbol: 'a', value: coefficient },
      { symbol: 'x', value: demand.fixtures },
    ],
    value: demand.simultaneity,
    source: 'Référentiel NF DTU 60.11',
  });
  ctx.trace.step({
    id: `T${String(firstId + 2)}`,
    label: 'Débit probable',
    formula: 'Q_p = y \\, Q_b',
    substitutions: [
      { symbol: 'y', value: demand.simultaneity },
      { symbol: 'Q_b', value: fromSI(demand.base, 'L/s'), unit: 'L/s' },
    ],
    value: fromSI(demand.probable, 'L/s'),
    unit: 'L/s',
  });
  return demand;
}

// --- Diamètres ------------------------------------------------------------------------------

/** Vitesse dans un tube plein (m/s). */
export const velocityOf = (flowRate: number, inner: number): number =>
  (4 * flowRate) / (Math.PI * inner ** 2);

/** Diamètre intérieur minimal pour ne pas dépasser une vitesse (m). */
export const requiredDiameter = (flowRate: number, maxVelocity: number): number =>
  Math.sqrt((4 * flowRate) / (Math.PI * maxVelocity));

export const maxVelocityOf = (ctx: Pick<CalcContext, 'params'>, location: Location): number =>
  tableValue(ctx, 'plumbing.supply.max_velocity', { location }, 'm/s');

/** Plus grand diamètre intérieur minimal imposé par les appareils desservis (m), 0 sans appareil. */
export function fixtureMinDiameter(
  ctx: Pick<CalcContext, 'params'>,
  key: string,
  fixtures: Iterable<Fixture>,
): number {
  let minimum = 0;
  for (const fixture of fixtures) {
    minimum = Math.max(minimum, tableValue(ctx, key, { fixture }, 'm'));
  }
  return minimum;
}

/** Plus petite dimension du matériau dont le diamètre intérieur atteint `minimum` ; null sinon. */
export function smallestSize(
  ctx: Pick<CalcContext, 'params'>,
  material: Material,
  minimum: number,
): PipeSize | null {
  return sizesOf(ctx, material).find((s) => s.inner >= minimum) ?? null;
}

// --- Pertes de charge ------------------------------------------------------------------------

export interface ColebrookOptions {
  readonly tolerance: number;
  readonly maxIterations: number;
}

export const COLEBROOK_DEFAULTS: ColebrookOptions = { tolerance: 1e-12, maxIterations: 50 };

/**
 * Coefficient de perte de charge λ par l'équation de Colebrook-White, résolue par itération
 * sur x = 1/√λ à partir de l'approximation de Swamee-Jain. Échec si la précision relative
 * demandée n'est pas atteinte en `maxIterations` itérations.
 */
export function solveColebrook(
  reynolds: number,
  relativeRoughness: number,
  options: ColebrookOptions = COLEBROOK_DEFAULTS,
): Result<{ lambda: number; iterations: number }, { iterations: number }> {
  const start = 0.25 / Math.log10(relativeRoughness / 3.7 + 5.74 / reynolds ** 0.9) ** 2;
  let x = 1 / Math.sqrt(start);
  for (let iteration = 1; iteration <= options.maxIterations; iteration++) {
    const next = -2 * Math.log10(relativeRoughness / 3.7 + (2.51 * x) / reynolds);
    if (Math.abs(next - x) <= options.tolerance * Math.abs(next)) {
      return ok({ lambda: 1 / next ** 2, iterations: iteration });
    }
    x = next;
  }
  return err({ iterations: options.maxIterations });
}

export interface WaterProperties {
  /** Masse volumique (kg/m³). */
  readonly density: number;
  /** Viscosité cinématique (m²/s). */
  readonly viscosity: number;
}

export const waterDensity = (ctx: Pick<CalcContext, 'params'>): number =>
  ctx.params.scalar('plumbing.water.density', 'kg/m3');

/** Propriétés de l'eau à une température (K) : interpolation linéaire, sans extrapolation. */
export const waterOf = (
  ctx: Pick<CalcContext, 'params'>,
  temperature: number,
): WaterProperties => ({
  density: waterDensity(ctx),
  viscosity: tableValue(ctx, 'plumbing.water.kinematic_viscosity', { temperature }, 'm2/s'),
});

export const roughnessOf = (ctx: Pick<CalcContext, 'params'>, material: Material): number =>
  tableValue(ctx, 'plumbing.pipe.roughness', { material }, 'm');

/** Pertes singulières : somme des coefficients ζ saisie, ou part forfaitaire des pertes linéaires. */
export type Singular =
  | { readonly kind: 'COEFFICIENTS'; readonly sum: number }
  | { readonly kind: 'RATIO'; readonly ratio: number };

export interface LossInput {
  readonly flow: number;
  readonly inner: number;
  readonly length: number;
  readonly roughness: number;
  readonly water: WaterProperties;
  readonly singular: Singular;
}

export interface Loss {
  readonly velocity: number;
  readonly reynolds: number;
  readonly lambda: number;
  readonly iterations: number;
  /** Perte de charge linéique (Pa/m). */
  readonly gradient: number;
  readonly linear: number;
  readonly singular: number;
  readonly total: number;
}

export type LossFailure = { readonly code: 'COLEBROOK_NON_CONVERGENCE'; readonly reynolds: number };

/**
 * Pertes de charge d'un tronçon (Pa), sans trace : Darcy-Weisbach ; λ laminaire (64/Re) ou de
 * Colebrook-White. Débit nul : aucune perte.
 */
export function computeLoss(
  input: LossInput,
  options: ColebrookOptions = COLEBROOK_DEFAULTS,
): Result<Loss, LossFailure> {
  const velocity = velocityOf(input.flow, input.inner);
  if (velocity === 0) {
    return ok({
      velocity,
      reynolds: 0,
      lambda: 0,
      iterations: 0,
      gradient: 0,
      linear: 0,
      singular: 0,
      total: 0,
    });
  }
  const reynolds = (velocity * input.inner) / input.water.viscosity;
  let lambda: number;
  let iterations = 0;
  if (reynolds < LAMINAR_LIMIT) lambda = 64 / reynolds;
  else {
    const solved = solveColebrook(reynolds, input.roughness / input.inner, options);
    if (!solved.ok) return err({ code: 'COLEBROOK_NON_CONVERGENCE', reynolds });
    lambda = solved.value.lambda;
    iterations = solved.value.iterations;
  }
  const dynamic = (input.water.density * velocity ** 2) / 2;
  const gradient = (lambda / input.inner) * dynamic;
  const linear = gradient * input.length;
  const singular =
    input.singular.kind === 'COEFFICIENTS'
      ? input.singular.sum * dynamic
      : input.singular.ratio * linear;
  return ok({
    velocity,
    reynolds,
    lambda,
    iterations,
    gradient,
    linear,
    singular,
    total: linear + singular,
  });
}

/** Signale un écoulement de transition (Re entre 2 300 et 4 000) : λ de Colebrook retenu. */
export function warnTransition(ctx: CalcContext, reynolds: number, where = ''): void {
  if (reynolds >= LAMINAR_LIMIT && reynolds < TURBULENT_LIMIT) {
    ctx.warn.warn(
      'PLUMBING.TRANSITIONAL_FLOW',
      `Écoulement de transition${where} (Re = ${String(Math.round(reynolds))}) : λ de Colebrook-White retenu, sécuritaire.`,
    );
  }
}

/** Message d'échec de Colebrook-White. */
export const nonConvergence = (failure: LossFailure) => ({
  code: failure.code,
  message: `L’équation de Colebrook-White n’a pas convergé (Re = ${String(Math.round(failure.reynolds))}) : aucun résultat n’est présenté.`,
});

/** Pression hydrostatique d'un dénivelé (Pa) : ρ g Δz. */
export const hydrostatic = (density: number, height: number): number =>
  density * STANDARD_GRAVITY * height;
