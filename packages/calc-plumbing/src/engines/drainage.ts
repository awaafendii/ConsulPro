import {
  checkLimit,
  err,
  fromSI,
  ok,
  quantity,
  type Check,
  type EngineDefinition,
} from '@consulpro/calc-core';
import { z } from 'zod';

import { sizesOf, tableValue, type PipeSize } from '../common/hydraulics';
import {
  countsFromFields,
  FIXTURE_COUNT_INPUTS,
  fixtureCountFields,
  persons,
  positivePercent,
  required,
} from '../common/inputs';

/* Évacuation des eaux usées et vannes, assainissement non collectif et regards. */

const nonNegative = z.number().nonnegative();
const DTU_SOURCE = 'NF DTU 60.11 (partie 2) ; NF EN 12056-2, système I';

// --- Évacuation -----------------------------------------------------------------------------

const roleSchema = z.enum(['BRANCH', 'STACK', 'COLLECTOR']);
const usageSchema = z.enum(['DWELLING', 'PUBLIC', 'INTENSIVE', 'SPECIAL']);

const drainageInput = z
  .object({
    ...fixtureCountFields,
    usage: usageSchema,
    role: roleSchema,
    slope: positivePercent.optional(),
  })
  .superRefine((input, ctx) => {
    if (countsFromFields(input).size === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['washbasin'],
        message: 'Saisissez au moins un appareil raccordé.',
        params: { code: 'NO_FIXTURE' },
      });
    }
    if (input.role !== 'STACK' && input.slope === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['slope'],
        message: 'La pente est exigée pour une canalisation horizontale.',
        params: { code: 'SLOPE_REQUIRED' },
      });
    }
  });
const drainageOutput = z.object({
  dischargeUnits: nonNegative,
  wastewaterFlow: z.number().positive(),
  size: z.number().positive(),
  innerDiameter: z.number().positive(),
  capacity: z.number().positive(),
  minSlope: nonNegative.optional(),
  fillRatio: nonNegative.optional(),
});

/** Débit d'une canalisation circulaire partiellement remplie (Manning-Strickler), m³/s. */
export function partialFlow(input: {
  inner: number;
  fill: number;
  slope: number;
  strickler: number;
}): number {
  const theta = 2 * Math.acos(1 - 2 * input.fill);
  const area = (input.inner ** 2 / 8) * (theta - Math.sin(theta));
  const perimeter = (input.inner * theta) / 2;
  return input.strickler * area * (area / perimeter) ** (2 / 3) * Math.sqrt(input.slope);
}

const noDrainSize = () =>
  err({
    code: 'NO_SIZE',
    message:
      'Aucun diamètre du référentiel n’évacue ce débit : prévoyez plusieurs canalisations ou une pente plus forte.',
  });

export const plumbingDrainage: EngineDefinition<
  z.output<typeof drainageInput>,
  z.output<typeof drainageOutput>
