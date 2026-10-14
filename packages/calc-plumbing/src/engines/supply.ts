import {
  breakdownSchema,
  checkLimit,
  err,
  fromSI,
  ok,
  quantity,
  type BreakdownEntry,
  type CalcContext,
  type EngineDefinition,
  type FormulaDoc,
} from '@consulpro/calc-core';
import { z } from 'zod';

import {
  BASE_FLOW_PARAMETERS,
  CATALOG_PARAMETERS,
  computeLoss,
  FRICTION_PARAMETERS,
  fixtureMinDiameter,
  hydrostatic,
  innerDiameterOf,
  maxVelocityOf,
  nonConvergence,
  PRESSURE_PARAMETERS,
  requiredDiameter,
  roughnessOf,
  SINGULAR_PARAMETERS,
  smallestSize,
  STANDARD_GRAVITY,
  tableValue,
  tracedDemand,
  demandOf,
  velocityOf,
  VELOCITY_PARAMETERS,
  warnTransition,
  WATER_PARAMETERS,
  waterDensity,
  waterOf,
  type Loss,
  type PipeSize,
} from '../common/hydraulics';
import {
  countsFromFields,
  FIXTURE_COUNT_INPUTS,
  FIXTURE_LABELS,
  fixtureCountFields,
  fixtureSchema,
  flow,
  FLOW_INPUT,
  heightDifference,
  innerDiameterInput,
  LOCATION_INPUT,
  locationSchema,
  MATERIAL_LABELS,
  pipeLength,
  pipeSize,
  PLUMBING_HYPOTHESIS,
  pressure,
  required,
  sizeLabel,
  SUPPLY_MATERIAL_INPUT,
  supplyMaterialSchema,
  TEMPERATURE_INPUT,
  UPSTREAM_PRESSURE_INPUT,
  waterTemperature,
  type Fixture,
} from '../common/inputs';

/* Alimentation en eau froide et chaude (NF DTU 60.11) : débits, diamètres, pertes, pressions. */

const nonNegative = z.number().nonnegative();

const SIMULTANEITY_HYPOTHESIS = {
  code: 'PLUMBING.SIMULTANEITY_DTU',
  text: 'Débit probable par le coefficient de simultanéité du NF DTU 60.11 (y = a / √(x − 1)), pour des appareils d’usage courant ; à adapter aux usages intensifs (douches collectives, écoles).',
} as const;

const DTU_SOURCE = 'NF DTU 60.11 (partie 1-1)';

const DEMAND_FORMULA: FormulaDoc = {
  id: 'probable-flow',
  label: 'Débit probable',
  latex: 'Q_b = \\sum n_i \\, q_i ; \\; y = \\frac{a}{\\sqrt{x - 1}} ; \\; Q_p = y \\, Q_b',
  symbols: [
    { symbol: 'n_i', meaning: 'nombre d’appareils du type i' },
    { symbol: 'q_i', meaning: 'débit de base d’un appareil du type i', unit: 'L/s' },
    { symbol: 'x', meaning: 'nombre total d’appareils desservis' },
    { symbol: 'y', meaning: 'coefficient de simultanéité' },
    { symbol: 'Q_p', meaning: 'débit probable', unit: 'L/s' },
  ],
  source: DTU_SOURCE,
};

const LOSS_FORMULA: FormulaDoc = {
  id: 'head-loss',
  label: 'Pertes de charge (Darcy-Weisbach, Colebrook-White)',
  latex:
    '\\Delta P = \\lambda \\frac{L}{D} \\frac{\\rho v^2}{2} ; \\; \\frac{1}{\\sqrt{\\lambda}} = -2 \\log_{10}\\left(\\frac{\\varepsilon}{3{,}7 D} + \\frac{2{,}51}{Re \\sqrt{\\lambda}}\\right)',
  symbols: [
    { symbol: '\\lambda', meaning: 'coefficient de perte de charge' },
    { symbol: 'L', meaning: 'longueur du tronçon', unit: 'm' },
    { symbol: 'D', meaning: 'diamètre intérieur', unit: 'mm' },
    { symbol: 'v', meaning: 'vitesse moyenne', unit: 'm/s' },
    { symbol: '\\varepsilon', meaning: 'rugosité absolue', unit: 'mm' },
    { symbol: 'Re', meaning: 'nombre de Reynolds' },
  ],
  source: 'Darcy-Weisbach ; Colebrook-White (λ = 64/Re en régime laminaire)',
};

const noSize = (what: string) =>
  err({
    code: 'NO_SIZE',
    message: `Aucune dimension du référentiel ne convient${what} : prévoyez un autre matériau ou plusieurs canalisations.`,
  });

// --- Débits ---------------------------------------------------------------------------------

const inventoryRow = z.object({
  level: z.string().nullable().optional(),
  room: z.string().nullable().optional(),
  fixture: fixtureSchema,
  count: z.number().int().min(1).max(1000),
});

