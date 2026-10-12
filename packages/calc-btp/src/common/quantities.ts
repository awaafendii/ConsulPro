import {
  fromSI,
  ParameterAccessError,
  type CalcContext,
  type Measured,
  type ParameterRequirement,
  type UnitSymbol,
} from '@consulpro/calc-core';

/*
 * Briques communes des moteurs BTP : lecture des tables du référentiel, décomposition des
 * bétons et mortiers en matériaux, aciers par ratio ou par nomenclature. Chaque étape est
 * tracée (formule, substitutions, résultat) ; aucune valeur normative n'est codée ici.
 */

export type ConcreteMix = 'PROPRETE' | 'FORME' | 'ARME';
export type MortarMix = 'MASONRY' | 'RENDER' | 'BEDDING';
export type SteelElement = 'FOOTING' | 'GROUND_BEAM' | 'COLUMN' | 'BEAM' | 'SLAB' | 'STAIRS';

/** Valeur d'une table catégorielle, convertie dans l'unité demandée. */
export function tableValue(
  ctx: CalcContext,
  key: string,
  coordinates: Readonly<Record<string, string>>,
  unit: UnitSymbol,
): number {
  const reading = ctx.params.table(key, coordinates);
  if (!reading.ok) throw new ParameterAccessError(key, `${key} : ${reading.error.message}`);
  return fromSI(reading.value.si, unit);
}

/** Paramètres lus par la décomposition des bétons. */
export const CONCRETE_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'btp.concrete.cement',
    kind: 'TABLE',
    unitKind: 'density',
    description: 'Dosage en ciment des bétons',
  },
  {
    key: 'btp.concrete.sand',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Sable par m³ de béton',
  },
  {
    key: 'btp.concrete.gravel',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Gravier par m³ de béton',
  },
  {
    key: 'btp.concrete.water',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Eau par m³ de béton',
  },
  {
    key: 'btp.waste.concrete',
    kind: 'SCALAR',
    unitKind: 'dimensionless',
    description: 'Taux de pertes sur béton',
  },
  {
    key: 'btp.cement.bag_mass',
    kind: 'SCALAR',
    unitKind: 'mass',
    description: "Masse d'un sac de ciment",
  },
];

export const MORTAR_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'btp.mortar.cement',
    kind: 'TABLE',
    unitKind: 'density',
    description: 'Dosage en ciment des mortiers',
  },
  {
    key: 'btp.mortar.sand',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Sable par m³ de mortier',
  },
  {
    key: 'btp.mortar.water',
    kind: 'TABLE',
    unitKind: 'dimensionless',
    description: 'Eau par m³ de mortier',
  },
  {
    key: 'btp.waste.mortar',
    kind: 'SCALAR',
    unitKind: 'dimensionless',
    description: 'Taux de pertes sur mortiers',
  },
  {
    key: 'btp.cement.bag_mass',
    kind: 'SCALAR',
    unitKind: 'mass',
    description: "Masse d'un sac de ciment",
  },
];

export const STEEL_PARAMETERS: readonly ParameterRequirement[] = [
  {
    key: 'btp.steel.ratio',
    kind: 'TABLE',
    unitKind: 'density',
    description: "Ratio d'acier par m³ de béton armé",
  },
  {
    key: 'btp.steel.density',
    kind: 'SCALAR',
    unitKind: 'density',
    description: "Masse volumique de l'acier",
  },
  {
    key: 'btp.waste.steel',
    kind: 'SCALAR',
    unitKind: 'dimensionless',
    description: 'Taux de pertes sur aciers',
  },
];

/** Matériaux secs d'un béton ou d'un mortier (sommés entre composants d'un même calcul). */
export interface Materials {
  cement: number;
  sand: number;
  gravel: number;
  water: number;
}

export const noMaterials = (): Materials => ({ cement: 0, sand: 0, gravel: 0, water: 0 });

function add(total: Materials, part: Materials): Materials {
  return {
    cement: total.cement + part.cement,
    sand: total.sand + part.sand,
    gravel: total.gravel + part.gravel,
    water: total.water + part.water,
  };
}

/**
 * Matériaux d'un béton : volume commandé = volume net × (1 + pertes), puis dosages du
 * référentiel par m³. Eau en litres.
 */