> = {
  id: 'plumbing.drainage',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Évacuation des eaux usées et vannes',
  inputSchema: drainageInput,
  outputSchema: drainageOutput,
  parameters: [
    {
      key: 'plumbing.pipe.inner_diameter',
      kind: 'TABLE',
      unitKind: 'length',
      description: 'Diamètre intérieur des tubes par matériau et désignation',
    },
    {
      key: 'plumbing.drainage.discharge_unit',
      kind: 'TABLE',
      unitKind: 'flowRate',
      description: 'Débit unitaire d’évacuation des appareils (DU)',
    },
    {
      key: 'plumbing.drainage.frequency_factor',
      kind: 'TABLE',
      unitKind: 'dimensionless',
      description: 'Coefficient de fréquence d’utilisation K',
    },
    {
      key: 'plumbing.drainage.min_inner_diameter',
      kind: 'TABLE',
      unitKind: 'length',
      description: 'Diamètre intérieur minimal de l’évacuation d’un appareil',
    },
    {
      key: 'plumbing.drainage.stack_capacity',
      kind: 'TABLE',
      unitKind: 'flowRate',
      description: 'Débit admissible d’une chute à ventilation primaire',
    },
    {
      key: 'plumbing.drainage.fill_ratio',
      kind: 'TABLE',
      unitKind: 'dimensionless',
      description: 'Taux de remplissage maximal des canalisations horizontales',
    },
    {
      key: 'plumbing.drainage.min_slope',
      kind: 'TABLE',
      unitKind: 'dimensionless',
      description: 'Pente minimale des canalisations horizontales',
    },
    {
      key: 'plumbing.drainage.strickler',
      kind: 'TABLE',
      unitKind: 'strickler',
      description: 'Coefficient de Strickler des canalisations d’évacuation',
    },
  ],
  formulas: [
    {
      id: 'wastewater-flow',
      label: 'Débit d’eaux usées',
      latex: 'Q_{ww} = \\max\\left(K \\sqrt{\\sum DU}, \\; DU_{max}\\right)',
      symbols: [
        { symbol: 'K', meaning: 'coefficient de fréquence d’utilisation' },
        { symbol: 'DU', meaning: 'débit unitaire d’un appareil', unit: 'L/s' },
      ],
      source: DTU_SOURCE,
    },
    {
      id: 'manning',
      label: 'Débit d’une canalisation horizontale partiellement remplie',
      latex: 'Q = K_s \\, A \\, R_h^{2/3} \\sqrt{I}',
      symbols: [
        { symbol: 'K_s', meaning: 'coefficient de Strickler', unit: 'm1/3/s' },
        { symbol: 'A', meaning: 'section mouillée', unit: 'm2' },
        { symbol: 'R_h', meaning: 'rayon hydraulique', unit: 'm' },
        { symbol: 'I', meaning: 'pente', unit: '%' },
      ],
      source: 'Manning-Strickler',
    },
  ],
  hypotheses: [
    {
      code: 'PLUMBING.PVC_DRAIN',
      text: 'Canalisations en PVC d’évacuation (série courante), chutes à ventilation primaire.',
    },
  ],
  presentation: {
    description:
      'Débit d’eaux usées des appareils raccordés et diamètre d’un branchement, d’une chute ou d’un collecteur.',
    inputs: [
      ...FIXTURE_COUNT_INPUTS,
      {
        key: 'usage',
        label: 'Fréquence d’utilisation',
        kind: 'enum',
        options: [
          { value: 'DWELLING', label: 'Intermittente (logements, bureaux)' },
          { value: 'PUBLIC', label: 'Fréquente (hôpitaux, écoles, restaurants, hôtels)' },
          { value: 'INTENSIVE', label: 'Très fréquente (toilettes et douches publiques)' },
          { value: 'SPECIAL', label: 'Particulière (laboratoires)' },
        ],
      },
      {
        key: 'role',
        label: 'Canalisation',
        kind: 'enum',
        options: [
          { value: 'BRANCH', label: 'Branchement horizontal' },
          { value: 'STACK', label: 'Chute verticale' },
          { value: 'COLLECTOR', label: 'Collecteur horizontal' },
        ],
      },
      {
        key: 'slope',
        label: 'Pente',
        kind: 'quantity',
        unitKind: 'dimensionless',
        units: ['%'],
        optional: true,
        help: 'Exigée pour une canalisation horizontale.',
      },
    ],
    outputs: [
      { key: 'dischargeUnits', label: 'Somme des débits unitaires ΣDU', unit: 'L/s', precision: 1 },
      { key: 'wastewaterFlow', label: 'Débit d’eaux usées Q_ww', unit: 'L/s', precision: 2 },
      { key: 'size', label: 'Tube PVC retenu (Ø extérieur)', unit: 'mm', precision: 0 },
      { key: 'innerDiameter', label: 'Diamètre intérieur', unit: 'mm', precision: 1 },
      { key: 'capacity', label: 'Débit admissible', unit: 'L/s', precision: 2 },
      { key: 'minSlope', label: 'Pente minimale', unit: '%', precision: 1 },
      { key: 'fillRatio', label: 'Taux de remplissage admis', unit: '1', precision: 2 },
    ],
  },
  calculate(i, ctx) {
    const counts = countsFromFields(i);
    let units = 0;
    let largest = 0;
    let minimum = 0;
    for (const [fixture, count] of counts) {
      const du = tableValue(ctx, 'plumbing.drainage.discharge_unit', { fixture }, 'L/s');
      units += count * du;
      largest = Math.max(largest, du);
      minimum = Math.max(
        minimum,
        tableValue(ctx, 'plumbing.drainage.min_inner_diameter', { fixture }, 'm'),
      );
    }
    const k = tableValue(ctx, 'plumbing.drainage.frequency_factor', { usage: i.usage }, '1');
    const flow = Math.max(k * Math.sqrt(units), largest);
    ctx.trace.step({
      id: 'T1',
      label: 'Débit d’eaux usées',
      formula: 'Q_{ww} = \\max\\left(K \\sqrt{\\sum DU}, \\; DU_{max}\\right)',
      substitutions: [
        { symbol: 'K', value: k },
        { symbol: '\\sum DU', value: units, unit: 'L/s' },
        { symbol: 'DU_{max}', value: largest, unit: 'L/s' },
      ],
      value: flow,
      unit: 'L/s',
      source: 'Référentiel NF DTU 60.11 (débits unitaires, coefficients K)',
    });
    const sizes = sizesOf(ctx, 'PVC_DRAIN').filter((s) => s.inner >= minimum);
    let chosen: PipeSize | undefined;
    let capacity = 0;
    let fill: number | undefined;
    let minSlope: number | undefined;
    if (i.role === 'STACK') {
      const stacks = ctx.params.axisValues('plumbing.drainage.stack_capacity', 'size', 'mm');
      for (const size of sizes) {
        if (!stacks.includes(size.size)) continue;
        const cap = tableValue(
          ctx,
          'plumbing.drainage.stack_capacity',
          { size: size.size * 1e-3 },
          'L/s',
        );
        if (cap >= flow) {
          chosen = size;
          capacity = cap;
          break;
        }
      }
    } else {
      const role = i.role;
      fill = tableValue(ctx, 'plumbing.drainage.fill_ratio', { role }, '1');
      minSlope = tableValue(ctx, 'plumbing.drainage.min_slope', { role }, '%');
      const strickler = tableValue(
        ctx,
        'plumbing.drainage.strickler',
        { material: 'PVC_DRAIN' },
        'm1/3/s',
      );
      // Le schéma exige la pente des canalisations horizontales.
      const slope = required(i.slope, 'Pente').si;
      for (const size of sizes) {
        const cap = fromSI(partialFlow({ inner: size.inner, fill, slope, strickler }), 'L/s');
        if (cap >= flow) {
          chosen = size;
          capacity = cap;
          break;
        }
      }
    }
    if (!chosen) return noDrainSize();
    ctx.trace.step({
      id: 'T2',
      label:
        i.role === 'STACK'
          ? 'Chute retenue (débit admissible du référentiel)'
          : 'Canalisation horizontale retenue (Manning-Strickler)',
      formula:
        i.role === 'STACK'
          ? 'Q_{adm}(D) \\geq Q_{ww} ; \\; D_{int} \\geq D_{app}'
          : 'K_s \\, A \\, R_h^{2/3} \\sqrt{I} \\geq Q_{ww} \\text{ à } h/D = \\tau ; \\; D_{int} \\geq D_{app}',
      substitutions: [
        { symbol: 'Q_{ww}', value: flow, unit: 'L/s' },
        { symbol: 'D_{app}', value: fromSI(minimum, 'mm'), unit: 'mm' },
        { symbol: 'D_{int}', value: fromSI(chosen.inner, 'mm'), unit: 'mm' },
        ...(fill === undefined ? [] : [{ symbol: '\\tau', value: fill }]),
      ],
      value: capacity,
      unit: 'L/s',
      source: DTU_SOURCE,
    });
    return ok({
      dischargeUnits: units,
      wastewaterFlow: flow,
      size: chosen.size,
      innerDiameter: fromSI(chosen.inner, 'mm'),
      capacity,
      ...(minSlope === undefined ? {} : { minSlope }),
      ...(fill === undefined ? {} : { fillRatio: fill }),
    });
  },
  verify(i, out) {
    const checks: Check[] = [
      checkLimit({
        rule: 'plumbing.drainage.capacity',
        label: 'Débit d’eaux usées au plus égal au débit admissible',
        measured: out.wastewaterFlow,
        limit: out.capacity,
        comparison: '<=',
        severity: 'BLOCKING',
        unit: 'L/s',
        clause: 'P2',
      }),
    ];
    if (i.slope && out.minSlope !== undefined) {
      checks.push(
        checkLimit({
          rule: 'plumbing.drainage.min-slope',
          label: 'Pente au moins égale à la pente minimale',
          measured: fromSI(i.slope.si, '%'),
          limit: out.minSlope,
          comparison: '>=',
          severity: 'BLOCKING',
          unit: '%',
          clause: 'P2',
        }),
      );
    }
    return checks;
  },
};