/** Appareils saisis un à un, ou lus dans un inventaire (jamais les deux). */
function oneSource(
  input: Readonly<Record<string, unknown>> & { inventory?: readonly unknown[] | undefined },
  ctx: z.RefinementCtx,
): void {
  const direct = countsFromFields(input).size > 0;
  if (input.inventory !== undefined && direct) {
    ctx.addIssue({
      code: 'custom',
      path: ['inventory'],
      message: 'Saisissez les appareils ou choisissez un inventaire, pas les deux.',
      params: { code: 'SOURCE_CONFLICT' },
    });
  } else if (!direct && (input.inventory === undefined || input.inventory.length === 0)) {
    ctx.addIssue({
      code: 'custom',
      path: ['inventory'],
      message: 'Saisissez au moins un appareil ou choisissez un inventaire.',
      params: { code: 'NO_FIXTURE' },
    });
  }
}

const flowRatesInput = z
  .object({ ...fixtureCountFields, inventory: z.array(inventoryRow).max(5000).optional() })
  .superRefine(oneSource);

const flowRatesOutput = z.object({
  fixtureCount: z.number().int().positive(),
  baseFlow: nonNegative,
  simultaneity: z.number().gt(0).lte(1),
  probableFlow: nonNegative,
  fixtures: breakdownSchema,
});

/** Appareils par type : saisie directe ou inventaire (somme de ses lignes). */
function countsOf(input: z.output<typeof flowRatesInput>): Map<Fixture, number> {
  if (input.inventory === undefined) return countsFromFields(input);
  const counts = new Map<Fixture, number>();
  for (const row of input.inventory) {
    counts.set(row.fixture, (counts.get(row.fixture) ?? 0) + row.count);
  }
  return counts;
}

export const plumbingFlowRates: EngineDefinition<
  z.output<typeof flowRatesInput>,
  z.output<typeof flowRatesOutput>
> = {
  id: 'plumbing.flow-rates',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Débits',
  inputSchema: flowRatesInput,
  outputSchema: flowRatesOutput,
  parameters: BASE_FLOW_PARAMETERS,
  formulas: [DEMAND_FORMULA],
  hypotheses: [SIMULTANEITY_HYPOTHESIS],
  presentation: {
    description:
      'Débit de base des appareils, coefficient de simultanéité et débit probable d’un groupe d’appareils.',
    inputs: [
      ...FIXTURE_COUNT_INPUTS,
      {
        key: 'inventory',
        label: 'Inventaire des appareils sanitaires',
        kind: 'dataset',
        datasetKind: 'SANITARY_FIXTURES',
        optional: true,
        help: 'À la place de la saisie appareil par appareil : la révision courante est lue et tracée.',
      },
    ],
    outputs: [
      { key: 'fixtureCount', label: 'Nombre d’appareils x', unit: '1', precision: 0 },
      { key: 'baseFlow', label: 'Débit de base Q_b', unit: 'L/s', precision: 3 },
      { key: 'simultaneity', label: 'Coefficient de simultanéité y', unit: '1', precision: 3 },
      { key: 'probableFlow', label: 'Débit probable Q_p', unit: 'L/s', precision: 3 },
      {
        key: 'fixtures',
        label: 'Appareils sanitaires',
        unit: '1',
        precision: 0,
        family: 'FIXTURES',
        breakdown: true,
      },
    ],
  },
  calculate(i, ctx) {
    const counts = countsOf(i);
    const demand = tracedDemand(ctx, 1, counts);
    const fixtures: BreakdownEntry[] = [...counts].map(([fixture, count]) => ({
      key: fixture,
      label: FIXTURE_LABELS[fixture],
      group: 'FIXTURES',
      groupLabel: 'Appareils sanitaires',
      value: count,
    }));
    return ok({
      fixtureCount: demand.fixtures,
      baseFlow: fromSI(demand.base, 'L/s'),
      simultaneity: demand.simultaneity,
      probableFlow: fromSI(demand.probable, 'L/s'),
      fixtures,
    });
  },
  verify() {
    return [];
  },
};

// --- Diamètres ------------------------------------------------------------------------------

const sizingInput = z.object({
  flow,
  material: supplyMaterialSchema,
  location: locationSchema,
  minInnerDiameter: innerDiameterInput.optional(),
});
const sizingOutput = z.object({
  requiredDiameter: nonNegative,
  size: z.number().positive(),
  innerDiameter: z.number().positive(),
  velocity: nonNegative,
  maxVelocity: z.number().positive(),
});

const velocityCheck = (velocity: number, limit: number) =>
  checkLimit({
    rule: 'plumbing.supply.velocity',
    label: 'Vitesse de l’eau au plus égale à la vitesse maximale admise',
    measured: velocity,
    limit,
    comparison: '<=',
    severity: 'BLOCKING',
    unit: 'm/s',
    clause: 'P1-1',
  });

export const plumbingPipeSizing: EngineDefinition<
  z.output<typeof sizingInput>,
  z.output<typeof sizingOutput>
