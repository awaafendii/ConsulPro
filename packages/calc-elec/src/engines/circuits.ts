import {
  checkLimit,
  err,
  fromSI,
  ok,
  quantity,
  type CalcContext,
  type Check,
  type EngineDefinition,
} from '@consulpro/calc-core';
import { z } from 'zod';

import {
  computeDrop,
  correctionFactors,
  designCurrent,
  DROP_PARAMETERS,
  dropLimit,
  inUnit,
  lineConstants,
  phaseVoltage,
  PROTECTION_PARAMETERS,
  protectionRating,
  SIZING_PARAMETERS,
  smallestSection,
  voltageDrop,
} from '../common/formulas';
import {
  ambient,
  arrangementRequired,
  arrangementSchema,
  circuits,
  COS_PHI_INPUT,
  cosPhi,
  current,
  CURRENT_INPUT,
  DEVICE_INPUT,
  deviceSchema,
  DROP_INPUTS,
  ELEC_HYPOTHESIS,
  insulationSchema,
  length,
  materialSchema,
  methodSchema,
  power,
  POWER_INPUT,
  RATING_INPUT,
  section,
  shortCircuitCurrent,
  SIZING_INPUTS,
  supplySchema,
  SYSTEM_INPUT,
  systemSchema,
  upstreamDrop,
  usageSchema,
  voltage,
  VOLTAGE_INPUT,
  type System,
} from '../common/inputs';

/*
 * Circuits : choix de la section (I_z corrigé), chute de tension, protection (I_B ≤ I_n,
 * I2 ≤ 1,45 I_z, pouvoir de coupure, différentiel des prises), et chaîne complète d'un circuit.
 */

const nonNegative = z.number().nonnegative();

const COPPER_HYPOTHESIS = {
  code: 'ELEC.COPPER',
  text: 'Conducteurs en cuivre : le référentiel ne fournit les courants admissibles que pour le cuivre.',
} as const;
const LOADED_HYPOTHESIS = {
  code: 'ELEC.LOADED_CONDUCTORS',
  text: 'Conducteurs chargés : 2 en monophasé, 3 en triphasé (neutre non chargé).',
} as const;

const loadedOf = (system: System) => (system === 'MONO' ? '2' : '3');

/** Nombre de circuits jointifs : 1 si non renseigné (hypothèse tracée). */
function circuitsOf(ctx: CalcContext, value: number | undefined): number {
  if (value === undefined) {
    ctx.assume.defaulted('circuits', 1, 'Circuit seul (aucun circuit jointif).');
    return 1;
  }
  return value;
}

/** Contrôles de protection communs : I_B ≤ I_n et I2 ≤ 1,45 I_z. */
function protectionChecks(
  ctx: Pick<CalcContext, 'params'>,
  input: { current: number; rating: number; conventional: number; iz: number },
): Check[] {
  const limit = ctx.params.scalar('elec.overload.i2_limit', '1');
  return [
    checkLimit({
      rule: 'elec.protection.ib-le-in',
      label: 'Courant d’emploi au plus égal au calibre (I_B ≤ I_n)',
      measured: input.current,
      limit: input.rating,
      comparison: '<=',
      severity: 'BLOCKING',
      unit: 'A',
      clause: '433.1',
    }),
    checkLimit({
      rule: 'elec.protection.overload',
      label: 'Protection contre les surcharges (I2 ≤ 1,45 I_z)',
      measured: input.conventional,
      limit: limit * input.iz,
      comparison: '<=',
      severity: 'BLOCKING',
      unit: 'A',
      clause: '433.1',
    }),
  ];
}

const noRating = () =>
  err({
    code: 'NO_RATING',
    message:
      'Aucun calibre normalisé du référentiel ne couvre ce courant : prévoyez une autre protection ou plusieurs circuits.',
  });
const noSection = () =>
  err({
    code: 'NO_SECTION',
    message:
      'Aucune section du référentiel n’admet ce courant dans ces conditions : prévoyez des câbles en parallèle, un autre mode de pose ou plusieurs circuits.',
  });