// --- Fosse et puisard -------------------------------------------------------------------------

const septicInput = z
  .object({
    method: z.enum(['ROOMS', 'USERS']),
    rooms: z.number().int().min(1).max(50).optional(),
    users: persons.optional(),
    permeability: quantity('velocity', { min: 0, exclusiveMin: true, max: 1e-3 }).optional(),
    soakawayDiameter: quantity('length', { min: 0.5, max: 5 }).optional(),
  })
  .superRefine((input, ctx) => {
    const missing = input.method === 'ROOMS' ? input.rooms : input.users;
    if (missing === undefined) {
      const field = input.method === 'ROOMS' ? 'rooms' : 'users';
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message:
          field === 'rooms'
            ? 'Indiquez le nombre de pièces principales.'
            : 'Indiquez le nombre d’usagers.',
        params: { code: 'METHOD_INPUT_REQUIRED' },
      });
    }
    if (input.soakawayDiameter !== undefined && input.permeability === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['permeability'],
        message: 'Le puisard se dimensionne d’après la perméabilité mesurée du sol.',
        params: { code: 'PERMEABILITY_REQUIRED' },
      });
    }
  });
const septicOutput = z.object({
  volume: z.number().positive(),
  minVolume: z.number().positive(),
  users: z.number().int().positive(),
  dailyEffluent: z.number().positive(),
  infiltrationArea: nonNegative.optional(),
  soakawayDepth: nonNegative.optional(),
});

