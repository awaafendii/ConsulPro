import {
  breakdownSchema,
  err,
  fromSI,
  ok,
  quantity,
  type EngineDefinition,
} from '@consulpro/calc-core';
import { z } from 'zod';

import { STANDARD_GRAVITY, tableValue, waterDensity } from '../common/hydraulics';
import { flow, FLOW_INPUT, persons, pressure, required } from '../common/inputs';

/* Équipements : réservoir de stockage, pompe ou surpresseur, chauffe-eau à accumulation. */

const nonNegative = z.number().nonnegative();
const positive = z.number().positive();

const usageSchema = z.enum(['DWELLING', 'OFFICE', 'SCHOOL', 'HEALTH', 'HOTEL']);
const USAGE_INPUT = {
  key: 'usage',
  label: 'Usage du bâtiment',
  kind: 'enum',
  options: [
    { value: 'DWELLING', label: 'Logement (par habitant)' },
    { value: 'OFFICE', label: 'Bureaux (par usager)' },
    { value: 'SCHOOL', label: 'École (par élève)' },
    { value: 'HEALTH', label: 'Établissement de santé (par lit)' },
    { value: 'HOTEL', label: 'Hôtel (par lit)' },
  ],
} as const;

// --- Réservoir --------------------------------------------------------------------------------

const tankInput = z
  .object({
    dailyVolume: quantity('volume', { min: 0, exclusiveMin: true, max: 10_000 }).optional(),
    persons: persons.optional(),
    usage: usageSchema.optional(),
    autonomy: quantity('time', { min: 0, exclusiveMin: true, max: 30 * 86_400 }).optional(),
    reserve: quantity('dimensionless', { min: 0, max: 1 }).optional(),
    shape: z.enum(['RECTANGULAR', 'CYLINDRICAL']),
    height: quantity('length', { min: 0, exclusiveMin: true, max: 50 }),
    width: quantity('length', { min: 0, exclusiveMin: true, max: 100 }).optional(),
  })
  .superRefine((input, ctx) => {
    const byPersons = input.persons !== undefined || input.usage !== undefined;
    if (
      input.dailyVolume === undefined &&
      (input.persons === undefined || input.usage === undefined)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: [input.persons === undefined ? 'persons' : 'usage'],
        message: 'Indiquez la consommation journalière, ou le nombre d’usagers et l’usage.',
        params: { code: 'DEMAND_REQUIRED' },
      });
    } else if (input.dailyVolume !== undefined && byPersons) {
      ctx.addIssue({
        code: 'custom',
        path: ['dailyVolume'],
        message: 'Consommation journalière ou usagers, pas les deux.',
        params: { code: 'DEMAND_CONFLICT' },
      });
    }
    if (input.width !== undefined && input.shape === 'CYLINDRICAL') {
      ctx.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'La largeur ne concerne qu’un réservoir rectangulaire.',
        params: { code: 'WIDTH_NOT_APPLICABLE' },
      });
    }
  });
const tankOutput = z.object({
  dailyVolume: positive,
  volume: positive,
  area: positive,
  length: positive.optional(),
  width: positive.optional(),
  diameter: positive.optional(),
});

export const plumbingStorageTank: EngineDefinition<
  z.output<typeof tankInput>,
  z.output<typeof tankOutput>