const SIZING_FORMULA = {
  id: 'sizing',
  label: 'Section minimale',
  latex:
    'I_2 = k_2 \\, I_n \\leq 1{,}45 \\, I_z ; \\; I_z = f_T \\, f_G \\, I_{z,tab}(S) ; \\; S = \\min \\{ S : I_{z,tab}(S) \\geq \\frac{k_2 I_n}{1{,}45 \\, f_T f_G} \\}',
  symbols: [
    { symbol: 'k_2', meaning: 'courant conventionnel de fonctionnement / I_n' },
    { symbol: 'f_T', meaning: 'facteur de température ambiante' },
    { symbol: 'f_G', meaning: 'facteur de groupement' },
  ],
  source: 'NF C 15-100 §433 et §523 ; UTE C 15-105',
};

/** Section minimale (thermique) pour un calibre donné. */
function thermalSection(
  ctx: CalcContext,
  input: {
    rating: number;
    k2: number;
    system: System;
    method: string;
    insulation: string;
    ambient: number;
    circuits: number | undefined;
    arrangement: string | undefined;
  },
) {
  const factors = correctionFactors(ctx, 'T2', {
    insulation: input.insulation,
    ambient: input.ambient,
    circuits: circuitsOf(ctx, input.circuits),
    arrangement: input.arrangement,
  });
  const limit = ctx.params.scalar('elec.overload.i2_limit', '1');
  const required = (input.k2 * input.rating) / (limit * factors.total);
  const chosen = smallestSection(ctx, {
    method: input.method,
    insulation: input.insulation,
    loaded: loadedOf(input.system),
    required,
  });
  if (!chosen) return null;
  ctx.trace.step({
    id: 'T3',
    label: 'Section retenue (échauffement)',
    formula: 'I_{z,tab}(S) \\geq \\frac{k_2 \\, I_n}{1{,}45 \\, f}',
    substitutions: [
      { symbol: 'k_2', value: input.k2 },
      { symbol: 'I_n', value: input.rating, unit: 'A' },
      { symbol: 'f', value: factors.total },
      { symbol: 'I_{z,tab}', value: chosen.iz, unit: 'A' },
    ],
    value: chosen.section,
    unit: 'mm2',
    source: 'Référentiel NF C 15-100 (tableau 52H)',
  });
  return { ...chosen, factors };
}

// --- Choix de la section ------------------------------------------------------------------

const sizingInput = z
  .object({
    current,
    device: deviceSchema,
    rating: current.optional(),
    system: systemSchema,
    method: methodSchema,
    insulation: insulationSchema,
    ambient,
    circuits: circuits.optional(),
    arrangement: arrangementSchema.optional(),
  })
  .superRefine(arrangementRequired);
const sizingOutput = z.object({
  rating: nonNegative,
  conventionalCurrent: nonNegative,
  section: nonNegative,
  izTable: nonNegative,
  izCorrected: nonNegative,
  temperatureFactor: nonNegative,
  groupingFactor: nonNegative,
});

export const elecCableSizing: EngineDefinition<
  z.output<typeof sizingInput>,
  z.output<typeof sizingOutput>