export const plumbingSepticTank: EngineDefinition<
  z.output<typeof septicInput>,
  z.output<typeof septicOutput>
> = {
  id: 'plumbing.septic-tank',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Fosse septique et puisard',
  inputSchema: septicInput,
  outputSchema: septicOutput,
  parameters: [
    {
      key: 'plumbing.septic.base_volume',
      kind: 'SCALAR',
      unitKind: 'volume',
      description: 'Volume utile minimal d’une fosse toutes eaux',
    },
    {
      key: 'plumbing.septic.base_rooms',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Pièces principales couvertes par le volume minimal',
    },
    {
      key: 'plumbing.septic.volume_per_extra_room',
      kind: 'SCALAR',
      unitKind: 'volume',
      description: 'Volume supplémentaire par pièce principale',
    },
    {
      key: 'plumbing.septic.wastewater_per_user',
      kind: 'SCALAR',
      unitKind: 'flowRate',
      description: 'Rejet journalier d’eaux usées par usager',
    },
    {
      key: 'plumbing.septic.retention_time',
      kind: 'SCALAR',
      unitKind: 'time',
      description: 'Temps de séjour des eaux dans la fosse',
    },
    {
      key: 'plumbing.septic.sludge_per_user',
      kind: 'SCALAR',
      unitKind: 'flowRate',
      description: 'Accumulation de boues par usager',
    },
    {
      key: 'plumbing.septic.desludging_interval',
      kind: 'SCALAR',
      unitKind: 'time',
      description: 'Intervalle entre deux vidanges',
    },
    {
      key: 'plumbing.soakaway.permeability_ratio',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Part de la perméabilité mesurée retenue pour le puisard',
    },
  ],
  formulas: [
    {
      id: 'septic-rooms',
      label: 'Fosse toutes eaux (NF DTU 64.1)',
      latex: 'V = V_0 + \\max(0, \\; n - n_0) \\, v_p',
      symbols: [
        { symbol: 'V_0', meaning: 'volume utile minimal', unit: 'm3' },
        { symbol: 'n', meaning: 'nombre de pièces principales' },
        { symbol: 'v_p', meaning: 'volume par pièce supplémentaire', unit: 'm3' },
      ],
      source: 'NF DTU 64.1',
    },
    {
      id: 'septic-users',
      label: 'Fosse par usager (pratique courante)',
      latex: 'V = N \\, (q \\, t_s + s \\, T)',
      symbols: [
        { symbol: 'N', meaning: 'nombre d’usagers' },
        { symbol: 'q', meaning: 'rejet journalier par usager', unit: 'L/d' },
        { symbol: 't_s', meaning: 'temps de séjour', unit: 'd' },
        { symbol: 's', meaning: 'accumulation de boues par usager', unit: 'L/a' },
        { symbol: 'T', meaning: 'intervalle entre vidanges', unit: 'a' },
      ],
      source: 'Usages courants — plomberie',
    },
    {
      id: 'soakaway',
      label: 'Puisard',
      latex: 'S = \\frac{N \\, q}{r \\, K} ; \\; h = \\frac{S - \\pi D^2 / 4}{\\pi D}',
      symbols: [
        { symbol: 'K', meaning: 'perméabilité mesurée du sol', unit: 'mm/h' },
        { symbol: 'r', meaning: 'part de la perméabilité retenue' },
        { symbol: 'D', meaning: 'diamètre du puisard', unit: 'm' },
      ],
      source: 'Usages courants — plomberie',
    },
  ],
  hypotheses: [
    {
      code: 'PLUMBING.SEPTIC_ALL_WATERS',
      text: 'Fosse toutes eaux (eaux vannes et eaux ménagères) ; effluent infiltré par un puisard ou un épandage dimensionné à part.',
    },
  ],
  presentation: {
    description:
      'Volume d’une fosse toutes eaux (pièces principales ou usagers) et, si la perméabilité du sol est connue, surface d’infiltration et profondeur d’un puisard.',
    inputs: [
      {
        key: 'method',
        label: 'Méthode',
        kind: 'enum',
        options: [
          { value: 'ROOMS', label: 'Pièces principales (maison, NF DTU 64.1)' },
          { value: 'USERS', label: 'Nombre d’usagers (pratique courante)' },
        ],
      },
      { key: 'rooms', label: 'Pièces principales', kind: 'integer', min: 1, optional: true },
      { key: 'users', label: 'Usagers', kind: 'integer', min: 1, optional: true },
      {
        key: 'permeability',
        label: 'Perméabilité mesurée du sol',
        kind: 'quantity',
        unitKind: 'velocity',
        units: ['mm/h'],
        optional: true,
        help: 'Essai de percolation sur site : sans valeur, le puisard n’est pas dimensionné.',
      },
      {
        key: 'soakawayDiameter',
        label: 'Diamètre du puisard',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
        optional: true,
      },
    ],
    outputs: [
      {
        key: 'volume',
        label: 'Volume utile de la fosse',
        unit: 'm3',
        precision: 2,
        family: 'NETWORK_WORKS',
      },
      { key: 'minVolume', label: 'Volume utile minimal', unit: 'm3', precision: 2 },
      { key: 'users', label: 'Usagers retenus', unit: '1', precision: 0 },
      { key: 'dailyEffluent', label: 'Rejet journalier', unit: 'L/d', precision: 0 },
      { key: 'infiltrationArea', label: 'Surface d’infiltration', unit: 'm2', precision: 2 },
      { key: 'soakawayDepth', label: 'Profondeur utile du puisard', unit: 'm', precision: 2 },
    ],
  },
  calculate(i, ctx) {
    const base = ctx.params.scalar('plumbing.septic.base_volume', 'm3');
    const perUser = ctx.params.scalar('plumbing.septic.wastewater_per_user', 'm3/d');
    let volume: number;
    let users: number;
    if (i.method === 'ROOMS') {
      // Le schéma exige les pièces pour cette méthode.
      const rooms = required(i.rooms, 'Pièces principales');
      const baseRooms = ctx.params.scalar('plumbing.septic.base_rooms', '1');
      const extra = ctx.params.scalar('plumbing.septic.volume_per_extra_room', 'm3');
      volume = base + Math.max(0, rooms - baseRooms) * extra;
      users = rooms;
      ctx.assume.engine(
        'PLUMBING.USERS_ROOMS',
        'Usagers retenus pour le rejet journalier : un par pièce principale.',
      );
      ctx.trace.step({
        id: 'T1',
        label: 'Volume utile (pièces principales)',
        formula: 'V = V_0 + \\max(0, \\; n - n_0) \\, v_p',
        substitutions: [
          { symbol: 'V_0', value: base, unit: 'm3' },
          { symbol: 'n', value: rooms },
          { symbol: 'n_0', value: baseRooms },
          { symbol: 'v_p', value: extra, unit: 'm3' },
        ],
        value: volume,
        unit: 'm3',
        source: 'Référentiel NF DTU 64.1',
      });
    } else {
      // Le schéma exige les usagers pour cette méthode.
      users = required(i.users, 'Usagers');
      const retention = ctx.params.scalar('plumbing.septic.retention_time', 'd');
      const sludge = ctx.params.scalar('plumbing.septic.sludge_per_user', 'L/a');
      const interval = ctx.params.scalar('plumbing.septic.desludging_interval', 'a');
      volume = users * (perUser * retention + (sludge * interval) / 1000);
      ctx.trace.step({
        id: 'T1',
        label: 'Volume utile (usagers)',
        formula: 'V = N \\, (q \\, t_s + s \\, T)',
        substitutions: [
          { symbol: 'N', value: users },
          { symbol: 'q', value: perUser * 1000, unit: 'L/d' },
          { symbol: 't_s', value: retention, unit: 'd' },
          { symbol: 's', value: sludge, unit: 'L/a' },
          { symbol: 'T', value: interval, unit: 'a' },
        ],
        value: volume,
        unit: 'm3',
        source: 'Référentiel d’usages (plomberie)',
      });
    }
    const daily = users * perUser;
    let soakaway: { infiltrationArea?: number; soakawayDepth?: number } = {};
    if (i.permeability) {
      const ratio = ctx.params.scalar('plumbing.soakaway.permeability_ratio', '1');
      // m³/j ÷ (m/s × 86 400 s/j) = m².
      const area = daily / (ratio * i.permeability.si * 86_400);
      const diameter = i.soakawayDiameter?.si;
      const depth =
        diameter === undefined
          ? undefined
          : Math.max(0, (area - (Math.PI * diameter ** 2) / 4) / (Math.PI * diameter));
      ctx.trace.step({
        id: 'T2',
        label: 'Puisard : surface d’infiltration',
        formula:
          diameter === undefined
            ? 'S = \\frac{N \\, q}{r \\, K}'
            : 'S = \\frac{N \\, q}{r \\, K} ; \\; h = \\frac{S - \\pi D^2 / 4}{\\pi D}',
        substitutions: [
          { symbol: 'N \\, q', value: fromSI(daily / 86_400, 'L/d'), unit: 'L/d' },
          { symbol: 'r', value: ratio },
          { symbol: 'K', value: fromSI(i.permeability.si, 'mm/h'), unit: 'mm/h' },
          ...(diameter === undefined ? [] : [{ symbol: 'D', value: diameter, unit: 'm' as const }]),
        ],
        value: area,
        unit: 'm2',
        source: 'Référentiel d’usages (plomberie)',
      });
      soakaway = {
        infiltrationArea: area,
        ...(depth === undefined ? {} : { soakawayDepth: depth }),
      };
    }
    return ok({
      volume,
      minVolume: base,
      users,
      dailyEffluent: fromSI(daily / 86_400, 'L/d'),
      ...soakaway,
    });
  },
  verify(_i, out) {
    return [
      checkLimit({
        rule: 'plumbing.septic.min-volume',
        label: 'Volume utile au moins égal au volume minimal d’une fosse toutes eaux',
        measured: out.volume,
        limit: out.minVolume,
        comparison: '>=',
        severity: 'BLOCKING',
        unit: 'm3',
        clause: 'P1-1',
      }),
    ];
  },
};