> = {
  id: 'plumbing.pipe-sizing',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Diamètre d’une canalisation',
  inputSchema: sizingInput,
  outputSchema: sizingOutput,
  parameters: [...CATALOG_PARAMETERS, ...VELOCITY_PARAMETERS.slice(0, 1)],
  formulas: [
    {
      id: 'pipe-sizing',
      label: 'Diamètre intérieur minimal',
      latex:
        'D_{min} = \\sqrt{\\frac{4 Q}{\\pi \\, v_{max}}} ; \\; v = \\frac{4 Q}{\\pi D_{int}^2}',
      symbols: [
        { symbol: 'Q', meaning: 'débit', unit: 'L/s' },
        { symbol: 'v_{max}', meaning: 'vitesse maximale admise', unit: 'm/s' },
        { symbol: 'D_{int}', meaning: 'diamètre intérieur du tube retenu', unit: 'mm' },
      ],
      source: DTU_SOURCE,
    },
  ],
  hypotheses: [PLUMBING_HYPOTHESIS],
  presentation: {
    description:
      'Plus petit tube du matériau choisi dont la vitesse ne dépasse pas la vitesse maximale admise.',
    inputs: [
      FLOW_INPUT,
      SUPPLY_MATERIAL_INPUT,
      LOCATION_INPUT,
      {
        key: 'minInnerDiameter',
        label: 'Diamètre intérieur minimal imposé',
        kind: 'quantity',
        unitKind: 'length',
        units: ['mm'],
        optional: true,
        help: 'Par exemple le diamètre minimal de l’alimentation d’un appareil.',
      },
    ],
    outputs: [
      { key: 'requiredDiameter', label: 'Diamètre intérieur minimal', unit: 'mm', precision: 1 },
      { key: 'size', label: 'Tube retenu (désignation)', unit: 'mm', precision: 0 },
      { key: 'innerDiameter', label: 'Diamètre intérieur du tube', unit: 'mm', precision: 1 },
      { key: 'velocity', label: 'Vitesse', unit: 'm/s', precision: 2 },
      { key: 'maxVelocity', label: 'Vitesse maximale admise', unit: 'm/s', precision: 2 },
    ],
  },
  calculate(i, ctx) {
    const maxVelocity = maxVelocityOf(ctx, i.location);
    const required = requiredDiameter(i.flow.si, maxVelocity);
    const minimum = Math.max(required, i.minInnerDiameter?.si ?? 0);
    ctx.trace.step({
      id: 'T1',
      label: 'Diamètre intérieur minimal',
      formula: 'D_{min} = \\max\\left(\\sqrt{\\frac{4 Q}{\\pi \\, v_{max}}}, D_{imposé}\\right)',
      substitutions: [
        { symbol: 'Q', value: fromSI(i.flow.si, 'L/s'), unit: 'L/s' },
        { symbol: 'v_{max}', value: maxVelocity, unit: 'm/s' },
        { symbol: 'D_{imposé}', value: fromSI(i.minInnerDiameter?.si ?? 0, 'mm'), unit: 'mm' },
      ],
      value: fromSI(minimum, 'mm'),
      unit: 'mm',
      source: 'Référentiel NF DTU 60.11 (vitesses maximales)',
    });
    const chosen = smallestSize(ctx, i.material, minimum);
    if (!chosen) return noSize(` au débit de ${fromSI(i.flow.si, 'L/s').toFixed(2)} L/s`);
    const velocity = velocityOf(i.flow.si, chosen.inner);
    ctx.trace.step({
      id: 'T2',
      label: `Tube retenu : ${MATERIAL_LABELS[i.material]} ${sizeLabel(i.material, chosen.size)}`,
      formula: 'D_{int} \\geq D_{min} ; \\; v = \\frac{4 Q}{\\pi D_{int}^2}',
      substitutions: [
        { symbol: 'D_{min}', value: fromSI(minimum, 'mm'), unit: 'mm' },
        { symbol: 'D_{int}', value: fromSI(chosen.inner, 'mm'), unit: 'mm' },
      ],
      value: velocity,
      unit: 'm/s',
      source: 'Référentiel des dimensions de tubes',
    });
    return ok({
      requiredDiameter: fromSI(minimum, 'mm'),
      size: chosen.size,
      innerDiameter: fromSI(chosen.inner, 'mm'),
      velocity,
      maxVelocity,
    });
  },
  verify(_i, out) {
    return [velocityCheck(out.velocity, out.maxVelocity)];
  },
};

// --- Pertes de charge -------------------------------------------------------------------------

const lossInput = z.object({
  flow,
  material: supplyMaterialSchema,
  size: pipeSize,
  length: pipeLength,
  temperature: waterTemperature,
  singularCoefficients: quantity('dimensionless', { min: 0, max: 1000 }).optional(),
});
const lossOutput = z.object({
  innerDiameter: z.number().positive(),
  velocity: nonNegative,
  reynolds: nonNegative,
  frictionFactor: nonNegative,
  gradient: nonNegative,
  linearLoss: nonNegative,
  singularLoss: nonNegative,
  totalLoss: nonNegative,
  totalHead: nonNegative,
});