> = {
  id: 'elec.cable-sizing',
  version: '1.0.0',
  discipline: 'ELEC',
  title: 'Section des câbles',
  inputSchema: sizingInput,
  outputSchema: sizingOutput,
  parameters: [...PROTECTION_PARAMETERS, ...SIZING_PARAMETERS],
  formulas: [SIZING_FORMULA],
  hypotheses: [ELEC_HYPOTHESIS, COPPER_HYPOTHESIS, LOADED_HYPOTHESIS],
  presentation: {
    description:
      'Section minimale en cuivre d’après le calibre de la protection, le mode de pose, la température ambiante et le groupement.',
    inputs: [CURRENT_INPUT, DEVICE_INPUT, RATING_INPUT, SYSTEM_INPUT, ...SIZING_INPUTS],
    outputs: [
      { key: 'rating', label: 'Calibre de la protection I_n', unit: 'A', precision: 0 },
      { key: 'conventionalCurrent', label: 'Courant conventionnel I2', unit: 'A', precision: 1 },
      { key: 'section', label: 'Section minimale (cuivre)', unit: 'mm2', precision: 1 },
      { key: 'izTable', label: 'Courant admissible du tableau', unit: 'A', precision: 1 },
      { key: 'izCorrected', label: 'Courant admissible corrigé I_z', unit: 'A', precision: 1 },
      { key: 'temperatureFactor', label: 'Facteur de température f_T', unit: '1', precision: 2 },
      { key: 'groupingFactor', label: 'Facteur de groupement f_G', unit: '1', precision: 2 },
    ],
  },
  calculate(i, ctx) {
    const rated = protectionRating(ctx, 'T1', {
      device: i.device,
      current: i.current.si,
      rating: i.rating?.si,
    });
    if (!rated) return noRating();
    const chosen = thermalSection(ctx, {
      ...rated,
      system: i.system,
      method: i.method,
      insulation: i.insulation,
      ambient: i.ambient.si,
      circuits: i.circuits,
      arrangement: i.arrangement,
    });
    if (!chosen) return noSection();
    return ok({
      rating: rated.rating,
      conventionalCurrent: rated.k2 * rated.rating,
      section: chosen.section,
      izTable: chosen.iz,
      izCorrected: chosen.iz * chosen.factors.total,
      temperatureFactor: chosen.factors.temperature,
      groupingFactor: chosen.factors.grouping,
    });
  },
  verify(i, out, ctx) {
    return protectionChecks(ctx, {
      current: i.current.si,
      rating: out.rating,
      conventional: out.conventionalCurrent,
      iz: out.izCorrected,
    });
  },
};

// --- Chute de tension ---------------------------------------------------------------------

const dropInput = z.object({
  current,
  length,
  section,
  material: materialSchema,
  system: systemSchema,
  voltage,
  cosPhi,
  usage: usageSchema,
  supply: supplySchema,
  upstream: upstreamDrop.optional(),
});
const dropOutput = z.object({
  voltageDrop: nonNegative,
  voltageDropPercent: nonNegative,
  cumulativePercent: nonNegative,
  limitPercent: nonNegative,
});

/** Chute de tension en amont (%), 0 si non renseignée (hypothèse tracée). */
function upstreamPercent(
  ctx: CalcContext,
  value: { value: number; unit: string; si: number } | undefined,
): number {
  if (value === undefined) {
    ctx.assume.defaulted('upstream', 0, 'Aucune chute de tension en amont du circuit.');
    return 0;
  }
  return inUnit(value, '%');
}

function dropCheck(cumulative: number, limit: number): Check {
  return checkLimit({
    rule: 'elec.voltage-drop.limit',
    label: 'Chute de tension cumulée au plus égale à la limite',
    measured: cumulative,
    limit,
    comparison: '<=',
    severity: 'BLOCKING',
    unit: '%',
    clause: '525',
  });
}

const DROP_FORMULA = {
  id: 'drop',
  label: 'Chute de tension',
  latex:
    '\\Delta U = b \\left( \\rho_1 \\frac{L}{S} \\cos\\varphi + \\lambda L \\sin\\varphi \\right) I_B ; \\; \\Delta U\\% = 100 \\frac{\\Delta U}{U_0}',
  symbols: [
    { symbol: 'b', meaning: '2 en monophasé, 1 en triphasé' },
    { symbol: '\\rho_1', meaning: 'résistivité en service', unit: 'ohm.mm2/m' },
    { symbol: '\\lambda', meaning: 'réactance linéique', unit: 'mohm/m' },
    { symbol: 'U_0', meaning: 'tension entre phase et neutre', unit: 'V' },
  ],
  source: 'UTE C 15-105 ; limites NF C 15-100 §525',
} as const;

const LENGTH_INPUT = {
  key: 'length',
  label: 'Longueur du circuit',
  kind: 'quantity',
  unitKind: 'length',
  units: ['m', 'km'],
} as const;