> = {
  id: 'plumbing.storage-tank',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Réservoir de stockage',
  inputSchema: tankInput,
  outputSchema: tankOutput,
  parameters: [
    {
      key: 'plumbing.consumption.daily',
      kind: 'TABLE',
      unitKind: 'flowRate',
      description: 'Consommation journalière d’eau par usager',
    },
    {
      key: 'plumbing.storage.autonomy',
      kind: 'SCALAR',
      unitKind: 'time',
      description: 'Autonomie d’un réservoir',
    },
    {
      key: 'plumbing.storage.reserve_ratio',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Réserve d’un réservoir',
    },
  ],
  formulas: [
    {
      id: 'storage',
      label: 'Volume du réservoir',
      latex: 'V = V_j \\, T_a \\, (1 + r) ; \\; S = \\frac{V}{h}',
      symbols: [
        { symbol: 'V_j', meaning: 'consommation journalière', unit: 'm3' },
        { symbol: 'T_a', meaning: 'autonomie', unit: 'd' },
        { symbol: 'r', meaning: 'réserve', unit: '%' },
        { symbol: 'h', meaning: 'hauteur utile', unit: 'm' },
      ],
      source: 'Usages courants — plomberie',
    },
  ],
  hypotheses: [
    {
      code: 'PLUMBING.STORAGE_USEFUL',
      text: 'Volume utile, hors revanche et volume mort sous la prise ; consommation répartie uniformément.',
    },
  ],
  presentation: {
    description:
      'Volume et dimensions d’un réservoir (au sol ou surélevé) d’après la consommation journalière et l’autonomie voulue.',
    inputs: [
      {
        key: 'dailyVolume',
        label: 'Consommation journalière',
        kind: 'quantity',
        unitKind: 'volume',
        units: ['m3', 'L'],
        optional: true,
        help: 'Sans saisie : nombre d’usagers × consommation par usager (référentiel).',
      },
      { key: 'persons', label: 'Usagers', kind: 'integer', min: 1, optional: true },
      { ...USAGE_INPUT, optional: true },
      {
        key: 'autonomy',
        label: 'Autonomie',
        kind: 'quantity',
        unitKind: 'time',
        units: ['d', 'h'],
        optional: true,
        help: 'Sans saisie : autonomie usuelle du référentiel (coupures du réseau public).',
      },
      {
        key: 'reserve',
        label: 'Réserve',
        kind: 'quantity',
        unitKind: 'dimensionless',
        units: ['%'],
        optional: true,
      },
      {
        key: 'shape',
        label: 'Forme',
        kind: 'enum',
        options: [
          { value: 'RECTANGULAR', label: 'Rectangulaire' },
          { value: 'CYLINDRICAL', label: 'Cylindrique' },
        ],
      },
      { key: 'height', label: 'Hauteur utile', kind: 'quantity', unitKind: 'length', units: ['m'] },
      {
        key: 'width',
        label: 'Largeur (réservoir rectangulaire)',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
        help: 'Sans saisie : réservoir de base carrée.',
      },
    ],
    outputs: [
      { key: 'dailyVolume', label: 'Consommation journalière', unit: 'm3', precision: 2 },
      { key: 'volume', label: 'Volume utile', unit: 'm3', precision: 2, family: 'NETWORK_WORKS' },
      { key: 'area', label: 'Surface au sol', unit: 'm2', precision: 2 },
      { key: 'length', label: 'Longueur', unit: 'm', precision: 2 },
      { key: 'width', label: 'Largeur', unit: 'm', precision: 2 },
      { key: 'diameter', label: 'Diamètre', unit: 'm', precision: 2 },
    ],
  },
  calculate(i, ctx) {
    let daily: number;
    if (i.dailyVolume) daily = i.dailyVolume.si;
    else {
      // Le schéma exige les usagers et l'usage sans consommation saisie.
      const usage = required(i.usage, 'Usage');
      daily =
        required(i.persons, 'Usagers') *
        tableValue(ctx, 'plumbing.consumption.daily', { usage }, 'm3/d');
    }
    let autonomy: number;
    if (i.autonomy) autonomy = fromSI(i.autonomy.si, 'd');
    else {
      autonomy = ctx.params.scalar('plumbing.storage.autonomy', 'd');
      ctx.assume.defaulted(
        'autonomy',
        `${String(autonomy)} j`,
        'Autonomie usuelle du référentiel d’usages.',
      );
    }
    let reserve: number;
    if (i.reserve) reserve = i.reserve.si;
    else {
      reserve = ctx.params.scalar('plumbing.storage.reserve_ratio', '1');
      ctx.assume.defaulted(
        'reserve',
        `${String(reserve * 100)} %`,
        'Réserve usuelle du référentiel d’usages.',
      );
    }
    const volume = daily * autonomy * (1 + reserve);
    const area = volume / i.height.si;
    ctx.trace.step({
      id: 'T1',
      label: 'Volume utile',
      formula: 'V = V_j \\, T_a \\, (1 + r)',
      substitutions: [
        { symbol: 'V_j', value: daily, unit: 'm3' },
        { symbol: 'T_a', value: autonomy, unit: 'd' },
        { symbol: 'r', value: fromSI(reserve, '%'), unit: '%' },
      ],
      value: volume,
      unit: 'm3',
      source: 'Référentiel d’usages (plomberie)',
    });
    let dimensions: { length?: number; width?: number; diameter?: number };
    if (i.shape === 'CYLINDRICAL') dimensions = { diameter: Math.sqrt((4 * area) / Math.PI) };
    else {
      const width = i.width?.si ?? Math.sqrt(area);
      dimensions = { length: area / width, width };
    }
    ctx.trace.step({
      id: 'T2',
      label: 'Dimensions',
      formula:
        i.shape === 'CYLINDRICAL'
          ? 'S = \\frac{V}{h} ; \\; D = \\sqrt{\\frac{4 S}{\\pi}}'
          : 'S = \\frac{V}{h} ; \\; L = \\frac{S}{l}',
      substitutions: [
        { symbol: 'V', value: volume, unit: 'm3' },
        { symbol: 'h', value: i.height.si, unit: 'm' },
      ],
      value: area,
      unit: 'm2',
    });
    return ok({ dailyVolume: daily, volume, area, ...dimensions });
  },
  verify() {
    return [];
  },
};