/** Étapes détaillées d'une perte de charge (à partir de `firstId`). */
function traceLoss(
  ctx: CalcContext,
  firstId: number,
  input: { flow: number; inner: number; length: number; roughness: number; viscosity: number },
  loss: Loss,
  singular: string,
): void {
  const id = (k: number) => `T${String(firstId + k)}`;
  ctx.trace.step({
    id: id(0),
    label: 'Vitesse et nombre de Reynolds',
    formula: 'v = \\frac{4 Q}{\\pi D^2} ; \\; Re = \\frac{v D}{\\nu}',
    substitutions: [
      { symbol: 'Q', value: fromSI(input.flow, 'L/s'), unit: 'L/s' },
      { symbol: 'D', value: fromSI(input.inner, 'mm'), unit: 'mm' },
      { symbol: 'v', value: loss.velocity, unit: 'm/s' },
      { symbol: '\\nu', value: fromSI(input.viscosity, 'mm2/s'), unit: 'mm2/s' },
    ],
    value: loss.reynolds,
  });
  ctx.trace.step({
    id: id(1),
    label: 'Coefficient de perte de charge',
    formula:
      loss.iterations === 0
        ? '\\lambda = \\frac{64}{Re}'
        : '\\frac{1}{\\sqrt{\\lambda}} = -2 \\log_{10}\\left(\\frac{\\varepsilon}{3{,}7 D} + \\frac{2{,}51}{Re \\sqrt{\\lambda}}\\right)',
    substitutions: [
      { symbol: 'Re', value: loss.reynolds },
      { symbol: '\\varepsilon', value: fromSI(input.roughness, 'mm'), unit: 'mm' },
      { symbol: 'n', value: loss.iterations },
    ],
    value: loss.lambda,
    source:
      loss.iterations === 0
        ? 'Écoulement laminaire (Re < 2 300)'
        : `Colebrook-White, convergence en ${String(loss.iterations)} itération(s)`,
  });
  ctx.trace.step({
    id: id(2),
    label: 'Pertes de charge linéaires',
    formula: 'j = \\frac{\\lambda}{D} \\frac{\\rho v^2}{2} ; \\; \\Delta P_l = j \\, L',
    substitutions: [
      { symbol: 'j', value: loss.gradient, unit: 'Pa/m' },
      { symbol: 'L', value: input.length, unit: 'm' },
    ],
    value: fromSI(loss.linear, 'kPa'),
    unit: 'kPa',
  });
  ctx.trace.step({
    id: id(3),
    label: 'Pertes de charge singulières',
    formula: singular,
    substitutions: [{ symbol: '\\Delta P_l', value: fromSI(loss.linear, 'kPa'), unit: 'kPa' }],
    value: fromSI(loss.singular, 'kPa'),
    unit: 'kPa',
  });
}

export const plumbingHeadLoss: EngineDefinition<
  z.output<typeof lossInput>,
  z.output<typeof lossOutput>
> = {
  id: 'plumbing.head-loss',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Pertes de charge',
  inputSchema: lossInput,
  outputSchema: lossOutput,
  parameters: [
    ...CATALOG_PARAMETERS,
    ...FRICTION_PARAMETERS,
    ...WATER_PARAMETERS,
    ...SINGULAR_PARAMETERS,
  ],
  formulas: [LOSS_FORMULA],
  hypotheses: [PLUMBING_HYPOTHESIS],
  presentation: {
    description:
      'Pertes de charge linéaires (Darcy-Weisbach, λ de Colebrook-White itératif) et singulières d’un tronçon.',
    inputs: [
      FLOW_INPUT,
      SUPPLY_MATERIAL_INPUT,
      {
        key: 'size',
        label: 'Tube (désignation)',
        kind: 'quantity',
        unitKind: 'length',
        units: ['mm'],
        help: 'Diamètre extérieur, ou DN pour l’acier galvanisé.',
      },
      { key: 'length', label: 'Longueur', kind: 'quantity', unitKind: 'length', units: ['m'] },
      TEMPERATURE_INPUT,
      {
        key: 'singularCoefficients',
        label: 'Somme des coefficients de pertes singulières Σζ',
        kind: 'quantity',
        unitKind: 'dimensionless',
        units: ['1'],
        optional: true,
        help: 'Sans saisie : part forfaitaire des pertes linéaires (référentiel).',
      },
    ],
    outputs: [
      { key: 'innerDiameter', label: 'Diamètre intérieur', unit: 'mm', precision: 1 },
      { key: 'velocity', label: 'Vitesse', unit: 'm/s', precision: 2 },
      { key: 'reynolds', label: 'Nombre de Reynolds', unit: '1', precision: 0 },
      { key: 'frictionFactor', label: 'Coefficient de perte de charge λ', unit: '1', precision: 4 },
      { key: 'gradient', label: 'Perte de charge linéique j', unit: 'Pa/m', precision: 1 },
      { key: 'linearLoss', label: 'Pertes linéaires', unit: 'kPa', precision: 2 },
      { key: 'singularLoss', label: 'Pertes singulières', unit: 'kPa', precision: 2 },
      { key: 'totalLoss', label: 'Pertes totales', unit: 'kPa', precision: 2 },
      { key: 'totalHead', label: 'Pertes totales (hauteur d’eau)', unit: 'mCE', precision: 2 },
    ],
  },
  calculate(i, ctx) {
    const size = fromSI(i.size.si, 'mm');
    const inner = innerDiameterOf(ctx, i.material, size);
    if (inner === null) {
      return noSize(
        ` : ${MATERIAL_LABELS[i.material]} ${sizeLabel(i.material, size)} n’est pas fabriqué`,
      );
    }
    const water = waterOf(ctx, i.temperature.si);
    const roughness = roughnessOf(ctx, i.material);
    let singular: Parameters<typeof computeLoss>[0]['singular'];
    let formula: string;
    if (i.singularCoefficients === undefined) {
      const ratio = ctx.params.scalar('plumbing.supply.singular_loss_ratio', '1');
      ctx.assume.defaulted(
        'singularCoefficients',
        `${String(ratio * 100)} %`,
        'Pertes singulières forfaitaires : part des pertes linéaires (référentiel d’usages).',
      );
      singular = { kind: 'RATIO', ratio };
      formula = `\\Delta P_s = ${String(ratio)} \\, \\Delta P_l`;
    } else {
      singular = { kind: 'COEFFICIENTS', sum: i.singularCoefficients.si };
      formula = `\\Delta P_s = ${String(i.singularCoefficients.si)} \\, \\frac{\\rho v^2}{2}`;
    }
    const computed = computeLoss({
      flow: i.flow.si,
      inner,
      length: i.length.si,
      roughness,
      water,
      singular,
    });
    if (!computed.ok) return err(nonConvergence(computed.error));
    const loss = computed.value;
    warnTransition(ctx, loss.reynolds);
    traceLoss(
      ctx,
      1,
      { flow: i.flow.si, inner, length: i.length.si, roughness, viscosity: water.viscosity },
      loss,
      formula,
    );
    ctx.trace.step({
      id: 'T5',
      label: 'Pertes de charge totales',
      formula: '\\Delta P = \\Delta P_l + \\Delta P_s',
      substitutions: [
        { symbol: '\\Delta P_l', value: fromSI(loss.linear, 'kPa'), unit: 'kPa' },
        { symbol: '\\Delta P_s', value: fromSI(loss.singular, 'kPa'), unit: 'kPa' },
      ],
      value: fromSI(loss.total, 'kPa'),
      unit: 'kPa',
    });
    return ok({
      innerDiameter: fromSI(inner, 'mm'),
      velocity: loss.velocity,
      reynolds: loss.reynolds,
      frictionFactor: loss.lambda,
      gradient: loss.gradient,
      linearLoss: fromSI(loss.linear, 'kPa'),
      singularLoss: fromSI(loss.singular, 'kPa'),
      totalLoss: fromSI(loss.total, 'kPa'),
      totalHead: fromSI(loss.total, 'mCE'),
    });
  },
  verify() {
    return [];
  },
};