export const elecVoltageDrop: EngineDefinition<
  z.output<typeof dropInput>,
  z.output<typeof dropOutput>
> = {
  id: 'elec.voltage-drop',
  version: '1.0.0',
  discipline: 'ELEC',
  title: 'Chute de tension',
  inputSchema: dropInput,
  outputSchema: dropOutput,
  parameters: DROP_PARAMETERS,
  formulas: [DROP_FORMULA],
  hypotheses: [ELEC_HYPOTHESIS],
  presentation: {
    description:
      'Chute de tension d’un circuit, cumulée avec l’amont et comparée à la limite selon l’usage et l’alimentation.',
    inputs: [
      CURRENT_INPUT,
      LENGTH_INPUT,
      {
        key: 'section',
        label: 'Section des conducteurs',
        kind: 'quantity',
        unitKind: 'area',
        units: ['mm2'],
      },
      {
        key: 'material',
        label: 'Nature de l’âme',
        kind: 'enum',
        options: [
          { value: 'CU', label: 'Cuivre' },
          { value: 'AL', label: 'Aluminium' },
        ],
      },
      SYSTEM_INPUT,
      VOLTAGE_INPUT,
      COS_PHI_INPUT,
      ...DROP_INPUTS,
    ],
    outputs: [
      { key: 'voltageDrop', label: 'Chute de tension ΔU', unit: 'V', precision: 2 },
      { key: 'voltageDropPercent', label: 'Chute de tension du circuit', unit: '%', precision: 2 },
      { key: 'cumulativePercent', label: 'Chute de tension cumulée', unit: '%', precision: 2 },
      { key: 'limitPercent', label: 'Limite applicable', unit: '%', precision: 1 },
    ],
  },
  calculate(i, ctx) {
    const { drop, percent } = voltageDrop(ctx, 'T1', {
      system: i.system,
      ...lineConstants(ctx, i.material),
      length: i.length.si,
      section: i.section.si,
      current: i.current.si,
      cosPhi: i.cosPhi.si,
      phaseVoltage: phaseVoltage(i.system, i.voltage.si),
    });
    return ok({
      voltageDrop: drop,
      voltageDropPercent: percent,
      cumulativePercent: upstreamPercent(ctx, i.upstream) + percent,
      limitPercent: dropLimit(ctx, i.supply, i.usage),
    });
  },
  verify(_i, out) {
    return [dropCheck(out.cumulativePercent, out.limitPercent)];
  },
};

// --- Protection ---------------------------------------------------------------------------

const protectionInput = z
  .object({
    current,
    iz: current,
    device: deviceSchema,
    rating: current.optional(),
    circuitType: z.enum(['SOCKETS', 'LIGHTING', 'OTHER']),
    rcdSensitivity: quantity('current', { min: 0, exclusiveMin: true, max: 1 }).optional(),
    shortCircuit: shortCircuitCurrent.optional(),
    breakingCapacity: shortCircuitCurrent.optional(),
  })
  .superRefine((input, ctx) => {
    if ((input.shortCircuit === undefined) !== (input.breakingCapacity === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: [input.shortCircuit === undefined ? 'shortCircuit' : 'breakingCapacity'],
        message: 'Courant de court-circuit et pouvoir de coupure se renseignent ensemble.',
        params: { code: 'SHORT_CIRCUIT_PAIR' },
      });
    }
  });
const protectionOutput = z.object({
  rating: nonNegative,
  conventionalCurrent: nonNegative,
  overloadLimit: nonNegative,
});

export const elecProtection: EngineDefinition<
  z.output<typeof protectionInput>,
  z.output<typeof protectionOutput>