// --- Pompe ----------------------------------------------------------------------------------

const pumpInput = z.object({
  flow,
  geometricHeight: quantity('length', { min: -100, max: 500 }),
  losses: pressure,
  residualPressure: pressure,
  efficiency: quantity('dimensionless', { min: 0, exclusiveMin: true, max: 1 }),
});
const pumpOutput = z.object({
  totalHead: z.number(),
  hydraulicPower: nonNegative,
  absorbedPower: nonNegative,
  motorPower: nonNegative,
});

export const plumbingPump: EngineDefinition<
  z.output<typeof pumpInput>,
  z.output<typeof pumpOutput>
> = {
  id: 'plumbing.pump',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Pompe ou surpresseur',
  inputSchema: pumpInput,
  outputSchema: pumpOutput,
  parameters: [
    {
      key: 'plumbing.water.density',
      kind: 'SCALAR',
      unitKind: 'density',
      description: 'Masse volumique de l’eau',
    },
    {
      key: 'plumbing.pump.motor_margin',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Marge de puissance du moteur',
    },
  ],
  formulas: [
    {
      id: 'pump',
      label: 'Hauteur manométrique totale et puissances',
      latex:
        'HMT = H_g + \\frac{\\Delta P + P_r}{\\rho g} ; \\; P_h = \\rho g Q \\, HMT ; \\; P_a = \\frac{P_h}{\\eta}',
      symbols: [
        { symbol: 'H_g', meaning: 'hauteur géométrique', unit: 'm' },
        { symbol: '\\Delta P', meaning: 'pertes de charge', unit: 'kPa' },
        { symbol: 'P_r', meaning: 'pression résiduelle voulue', unit: 'kPa' },
        { symbol: '\\eta', meaning: 'rendement du groupe', unit: '%' },
      ],
      source: 'Hydraulique générale',
    },
  ],
  hypotheses: [
    {
      code: 'PLUMBING.PUMP_DUTY_POINT',
      text: 'Point de fonctionnement unique (débit et hauteur) ; le choix du modèle et ses courbes restent au fournisseur.',
    },
  ],
  presentation: {
    description:
      'Hauteur manométrique totale, puissance hydraulique, puissance absorbée et puissance moteur d’une pompe ou d’un surpresseur.',
    inputs: [
      FLOW_INPUT,
      {
        key: 'geometricHeight',
        label: 'Hauteur géométrique',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        help: 'Du niveau d’aspiration au point le plus haut à alimenter.',
      },
      {
        key: 'losses',
        label: 'Pertes de charge (aspiration et refoulement)',
        kind: 'quantity',
        unitKind: 'pressure',
        units: ['kPa', 'mCE', 'bar'],
      },
      {
        key: 'residualPressure',
        label: 'Pression résiduelle voulue',
        kind: 'quantity',
        unitKind: 'pressure',
        units: ['kPa', 'bar', 'mCE'],
      },
      {
        key: 'efficiency',
        label: 'Rendement du groupe',
        kind: 'quantity',
        unitKind: 'dimensionless',
        units: ['%'],
        help: 'Donnée du fournisseur au point de fonctionnement.',
      },
    ],
    outputs: [
      { key: 'totalHead', label: 'Hauteur manométrique totale', unit: 'm', precision: 2 },
      { key: 'hydraulicPower', label: 'Puissance hydraulique', unit: 'kW', precision: 3 },
      { key: 'absorbedPower', label: 'Puissance absorbée', unit: 'kW', precision: 3 },
      { key: 'motorPower', label: 'Puissance moteur (avec marge)', unit: 'kW', precision: 3 },
    ],
  },
  calculate(i, ctx) {
    const density = waterDensity(ctx);
    const weight = density * STANDARD_GRAVITY;
    const head = i.geometricHeight.si + (i.losses.si + i.residualPressure.si) / weight;
    if (head <= 0) {
      return err({
        code: 'NO_PUMPING',
        message: 'La hauteur manométrique est nulle ou négative : aucune pompe n’est nécessaire.',
      });
    }
    const hydraulic = weight * i.flow.si * head;
    const absorbed = hydraulic / i.efficiency.si;
    const margin = ctx.params.scalar('plumbing.pump.motor_margin', '1');
    const motor = absorbed * (1 + margin);
    ctx.trace.step({
      id: 'T1',
      label: 'Hauteur manométrique totale',
      formula: 'HMT = H_g + \\frac{\\Delta P + P_r}{\\rho g}',
      substitutions: [
        { symbol: 'H_g', value: i.geometricHeight.si, unit: 'm' },
        { symbol: '\\Delta P', value: fromSI(i.losses.si, 'kPa'), unit: 'kPa' },
        { symbol: 'P_r', value: fromSI(i.residualPressure.si, 'kPa'), unit: 'kPa' },
        { symbol: '\\rho', value: density, unit: 'kg/m3' },
      ],
      value: head,
      unit: 'm',
    });
    ctx.trace.step({
      id: 'T2',
      label: 'Puissances',
      formula: 'P_h = \\rho g Q \\, HMT ; \\; P_a = \\frac{P_h}{\\eta} ; \\; P_m = P_a \\, (1 + m)',
      substitutions: [
        { symbol: 'Q', value: fromSI(i.flow.si, 'L/s'), unit: 'L/s' },
        { symbol: 'P_h', value: fromSI(hydraulic, 'kW'), unit: 'kW' },
        { symbol: '\\eta', value: fromSI(i.efficiency.si, '%'), unit: '%' },
        { symbol: 'm', value: fromSI(margin, '%'), unit: '%' },
      ],
      value: fromSI(motor, 'kW'),
      unit: 'kW',
      source: 'Référentiel d’usages (marge moteur)',
    });
    return ok({
      totalHead: head,
      hydraulicPower: fromSI(hydraulic, 'kW'),
      absorbedPower: fromSI(absorbed, 'kW'),
      motorPower: fromSI(motor, 'kW'),
    });
  },
  verify() {
    return [];
  },
};