// --- Pressions --------------------------------------------------------------------------------

const pressureInput = z.object({
  upstreamPressure: pressure,
  heightDifference,
  losses: pressure,
  fixture: fixtureSchema,
});
const pressureOutput = z.object({
  hydrostatic: z.number(),
  staticPressure: z.number(),
  availablePressure: z.number(),
  minPressure: nonNegative,
  maxPressure: nonNegative,
});

const minPressureCheck = (measured: number, limit: number, where = '') =>
  checkLimit({
    rule: 'plumbing.supply.min-pressure',
    label: `Pression disponible au moins égale à la pression minimale de l’appareil${where}`,
    measured,
    limit,
    comparison: '>=',
    severity: 'BLOCKING',
    unit: 'kPa',
  });
const maxPressureCheck = (measured: number, limit: number) =>
  checkLimit({
    rule: 'plumbing.supply.max-pressure',
    label: 'Pression statique au plus égale à la pression maximale aux points de puisage',
    measured,
    limit,
    comparison: '<=',
    severity: 'WARNING',
    unit: 'kPa',
    clause: 'P1-1',
  });

const minPressureOf = (ctx: Pick<CalcContext, 'params'>, fixture: Fixture) =>
  tableValue(ctx, 'plumbing.supply.min_pressure', { fixture }, 'kPa');

export const plumbingPressureCheck: EngineDefinition<
  z.output<typeof pressureInput>,
  z.output<typeof pressureOutput>