> = {
  id: 'elec.protection',
  version: '1.0.0',
  discipline: 'ELEC',
  title: 'Protection d’un circuit',
  inputSchema: protectionInput,
  outputSchema: protectionOutput,
  parameters: [
    ...PROTECTION_PARAMETERS,
    {
      key: 'elec.rcd.sockets_max',
      kind: 'SCALAR',
      unitKind: 'current',
      description: 'Sensibilité maximale du différentiel des circuits de prises',
    },
  ],
  formulas: [
    {
      id: 'protection',
      label: 'Conditions de protection',
      latex:
        'I_B \\leq I_n ; \\; I_2 = k_2 \\, I_n \\leq 1{,}45 \\, I_z ; \\; P_{dc} \\geq I_{cc} ; \\; I_{\\Delta n} \\leq 30\\,\\mathrm{mA} \\text{ (prises)}',
      symbols: [
        { symbol: 'I_z', meaning: 'courant admissible corrigé de la canalisation', unit: 'A' },
        { symbol: 'P_{dc}', meaning: 'pouvoir de coupure', unit: 'kA' },
        { symbol: 'I_{cc}', meaning: 'courant de court-circuit présumé', unit: 'kA' },
      ],
      source: 'NF C 15-100 §433.1, §434.5, §411.3.3',
    },
  ],
  hypotheses: [ELEC_HYPOTHESIS],
  presentation: {
    description:
      'Contrôle d’une protection : calibre, surcharges, pouvoir de coupure (si I_cc est fourni) et différentiel des prises.',
    inputs: [
      CURRENT_INPUT,
      {
        key: 'iz',
        label: 'Courant admissible corrigé de la canalisation I_z',
        kind: 'quantity',
        unitKind: 'current',
        units: ['A'],
        help: 'Reprenez la sortie « I_z corrigé » d’un calcul de section.',
      },
      DEVICE_INPUT,
      RATING_INPUT,
      {
        key: 'circuitType',
        label: 'Nature du circuit',
        kind: 'enum',
        options: [
          { value: 'SOCKETS', label: 'Prises de courant' },
          { value: 'LIGHTING', label: 'Éclairage' },
          { value: 'OTHER', label: 'Autres usages' },
        ],
      },
      {
        key: 'rcdSensitivity',
        label: 'Sensibilité du dispositif différentiel I_Δn',
        kind: 'quantity',
        unitKind: 'current',
        units: ['mA', 'A'],
        optional: true,
      },
      {
        key: 'shortCircuit',
        label: 'Courant de court-circuit présumé I_cc',
        kind: 'quantity',
        unitKind: 'current',
        units: ['kA', 'A'],
        optional: true,
        help: 'Valeur fournie par le distributeur ou une étude ; non calculée par ConsulPro.',
      },
      {
        key: 'breakingCapacity',
        label: 'Pouvoir de coupure du dispositif',
        kind: 'quantity',
        unitKind: 'current',
        units: ['kA', 'A'],
        optional: true,
      },
    ],
    outputs: [
      { key: 'rating', label: 'Calibre I_n', unit: 'A', precision: 0 },
      { key: 'conventionalCurrent', label: 'Courant conventionnel I2', unit: 'A', precision: 1 },
      { key: 'overloadLimit', label: '1,45 × I_z', unit: 'A', precision: 1 },
    ],
  },
  calculate(i, ctx) {
    const rated = protectionRating(ctx, 'T1', {
      device: i.device,
      current: i.current.si,
      rating: i.rating?.si,
    });
    if (!rated) return noRating();
    if (i.shortCircuit === undefined) {
      ctx.assume.defaulted(
        'shortCircuit',
        null,
        'Pouvoir de coupure non contrôlé : courant de court-circuit présumé non fourni.',
      );
    }
    return ok({
      rating: rated.rating,
      conventionalCurrent: rated.k2 * rated.rating,
      overloadLimit: ctx.params.scalar('elec.overload.i2_limit', '1') * i.iz.si,
    });
  },
  verify(i, out, ctx) {
    const checks = protectionChecks(ctx, {
      current: i.current.si,
      rating: out.rating,
      conventional: out.conventionalCurrent,
      iz: i.iz.si,
    });
    // Stryker disable next-line LogicalOperator: équivalent, le schéma impose de fournir les deux.
    if (i.shortCircuit && i.breakingCapacity) {
      checks.push(
        checkLimit({
          rule: 'elec.protection.breaking-capacity',
          label: 'Pouvoir de coupure au moins égal au courant de court-circuit présumé',
          measured: fromSI(i.breakingCapacity.si, 'kA'),
          limit: fromSI(i.shortCircuit.si, 'kA'),
          comparison: '>=',
          severity: 'BLOCKING',
          unit: 'kA',
          clause: '434.5',
        }),
      );
    }
    if (i.circuitType === 'SOCKETS') {
      const max = ctx.params.scalar('elec.rcd.sockets_max', 'mA');
      checks.push(
        i.rcdSensitivity
          ? checkLimit({
              rule: 'elec.protection.rcd-sockets',
              label: 'Prises de courant protégées par un différentiel à haute sensibilité',
              measured: inUnit(i.rcdSensitivity, 'mA'),
              limit: max,
              comparison: '<=',
              severity: 'BLOCKING',
              unit: 'mA',
              clause: '411.3.3',
            })
          : {
              rule: 'elec.protection.rcd-sockets',
              label: 'Prises de courant protégées par un différentiel à haute sensibilité',
              status: 'FAIL',
              severity: 'BLOCKING',
              limit: max,
              unit: 'mA',
              clause: '411.3.3',
              note: 'Aucun dispositif différentiel indiqué pour ce circuit de prises.',
            },
      );
    }
    return checks;
  },
};