export function concreteMaterials(
  ctx: CalcContext,
  id: string,
  label: string,
  mix: ConcreteMix,
  netVolume: number,
  total: Materials = noMaterials(),
): Materials {
  if (netVolume <= 0) return total;
  const waste = ctx.params.scalar('btp.waste.concrete', '1');
  const ordered = netVolume * (1 + waste);
  const cement = tableValue(ctx, 'btp.concrete.cement', { mix }, 'kg/m3');
  const sand = tableValue(ctx, 'btp.concrete.sand', { mix }, '1');
  const gravel = tableValue(ctx, 'btp.concrete.gravel', { mix }, '1');
  const water = tableValue(ctx, 'btp.concrete.water', { mix }, '1');
  ctx.trace.step({
    id,
    label: `${label} : volume commandé et matériaux`,
    formula: 'V_c = V \\times (1 + p) ; C = d_c V_c ; S = d_s V_c ; G = d_g V_c ; E = d_e V_c',
    substitutions: [
      { symbol: 'V', value: netVolume, unit: 'm3' },
      { symbol: 'p', value: waste },
      { symbol: 'd_c', value: cement, unit: 'kg/m3' },
    ],
    value: ordered,
    unit: 'm3',
    source: 'Référentiel « Usages courants — métré » (dosages, pertes)',
  });
  return add(total, {
    cement: cement * ordered,
    sand: sand * ordered,
    gravel: gravel * ordered,
    water: water * ordered * 1000,
  });
}

/** Matériaux d'un mortier (pas de gravier). */
export function mortarMaterials(
  ctx: CalcContext,
  id: string,
  label: string,
  mix: MortarMix,
  netVolume: number,
  total: Materials = noMaterials(),
): { materials: Materials; ordered: number } {
  if (netVolume <= 0) return { materials: total, ordered: 0 };
  const waste = ctx.params.scalar('btp.waste.mortar', '1');
  const ordered = netVolume * (1 + waste);
  const cement = tableValue(ctx, 'btp.mortar.cement', { mortar: mix }, 'kg/m3');
  const sand = tableValue(ctx, 'btp.mortar.sand', { mortar: mix }, '1');
  const water = tableValue(ctx, 'btp.mortar.water', { mortar: mix }, '1');
  ctx.trace.step({
    id,
    label: `${label} : volume commandé et matériaux`,
    formula: 'V_c = V \\times (1 + p) ; C = d_c V_c ; S = d_s V_c ; E = d_e V_c',
    substitutions: [
      { symbol: 'V', value: netVolume, unit: 'm3' },
      { symbol: 'p', value: waste },
      { symbol: 'd_c', value: cement, unit: 'kg/m3' },
    ],
    value: ordered,
    unit: 'm3',
    source: 'Référentiel « Usages courants — métré » (dosages, pertes)',
  });
  return {
    ordered,
    materials: add(total, {
      cement: cement * ordered,
      sand: sand * ordered,
      gravel: 0,
      water: water * ordered * 1000,
    }),
  };
}

/** Sacs de ciment (valeur exacte : l'arrondi à la commande relève de l'utilisateur). */
export function cementBags(ctx: CalcContext, cementKg: number): number {
  return cementKg / ctx.params.scalar('btp.cement.bag_mass', 'kg');
}

interface ScheduleLine {
  readonly diameter: Measured<'length'>;
  readonly length: Measured<'length'>;
  readonly count: number;
}

/**
 * Aciers : par ratio (kg/m³ de béton, selon l'élément) ou par nomenclature saisie
 * (masse linéique πd²/4 × ρ). Renvoie la masse nette et la masse commandée (pertes).
 */
export function steel(
  ctx: CalcContext,
  id: string,
  input: {
    readonly steelMode?: 'RATIO' | 'SCHEDULE' | undefined;
    readonly schedule?: readonly ScheduleLine[] | undefined;
  },
  element: SteelElement,
  concreteVolume: number,
): { net: number; ordered: number } {
  const mode = input.steelMode ?? 'RATIO';
  if (input.steelMode === undefined) {
    ctx.assume.defaulted(
      'steelMode',
      'RATIO',
      'Aciers estimés par le ratio du référentiel d’usages (aucune nomenclature fournie).',
    );
  }
  let net: number;
  if (mode === 'RATIO') {
    const ratio = tableValue(ctx, 'btp.steel.ratio', { element }, 'kg/m3');
    net = ratio * concreteVolume;
    ctx.trace.step({
      id,
      label: 'Aciers par ratio',
      formula: 'A = r \\times V',
      substitutions: [
        { symbol: 'r', value: ratio, unit: 'kg/m3' },
        { symbol: 'V', value: concreteVolume, unit: 'm3' },
      ],
      value: net,
      unit: 'kg',
      source: 'Référentiel « Usages courants — métré » (btp.steel.ratio)',
    });
  } else {
    const density = ctx.params.scalar('btp.steel.density', 'kg/m3');
    net = (input.schedule ?? []).reduce(
      (sum, bar) =>
        sum + ((Math.PI * bar.diameter.si ** 2) / 4) * density * bar.length.si * bar.count,
      0,
    );
    ctx.trace.step({
      id,
      label: 'Aciers par nomenclature',
      formula: 'A = \\sum n_i \\, \\ell_i \\, \\frac{\\pi d_i^2}{4} \\, \\rho',
      substitutions: [{ symbol: '\\rho', value: density, unit: 'kg/m3' }],
      value: net,
      unit: 'kg',
    });
  }
  const waste = ctx.params.scalar('btp.waste.steel', '1');
  return { net, ordered: net * (1 + waste) };
}