// --- Regards ----------------------------------------------------------------------------------

const manholeInput = z
  .object({
    length: quantity('length', { min: 0, exclusiveMin: true, max: 5000 }),
    points: z
      .array(z.object({ chainage: quantity('length', { min: 0, exclusiveMin: true, max: 5000 }) }))
      .max(200)
      .optional(),
    startDepth: quantity('length', { min: 0, exclusiveMin: true, max: 10 }),
    slope: positivePercent,
    groundSlope: quantity('dimensionless', { min: -1, max: 1 }).optional(),
  })
  .superRefine((input, ctx) => {
    input.points?.forEach((point, index) => {
      if (point.chainage.si >= input.length.si) {
        ctx.addIssue({
          code: 'custom',
          path: ['points', index, 'chainage'],
          message: 'Un point singulier se situe entre le départ et l’extrémité du collecteur.',
          params: { code: 'POINT_OUT_OF_RANGE' },
        });
      }
    });
  });
const manholeOutput = z.object({
  count: z.number().int().positive(),
  maxSpacing: z.number().positive(),
  spacingLimit: z.number().positive(),
  maxDepth: z.number().positive(),
  endDepth: z.number().positive(),
  totalDepth: z.number().positive(),
});

/** Positions des regards : extrémités, points singuliers, puis intermédiaires réguliers. */
export function manholePositions(
  length: number,
  singular: readonly number[],
  maxSpacing: number,
): number[] {
  const fixed = [...new Set([...singular, length])].sort((a, b) => a - b);
  const positions: number[] = [];
  let from = 0;
  for (const to of fixed) {
    const intervals = Math.ceil((to - from) / maxSpacing - 1e-9);
    for (let j = 0; j < intervals; j++) positions.push(from + ((to - from) * j) / intervals);
    from = to;
  }
  positions.push(length);
  return positions;
}