// --- Circuit complet ----------------------------------------------------------------------

const circuitInput = z
  .object({
    power,
    system: systemSchema,
    voltage,
    cosPhi,
    length,
    device: deviceSchema,
    rating: current.optional(),
    method: methodSchema,
    insulation: insulationSchema,
    ambient,
    circuits: circuits.optional(),
    arrangement: arrangementSchema.optional(),
    usage: usageSchema,
    supply: supplySchema,
    upstream: upstreamDrop.optional(),
  })
  .superRefine(arrangementRequired);
const circuitOutput = z.object({
  current: nonNegative,
  rating: nonNegative,
  conventionalCurrent: nonNegative,
  thermalSection: nonNegative,
  section: nonNegative,
  izCorrected: nonNegative,
  voltageDropPercent: nonNegative,
  cumulativePercent: nonNegative,
  limitPercent: nonNegative,
});

export const elecCircuit: EngineDefinition<
  z.output<typeof circuitInput>,
  z.output<typeof circuitOutput>
> = {
  id: 'elec.circuit',
  version: '1.0.0',
  discipline: 'ELEC',
  title: 'Circuit monophasé ou triphasé',
  inputSchema: circuitInput,
  outputSchema: circuitOutput,
  parameters: [...PROTECTION_PARAMETERS, ...SIZING_PARAMETERS, ...DROP_PARAMETERS],
  formulas: [
    {
      id: 'circuit',
      label: 'Chaîne d’un circuit',
      latex:
        'I_B \\rightarrow I_n \\geq I_B \\rightarrow S_{th} \\; (I_2 \\leq 1{,}45 I_z) \\rightarrow S = \\min \\{ S \\geq S_{th} : \\Delta U_{cum} \\leq \\Delta U_{max} \\}',
      symbols: [
        { symbol: 'S_{th}', meaning: 'section minimale à l’échauffement', unit: 'mm2' },
        { symbol: '\\Delta U_{max}', meaning: 'limite de chute de tension', unit: '%' },
      ],
      source: 'NF C 15-100 ; UTE C 15-105',
    },
    SIZING_FORMULA,
    DROP_FORMULA,
  ],
  hypotheses: [ELEC_HYPOTHESIS, COPPER_HYPOTHESIS, LOADED_HYPOTHESIS],
  presentation: {
    description:
      'Courant d’emploi, calibre, section à l’échauffement puis augmentée si la chute de tension l’exige, et contrôles de la NF C 15-100.',
    inputs: [
      POWER_INPUT,
      SYSTEM_INPUT,
      VOLTAGE_INPUT,
      COS_PHI_INPUT,
      LENGTH_INPUT,
      DEVICE_INPUT,
      RATING_INPUT,
      ...SIZING_INPUTS,
      ...DROP_INPUTS,
    ],
    outputs: [
      { key: 'current', label: 'Courant d’emploi I_B', unit: 'A', precision: 2 },
      { key: 'rating', label: 'Calibre de la protection I_n', unit: 'A', precision: 0 },
      { key: 'conventionalCurrent', label: 'Courant conventionnel I2', unit: 'A', precision: 1 },
      { key: 'thermalSection', label: 'Section à l’échauffement', unit: 'mm2', precision: 1 },
      { key: 'section', label: 'Section retenue (cuivre)', unit: 'mm2', precision: 1 },
      { key: 'izCorrected', label: 'Courant admissible corrigé I_z', unit: 'A', precision: 1 },
      { key: 'voltageDropPercent', label: 'Chute de tension du circuit', unit: '%', precision: 2 },
      { key: 'cumulativePercent', label: 'Chute de tension cumulée', unit: '%', precision: 2 },
      { key: 'limitPercent', label: 'Limite applicable', unit: '%', precision: 1 },
    ],
  },
  calculate(i, ctx) {
    const { current: ib } = designCurrent(ctx, 'T0', {
      power: i.power.si,
      system: i.system,
      voltage: i.voltage.si,
      cosPhi: i.cosPhi.si,
    });
    const rated = protectionRating(ctx, 'T1', {
      device: i.device,
      current: ib,
      rating: i.rating?.si,
    });
    if (!rated) return noRating();
    const thermal = thermalSection(ctx, {
      ...rated,
      system: i.system,
      method: i.method,
      insulation: i.insulation,
      ambient: i.ambient.si,
      circuits: i.circuits,
      arrangement: i.arrangement,
    });
    if (!thermal) return noSection();

    // Section augmentée, de proche en proche, tant que la chute de tension cumulée dépasse la limite.
    const line = lineConstants(ctx, 'CU');
    const upstream = upstreamPercent(ctx, i.upstream);
    const limit = dropLimit(ctx, i.supply, i.usage);
    const u0 = phaseVoltage(i.system, i.voltage.si);
    const loaded = loadedOf(i.system);
    const drop = (section: number) => ({
      system: i.system,
      ...line,
      length: i.length.si,
      section: section * 1e-6,
      current: ib,
      cosPhi: i.cosPhi.si,
      phaseVoltage: u0,
    });
    let chosen: { section: number; iz: number } = thermal;
    for (;;) {
      // Stryker disable next-line EqualityOperator: égalité exacte de deux réels non atteignable par les tests.
      if (upstream + computeDrop(drop(chosen.section)).percent <= limit) break;
      const next = smallestSection(
        ctx,
        { method: i.method, insulation: i.insulation, loaded, required: chosen.iz },
        chosen.section,
      );
      if (!next) break;
      chosen = next;
    }
    const { percent } = voltageDrop(ctx, 'T4', drop(chosen.section));
    if (chosen.section !== thermal.section) {
      ctx.trace.step({
        id: 'T5',
        label: 'Section augmentée pour la chute de tension',
        formula: 'S = \\min \\{ S \\geq S_{th} : \\Delta U_{cum} \\leq \\Delta U_{max} \\}',
        substitutions: [
          { symbol: 'S_{th}', value: thermal.section, unit: 'mm2' },
          { symbol: '\\Delta U_{max}', value: limit, unit: '%' },
        ],
        value: chosen.section,
        unit: 'mm2',
      });
    }
    return ok({
      current: ib,
      rating: rated.rating,
      conventionalCurrent: rated.k2 * rated.rating,
      thermalSection: thermal.section,
      section: chosen.section,
      izCorrected: chosen.iz * thermal.factors.total,
      voltageDropPercent: percent,
      cumulativePercent: upstream + percent,
      limitPercent: limit,
    });
  },
  verify(_i, out, ctx) {
    return [
      ...protectionChecks(ctx, {
        current: out.current,
        rating: out.rating,
        conventional: out.conventionalCurrent,
        iz: out.izCorrected,
      }),
      dropCheck(out.cumulativePercent, out.limitPercent),
    ];
  },
};