> = {
  id: 'plumbing.pressure-check',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Pression au point de puisage',
  inputSchema: pressureInput,
  outputSchema: pressureOutput,
  parameters: [...WATER_PARAMETERS, ...PRESSURE_PARAMETERS],
  formulas: [
    {
      id: 'available-pressure',
      label: 'Pression disponible',
      latex: 'P = P_0 - \\rho g \\Delta z - \\Delta P',
      symbols: [
        { symbol: 'P_0', meaning: 'pression disponible à l’origine', unit: 'kPa' },
        { symbol: '\\Delta z', meaning: 'dénivelé du point au-dessus de l’origine', unit: 'm' },
        {
          symbol: '\\Delta P',
          meaning: 'pertes de charge entre l’origine et le point',
          unit: 'kPa',
        },
      ],
      source: DTU_SOURCE,
    },
  ],
  hypotheses: [PLUMBING_HYPOTHESIS],
  presentation: {
    description:
      'Pression disponible au point de puisage (amont, dénivelé, pertes de charge) comparée aux pressions minimale et maximale.',
    inputs: [
      UPSTREAM_PRESSURE_INPUT,
      {
        key: 'heightDifference',
        label: 'Dénivelé du point au-dessus de l’origine',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        help: 'Positif si le point est plus haut que l’origine.',
      },
      {
        key: 'losses',
        label: 'Pertes de charge jusqu’au point',
        kind: 'quantity',
        unitKind: 'pressure',
        units: ['kPa', 'mCE', 'bar'],
        help: 'Résultat d’un calcul de pertes de charge du projet, par exemple.',
      },
      {
        key: 'fixture',
        label: 'Appareil alimenté',
        kind: 'enum',
        options: Object.entries(FIXTURE_LABELS).map(([value, label]) => ({ value, label })),
      },
    ],
    outputs: [
      {
        key: 'hydrostatic',
        label: 'Pression hydrostatique du dénivelé',
        unit: 'kPa',
        precision: 1,
      },
      { key: 'staticPressure', label: 'Pression statique au point', unit: 'kPa', precision: 1 },
      { key: 'availablePressure', label: 'Pression disponible', unit: 'kPa', precision: 1 },
      { key: 'minPressure', label: 'Pression minimale de l’appareil', unit: 'kPa', precision: 0 },
      {
        key: 'maxPressure',
        label: 'Pression maximale aux points de puisage',
        unit: 'kPa',
        precision: 0,
      },
    ],
  },
  calculate(i, ctx) {
    const density = waterDensity(ctx);
    const head = hydrostatic(density, i.heightDifference.si);
    const statics = i.upstreamPressure.si - head;
    const available = statics - i.losses.si;
    ctx.trace.step({
      id: 'T1',
      label: 'Pression hydrostatique du dénivelé',
      formula: '\\rho g \\Delta z',
      substitutions: [
        { symbol: '\\rho', value: density, unit: 'kg/m3' },
        { symbol: 'g', value: STANDARD_GRAVITY },
        { symbol: '\\Delta z', value: i.heightDifference.si, unit: 'm' },
      ],
      value: fromSI(head, 'kPa'),
      unit: 'kPa',
    });
    ctx.trace.step({
      id: 'T2',
      label: 'Pression disponible',
      formula: 'P = P_0 - \\rho g \\Delta z - \\Delta P',
      substitutions: [
        { symbol: 'P_0', value: fromSI(i.upstreamPressure.si, 'kPa'), unit: 'kPa' },
        { symbol: '\\rho g \\Delta z', value: fromSI(head, 'kPa'), unit: 'kPa' },
        { symbol: '\\Delta P', value: fromSI(i.losses.si, 'kPa'), unit: 'kPa' },
      ],
      value: fromSI(available, 'kPa'),
      unit: 'kPa',
    });
    return ok({
      hydrostatic: fromSI(head, 'kPa'),
      staticPressure: fromSI(statics, 'kPa'),
      availablePressure: fromSI(available, 'kPa'),
      minPressure: minPressureOf(ctx, i.fixture),
      maxPressure: ctx.params.scalar('plumbing.supply.max_pressure', 'kPa'),
    });
  },
  verify(_i, out) {
    return [
      minPressureCheck(out.availablePressure, out.minPressure),
      maxPressureCheck(out.staticPressure, out.maxPressure),
    ];
  },
};

// --- Réseau d'alimentation ------------------------------------------------------------------

const networkRow = z.object({
  code: z.string().min(1).max(20),
  parent: z.string().nullable(),
  length: quantity('length', { min: 0, exclusiveMin: true, max: 10_000 }),
  elevation: heightDifference,
  location: locationSchema,
  fixture: fixtureSchema.nullable(),
  count: z.number().int().min(1).max(1000).nullable(),
});
type NetworkRow = z.output<typeof networkRow>;

/** Arborescence : repères uniques, une seule origine, amont connu, aucune boucle, appareils desservis. */
function checkNetwork(rows: readonly NetworkRow[], ctx: z.RefinementCtx): void {
  const issue = (index: number, field: string, message: string) => {
    ctx.addIssue({
      code: 'custom',
      path: [index, field],
      message,
      params: { code: 'NETWORK_INVALID' },
    });
  };
  const byCode = new Map<string, NetworkRow>();
  let roots = 0;
  rows.forEach((row, index) => {
    if (byCode.has(row.code)) issue(index, 'code', `Repère « ${row.code} » en double.`);
    else byCode.set(row.code, row);
  });
  rows.forEach((row, index) => {
    if (row.parent === null) {
      roots += 1;
      if (roots > 1) issue(index, 'parent', 'Un seul tronçon d’origine (sans amont).');
    } else if (!byCode.has(row.parent)) {
      issue(index, 'parent', `Tronçon amont « ${row.parent} » inconnu.`);
    }
    if ((row.fixture === null) !== (row.count === null)) {
      issue(index, 'count', 'Précisez à la fois le type et le nombre des appareils desservis.');
    }
  });
  rows.forEach((row, index) => {
    const seen = new Set<string>();
    let current: NetworkRow | undefined = row;
    while (current) {
      if (seen.has(current.code)) {
        issue(index, 'parent', 'Boucle dans le réseau.');
        break;
      }
      seen.add(current.code);
      current = current.parent === null ? undefined : byCode.get(current.parent);
    }
  });
  if (rows.length > 0 && roots === 0) issue(0, 'parent', 'Aucun tronçon d’origine (sans amont).');
  if (!rows.some((row) => row.fixture !== null)) {
    issue(0, 'fixture', 'Aucun appareil desservi par le réseau.');
  }
}

const networkInput = z.object({
  network: z.array(networkRow).min(1).max(1000).superRefine(checkNetwork),
  material: supplyMaterialSchema,
  upstreamPressure: pressure,
  temperature: waterTemperature,
});
const networkOutput = z.object({
  fixtureCount: z.number().int().positive(),
  baseFlow: nonNegative,
  probableFlow: nonNegative,
  totalLength: nonNegative,
  minPressure: z.number(),
  requiredPressure: nonNegative,
  maxVelocity: nonNegative,
  velocityLimit: z.number().positive(),
  maxStaticPressure: z.number(),
  maxPressure: nonNegative,
  pipes: breakdownSchema,
});