export const plumbingManholes: EngineDefinition<
  z.output<typeof manholeInput>,
  z.output<typeof manholeOutput>
> = {
  id: 'plumbing.manholes',
  version: '1.0.0',
  discipline: 'PLUMBING',
  title: 'Regards de visite',
  inputSchema: manholeInput,
  outputSchema: manholeOutput,
  parameters: [
    {
      key: 'plumbing.manhole.max_spacing',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Espacement maximal entre deux regards',
    },
  ],
  formulas: [
    {
      id: 'manholes',
      label: 'Implantation et profondeur des regards',
      latex:
        'n_k = \\left\\lceil \\frac{\\ell_k}{e_{max}} \\right\\rceil ; \\; h(x) = h_0 + x \\, (I - I_t)',
      symbols: [
        { symbol: '\\ell_k', meaning: 'longueur entre deux points singuliers', unit: 'm' },
        { symbol: 'e_{max}', meaning: 'espacement maximal', unit: 'm' },
        { symbol: 'h_0', meaning: 'profondeur du fil d’eau au départ', unit: 'm' },
        { symbol: 'I', meaning: 'pente du collecteur', unit: '%' },
        { symbol: 'I_t', meaning: 'pente du terrain dans le sens de l’écoulement', unit: '%' },
      ],
      source: 'Usages courants — plomberie',
    },
  ],
  hypotheses: [
    {
      code: 'PLUMBING.MANHOLES_SINGULAR',
      text: 'Un regard à chaque extrémité et à chaque point singulier (changement de direction, de pente, jonction), des regards intermédiaires régulièrement espacés au-delà.',
    },
  ],
  presentation: {
    description:
      'Nombre, espacement et profondeur des regards d’un collecteur d’évacuation enterré.',
    inputs: [
      {
        key: 'length',
        label: 'Longueur du collecteur',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m'],
      },
      {
        key: 'points',
        label: 'Points singuliers',
        kind: 'list',
        maxItems: 200,
        optional: true,
        fields: [
          {
            key: 'chainage',
            label: 'Distance depuis le départ',
            kind: 'quantity',
            unitKind: 'length',
            units: ['m'],
          },
        ],
        help: 'Changements de direction ou de pente, jonctions.',
      },
      {
        key: 'startDepth',
        label: 'Profondeur du fil d’eau au départ',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m', 'cm'],
      },
      {
        key: 'slope',
        label: 'Pente du collecteur',
        kind: 'quantity',
        unitKind: 'dimensionless',
        units: ['%'],
      },
      {
        key: 'groundSlope',
        label: 'Pente du terrain dans le sens de l’écoulement',
        kind: 'quantity',
        unitKind: 'dimensionless',
        units: ['%'],
        optional: true,
        help: 'Positive si le terrain descend. Sans saisie : terrain horizontal.',
      },
    ],
    outputs: [
      { key: 'count', label: 'Regards', unit: '1', precision: 0, family: 'NETWORK_WORKS' },
      { key: 'maxSpacing', label: 'Plus grand espacement', unit: 'm', precision: 2 },
      { key: 'spacingLimit', label: 'Espacement maximal admis', unit: 'm', precision: 2 },
      { key: 'maxDepth', label: 'Profondeur maximale', unit: 'm', precision: 2 },
      { key: 'endDepth', label: 'Profondeur à l’extrémité', unit: 'm', precision: 2 },
      {
        key: 'totalDepth',
        label: 'Profondeur cumulée des regards',
        unit: 'm',
        precision: 2,
        family: 'NETWORK_WORKS',
      },
    ],
  },
  calculate(i, ctx) {
    const limit = ctx.params.scalar('plumbing.manhole.max_spacing', 'm');
    let groundSlope = 0;
    if (i.groundSlope === undefined) {
      ctx.assume.defaulted('groundSlope', 0, 'Terrain horizontal le long du collecteur.');
    } else groundSlope = i.groundSlope.si;
    const positions = manholePositions(
      i.length.si,
      (i.points ?? []).map((p) => p.chainage.si),
      limit,
    );
    const depths = positions.map((x) => i.startDepth.si + x * (i.slope.si - groundSlope));
    const shallowest = Math.min(...depths);
    if (shallowest <= 0) {
      return err({
        code: 'INVERT_ABOVE_GROUND',
        message:
          'Le fil d’eau sortirait du terrain : augmentez la profondeur de départ ou réduisez la pente du collecteur.',
      });
    }
    let spacing = 0;
    let previous = 0;
    for (const x of positions) {
      spacing = Math.max(spacing, x - previous);
      previous = x;
    }
    ctx.trace.step({
      id: 'T1',
      label: 'Implantation des regards',
      formula: 'n_k = \\left\\lceil \\frac{\\ell_k}{e_{max}} \\right\\rceil',
      substitutions: [
        { symbol: 'L', value: i.length.si, unit: 'm' },
        { symbol: 'e_{max}', value: limit, unit: 'm' },
        { symbol: 'e', value: spacing, unit: 'm' },
      ],
      value: positions.length,
      source: 'Référentiel d’usages (plomberie)',
    });
    const maxDepth = Math.max(...depths);
    const total = depths.reduce((sum, d) => sum + d, 0);
    ctx.trace.step({
      id: 'T2',
      label: 'Profondeurs des regards',
      formula: 'h(x) = h_0 + x \\, (I - I_t)',
      substitutions: [
        { symbol: 'h_0', value: i.startDepth.si, unit: 'm' },
        { symbol: 'I', value: fromSI(i.slope.si, '%'), unit: '%' },
        { symbol: 'I_t', value: fromSI(groundSlope, '%'), unit: '%' },
      ],
      value: total,
      unit: 'm',
    });
    return ok({
      count: positions.length,
      maxSpacing: spacing,
      spacingLimit: limit,
      maxDepth,
      endDepth: i.startDepth.si + i.length.si * (i.slope.si - groundSlope),
      totalDepth: total,
    });
  },
  verify(_i, out) {
    return [
      checkLimit({
        rule: 'plumbing.manhole.spacing',
        label: 'Espacement entre deux regards au plus égal à l’espacement maximal',
        measured: out.maxSpacing,
        limit: out.spacingLimit,
        comparison: '<=',
        severity: 'BLOCKING',
        unit: 'm',
      }),
    ];
  },
};