// --- Chauffe-eau ------------------------------------------------------------------------------

const heaterInput = z.object({
  persons,
  usage: usageSchema,
  coldWaterTemperature: quantity('temperature', { min: 273.15, max: 323.15 }),
  heatingTime: quantity('time', { min: 0, exclusiveMin: true, max: 48 * 3600 }),
  efficiency: quantity('dimensionless', { min: 0, exclusiveMin: true, max: 1 }).optional(),
});
const heaterOutput = z.object({
  dailyVolume: positive,
  capacity: positive,
  energy: positive,
  power: positive,
  heater: breakdownSchema,
});

export const plumbingWaterHeater: EngineDefinition<
  z.output<typeof heaterInput>,
  z.output<typeof heaterOutput>
> = {
  id: 'plumbing.water-heater',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Chauffe-eau à accumulation',
  inputSchema: heaterInput,
  outputSchema: heaterOutput,
  parameters: [
    {
      key: 'plumbing.hot_water.daily',
      kind: 'TABLE',
      unitKind: 'flowRate',
      description: 'Besoin journalier d’eau chaude par usager',
    },
    {
      key: 'plumbing.hot_water.storage_temperature',
      kind: 'SCALAR',
      unitKind: 'temperature',
      description: 'Température de stockage de l’eau chaude',
    },
    {
      key: 'plumbing.water_heater.capacity',
      kind: 'TABLE',
      unitKind: 'volume',
      description: 'Capacités courantes des chauffe-eau',
    },
    {
      key: 'plumbing.water.density',
      kind: 'SCALAR',
      unitKind: 'density',
      description: 'Masse volumique de l’eau',
    },
    {
      key: 'plumbing.water.specific_heat',
      kind: 'SCALAR',
      unitKind: 'specificHeat',
      description: 'Capacité thermique massique de l’eau',
    },
  ],
  formulas: [
    {
      id: 'water-heater',
      label: 'Énergie et puissance de chauffe',
      latex:
        'V_j = N \\, v ; \\; E = \\rho \\, C \\, c \\, (\\theta_s - \\theta_f) ; \\; P = \\frac{E}{t \\, \\eta}',
      symbols: [
        { symbol: 'N', meaning: 'nombre d’usagers' },
        { symbol: 'v', meaning: 'besoin journalier par usager', unit: 'L/d' },
        { symbol: 'C', meaning: 'capacité du chauffe-eau', unit: 'L' },
        { symbol: 'c', meaning: 'capacité thermique massique de l’eau', unit: 'kJ/kgK' },
        { symbol: '\\theta_s', meaning: 'température de stockage', unit: 'degC' },
        { symbol: '\\theta_f', meaning: 'température de l’eau froide', unit: 'degC' },
        { symbol: 't', meaning: 'temps de chauffe', unit: 'h' },
      ],
      source: 'Usages courants — plomberie ; calorimétrie',
    },
  ],
  hypotheses: [
    {
      code: 'PLUMBING.HEATER_ONE_DAY',
      text: 'Un chauffe-eau couvre le besoin d’une journée ; capacité courante immédiatement supérieure ; pertes du ballon négligées.',
    },
  ],
  presentation: {
    description:
      'Besoin journalier d’eau chaude, capacité courante du chauffe-eau, énergie et puissance pour le chauffer dans le temps voulu.',
    inputs: [
      { key: 'persons', label: 'Usagers', kind: 'integer', min: 1 },
      USAGE_INPUT,
      {
        key: 'coldWaterTemperature',
        label: 'Température de l’eau froide',
        kind: 'quantity',
        unitKind: 'temperature',
        units: ['degC'],
        help: 'En Guinée, souvent 25 à 30 °C.',
      },
      {
        key: 'heatingTime',
        label: 'Temps de chauffe',
        kind: 'quantity',
        unitKind: 'time',
        units: ['h'],
      },
      {
        key: 'efficiency',
        label: 'Rendement de chauffe',
        kind: 'quantity',
        unitKind: 'dimensionless',
        units: ['%'],
        optional: true,
        help: 'Sans saisie : 100 % (résistance électrique).',
      },
    ],
    outputs: [
      { key: 'dailyVolume', label: 'Besoin journalier d’eau chaude', unit: 'L', precision: 0 },
      { key: 'capacity', label: 'Capacité retenue', unit: 'L', precision: 0 },
      { key: 'energy', label: 'Énergie pour chauffer la capacité', unit: 'kWh', precision: 2 },
      { key: 'power', label: 'Puissance de chauffe', unit: 'kW', precision: 2 },
      {
        key: 'heater',
        label: 'Chauffe-eau',
        unit: '1',
        precision: 0,
        family: 'EQUIPMENT',
        breakdown: true,
      },
    ],
  },
  calculate(i, ctx) {
    const daily =
      i.persons * tableValue(ctx, 'plumbing.hot_water.daily', { usage: i.usage }, 'L/d');
    const capacity = ctx.params
      .axisValues('plumbing.water_heater.capacity', 'capacity', 'L')
      .find((c) => c >= daily);
    if (capacity === undefined) {
      return err({
        code: 'NO_CAPACITY',
        message:
          'Aucune capacité courante ne couvre le besoin journalier : prévoyez plusieurs chauffe-eau ou une production collective.',
      });
    }
    const storage = ctx.params.scalar('plumbing.hot_water.storage_temperature', 'K');
    const rise = storage - i.coldWaterTemperature.si;
    if (rise <= 0) {
      return err({
        code: 'NO_HEATING',
        message:
          'L’eau froide est déjà à la température de stockage : aucun chauffage n’est requis.',
      });
    }
    let efficiency = 1;
    if (i.efficiency) efficiency = i.efficiency.si;
    else {
      ctx.assume.defaulted(
        'efficiency',
        '100 %',
        'Rendement de chauffe de 100 % (résistance électrique, pertes du ballon négligées).',
      );
    }
    const density = waterDensity(ctx);
    const heat = ctx.params.scalar('plumbing.water.specific_heat', 'J/kgK');
    const energy = density * (capacity / 1000) * heat * rise;
    const power = energy / (i.heatingTime.si * efficiency);
    ctx.trace.step({
      id: 'T1',
      label: 'Besoin journalier et capacité retenue',
      formula: 'V_j = N \\, v ; \\; C = \\min \\{ C_{cour} \\geq V_j \\}',
      substitutions: [
        { symbol: 'N', value: i.persons },
        { symbol: 'v', value: daily / i.persons, unit: 'L/d' },
        { symbol: 'V_j', value: daily, unit: 'L' },
      ],
      value: capacity,
      unit: 'L',
      source: 'Référentiel d’usages (plomberie)',
    });
    ctx.trace.step({
      id: 'T2',
      label: 'Énergie et puissance de chauffe',
      formula: 'E = \\rho \\, C \\, c \\, (\\theta_s - \\theta_f) ; \\; P = \\frac{E}{t \\, \\eta}',
      substitutions: [
        { symbol: 'C', value: capacity, unit: 'L' },
        { symbol: 'c', value: fromSI(heat, 'kJ/kgK'), unit: 'kJ/kgK' },
        { symbol: '\\theta_s - \\theta_f', value: rise },
        { symbol: 'E', value: fromSI(energy, 'kWh'), unit: 'kWh' },
        { symbol: 't', value: fromSI(i.heatingTime.si, 'h'), unit: 'h' },
        { symbol: '\\eta', value: fromSI(efficiency, '%'), unit: '%' },
      ],
      value: fromSI(power, 'kW'),
      unit: 'kW',
    });
    return ok({
      dailyVolume: daily,
      capacity,
      energy: fromSI(energy, 'kWh'),
      power: fromSI(power, 'kW'),
      heater: [
        {
          key: `CAPACITY-${String(capacity)}`,
          label: `Chauffe-eau à accumulation ${String(capacity)} L`,
          group: 'WATER_HEATER',
          groupLabel: 'Chauffe-eau à accumulation',
          value: 1,
        },
      ],
    });
  },
  verify() {
    return [];
  },
};