interface Segment {
  readonly row: NetworkRow;
  readonly size: PipeSize;
  readonly loss: Loss;
  /** Pression disponible au point aval (Pa). */
  readonly pressure: number;
}

export const plumbingSupplyNetwork: EngineDefinition<
  z.output<typeof networkInput>,
  z.output<typeof networkOutput>
> = {
  id: 'plumbing.supply-network',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Réseau d’alimentation',
  inputSchema: networkInput,
  outputSchema: networkOutput,
  parameters: [
    ...CATALOG_PARAMETERS,
    ...BASE_FLOW_PARAMETERS,
    ...VELOCITY_PARAMETERS,
    ...FRICTION_PARAMETERS,
    ...WATER_PARAMETERS,
    ...SINGULAR_PARAMETERS,
    ...PRESSURE_PARAMETERS,
  ],
  formulas: [DEMAND_FORMULA, LOSS_FORMULA],
  hypotheses: [
    PLUMBING_HYPOTHESIS,
    SIMULTANEITY_HYPOTHESIS,
    {
      code: 'PLUMBING.SINGULAR_RATIO',
      text: 'Pertes de charge singulières de chaque tronçon : part forfaitaire de ses pertes linéaires (référentiel d’usages).',
    },
    {
      code: 'PLUMBING.TRUNK_DIAMETER',
      text: 'Un tronçon n’est jamais plus petit que l’alimentation minimale des appareils qu’il dessert.',
    },
  ],
  presentation: {
    description:
      'Réseau arborescent d’eau froide ou chaude : débits probables, diamètres, vitesses, pertes de charge et pression disponible à chaque point de puisage.',
    inputs: [
      {
        key: 'network',
        label: 'Tronçons du réseau',
        kind: 'dataset',
        datasetKind: 'PLUMBING_NETWORK',
        help: 'Révision courante du jeu de données choisi ; le calcul garde la trace de la révision lue.',
      },
      SUPPLY_MATERIAL_INPUT,
      UPSTREAM_PRESSURE_INPUT,
      TEMPERATURE_INPUT,
    ],
    outputs: [
      { key: 'fixtureCount', label: 'Nombre d’appareils desservis', unit: '1', precision: 0 },
      { key: 'baseFlow', label: 'Débit de base à l’origine', unit: 'L/s', precision: 3 },
      { key: 'probableFlow', label: 'Débit probable à l’origine', unit: 'L/s', precision: 3 },
      { key: 'totalLength', label: 'Longueur totale des tubes', unit: 'm', precision: 2 },
      {
        key: 'minPressure',
        label: 'Pression disponible au point le plus défavorisé',
        unit: 'kPa',
        precision: 1,
      },
      { key: 'requiredPressure', label: 'Pression requise en ce point', unit: 'kPa', precision: 0 },
      { key: 'maxVelocity', label: 'Vitesse maximale dans le réseau', unit: 'm/s', precision: 2 },
      { key: 'velocityLimit', label: 'Vitesse admise sur ce tronçon', unit: 'm/s', precision: 2 },
      { key: 'maxStaticPressure', label: 'Pression statique maximale', unit: 'kPa', precision: 1 },
      { key: 'maxPressure', label: 'Pression maximale admise', unit: 'kPa', precision: 0 },
      {
        key: 'pipes',
        label: 'Linéaire de tubes',
        unit: 'm',
        precision: 2,
        family: 'PIPES',
        breakdown: true,
      },
    ],
  },
  calculate(i, ctx) {
    const water = waterOf(ctx, i.temperature.si);
    const roughness = roughnessOf(ctx, i.material);
    const ratio = ctx.params.scalar('plumbing.supply.singular_loss_ratio', '1');
    const rows = i.network;
    const children = new Map<string, NetworkRow[]>();
    for (const row of rows) {
      if (row.parent !== null) children.set(row.parent, [...(children.get(row.parent) ?? []), row]);
    }
    // Appareils en aval de chaque tronçon (le tronçon compris).
    const downstream = new Map<string, Map<Fixture, number>>();
    const countsBelow = (row: NetworkRow): Map<Fixture, number> => {
      const known = downstream.get(row.code);
      if (known) return known;
      const counts = new Map<Fixture, number>();
      if (row.fixture !== null && row.count !== null) counts.set(row.fixture, row.count);
      for (const child of children.get(row.code) ?? []) {
        for (const [fixture, count] of countsBelow(child)) {
          counts.set(fixture, (counts.get(fixture) ?? 0) + count);
        }
      }
      downstream.set(row.code, counts);
      return counts;
    };
    const root = required(
      rows.find((row) => row.parent === null),
      'Tronçon d’origine',
    );
    const order: NetworkRow[] = [];
    const queue = [root];
    for (let row = queue.shift(); row; row = queue.shift()) {
      order.push(row);
      queue.push(...(children.get(row.code) ?? []));
    }

    const segments = new Map<string, Segment>();
    let step = 0;
    for (const row of order) {
      const counts = countsBelow(row);
      const demand = demandOf(ctx, counts);
      const limit = maxVelocityOf(ctx, row.location);
      const minimum = Math.max(
        requiredDiameter(demand.probable, limit),
        fixtureMinDiameter(ctx, 'plumbing.supply.min_inner_diameter', counts.keys()),
      );
      const size = smallestSize(ctx, i.material, minimum);
      if (!size) return noSize(` au tronçon ${row.code}`);
      if (demand.fixtures === 0) {
        ctx.warn.warn(
          'PLUMBING.DEAD_END',
          `Le tronçon ${row.code} ne dessert aucun appareil : plus petit tube retenu, sans débit.`,
        );
      }
      const computed = computeLoss({
        flow: demand.probable,
        inner: size.inner,
        length: row.length.si,
        roughness,
        water,
        singular: { kind: 'RATIO', ratio },
      });
      if (!computed.ok) return err(nonConvergence(computed.error));
      const loss = computed.value;
      warnTransition(ctx, loss.reynolds, ` sur le tronçon ${row.code}`);
      const parent = row.parent === null ? undefined : segments.get(row.parent);
      const upstream = parent?.pressure ?? i.upstreamPressure.si;
      const rise = row.elevation.si - (parent?.row.elevation.si ?? 0);
      const pressureHere = upstream - loss.total - hydrostatic(water.density, rise);
      segments.set(row.code, { row, size, loss, pressure: pressureHere });
      step += 1;
      ctx.trace.step({
        id: `T${String(step)}`,
        label: `Tronçon ${row.code} : ${MATERIAL_LABELS[i.material]} ${sizeLabel(i.material, size.size)}`,
        formula:
          'Q_p = y \\, Q_b ; \\; D_{int} \\geq \\max\\left(\\sqrt{\\frac{4 Q_p}{\\pi v_{max}}}, D_{app}\\right) ; \\; P_{aval} = P_{amont} - \\Delta P - \\rho g \\Delta z',
        substitutions: [
          { symbol: 'x', value: demand.fixtures },
          { symbol: 'Q_b', value: fromSI(demand.base, 'L/s'), unit: 'L/s' },
          { symbol: 'y', value: demand.simultaneity },
          { symbol: 'Q_p', value: fromSI(demand.probable, 'L/s'), unit: 'L/s' },
          { symbol: 'D_{int}', value: fromSI(size.inner, 'mm'), unit: 'mm' },
          { symbol: 'v', value: loss.velocity, unit: 'm/s' },
          { symbol: '\\lambda', value: loss.lambda },
          { symbol: 'L', value: row.length.si, unit: 'm' },
          { symbol: '\\Delta P', value: fromSI(loss.total, 'kPa'), unit: 'kPa' },
          { symbol: '\\Delta z', value: rise, unit: 'm' },
          { symbol: 'P_{amont}', value: fromSI(upstream, 'kPa'), unit: 'kPa' },
        ],
        value: fromSI(pressureHere, 'kPa'),
        unit: 'kPa',
        source: 'NF DTU 60.11 ; Darcy-Weisbach et Colebrook-White',
      });
    }

    // Point le plus défavorisé : plus faible marge entre pression disponible et requise.
    let worst: { pressure: number; required: number } | null = null;
    let fastest: { velocity: number; limit: number } | null = null;
    let maxStatic = Number.NEGATIVE_INFINITY;
    const lengths = new Map<number, number>();
    for (const segment of segments.values()) {
      const { row, size, loss } = segment;
      lengths.set(size.size, (lengths.get(size.size) ?? 0) + row.length.si);
      const limit = maxVelocityOf(ctx, row.location);
      if (!fastest || loss.velocity / limit > fastest.velocity / fastest.limit) {
        fastest = { velocity: loss.velocity, limit };
      }
      maxStatic = Math.max(
        maxStatic,
        i.upstreamPressure.si - hydrostatic(water.density, row.elevation.si),
      );
      if (row.fixture !== null) {
        const required = minPressureOf(ctx, row.fixture) * 1e3;
        if (!worst || segment.pressure - required < worst.pressure - worst.required) {
          worst = { pressure: segment.pressure, required };
        }
      }
    }
    const point = required(worst, 'Point de puisage');
    const fastestSegment = required(fastest, 'Tronçon');
    const origin = demandOf(ctx, countsBelow(root));
    const pipes: BreakdownEntry[] = [...lengths]
      .sort(([a], [b]) => a - b)
      .map(([size, length]) => ({
        key: `${i.material}-${String(size)}`,
        label: `${MATERIAL_LABELS[i.material]} ${sizeLabel(i.material, size)}`,
        group: i.material,
        groupLabel: MATERIAL_LABELS[i.material],
        value: length,
      }));
    return ok({
      fixtureCount: origin.fixtures,
      baseFlow: fromSI(origin.base, 'L/s'),
      probableFlow: fromSI(origin.probable, 'L/s'),
      totalLength: rows.reduce((sum, row) => sum + row.length.si, 0),
      minPressure: fromSI(point.pressure, 'kPa'),
      requiredPressure: fromSI(point.required, 'kPa'),
      maxVelocity: fastestSegment.velocity,
      velocityLimit: fastestSegment.limit,
      maxStaticPressure: fromSI(maxStatic, 'kPa'),
      maxPressure: ctx.params.scalar('plumbing.supply.max_pressure', 'kPa'),
      pipes,
    });
  },
  verify(_i, out) {
    return [
      minPressureCheck(out.minPressure, out.requiredPressure, ' au point le plus défavorisé'),
      maxPressureCheck(out.maxStaticPressure, out.maxPressure),
      velocityCheck(out.maxVelocity, out.velocityLimit),
    ];
  },
};
