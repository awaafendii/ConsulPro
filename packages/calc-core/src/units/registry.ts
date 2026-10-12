import { err, ok, type Result } from '../result/result';

/**
 * Grandeurs physiques. Une conversion n'est possible qu'entre unités de même grandeur.
 * Les formules ne font pas d'algèbre d'unités : elles manipulent des nombres en SI
 * nommés avec leur unité (`lengthM`, `sectionMm2`…).
 */
export type UnitKind =
  | 'dimensionless'
  | 'length'
  | 'area'
  | 'volume'
  | 'mass'
  | 'time'
  | 'current'
  | 'voltage'
  | 'power'
  | 'apparentPower'
  | 'reactivePower'
  | 'energy'
  | 'pressure'
  | 'flowRate'
  | 'velocity'
  | 'angle'
  | 'temperature'
  | 'resistance'
  | 'resistivity'
  | 'linearReactance'
  | 'density'
  | 'force'
  /** Rendement surfacique (peinture : m² couverts par litre). */
  | 'spreadRate'
  /** Masse surfacique (consommation de colle : kg/m²). */
  | 'surfaceDensity'
  /** Masse linéique (aciers : kg/m). */
  | 'linearDensity';

export interface UnitDefinition {
  /** Identifiant ASCII stable, utilisé dans les données (ex. `mm2`). */
  readonly symbol: string;
  /** Symbole d'affichage (ex. `mm²`). */
  readonly display: string;
  readonly kind: UnitKind;
  /** valeurSI = valeur × factor + offset */
  readonly factor: number;
  readonly offset: number;
}

function unit(symbol: string, display: string, kind: UnitKind, factor: number, offset = 0) {
  return { symbol, display, kind, factor, offset } as const;
}

/**
 * Registre des unités. L'unité SI de chaque grandeur a `factor = 1` et `offset = 0`.
 */
export const UNITS = {
  '1': unit('1', '', 'dimensionless', 1),
  '%': unit('%', '%', 'dimensionless', 0.01),

  m: unit('m', 'm', 'length', 1),
  cm: unit('cm', 'cm', 'length', 1e-2),
  mm: unit('mm', 'mm', 'length', 1e-3),
  km: unit('km', 'km', 'length', 1e3),

  m2: unit('m2', 'm²', 'area', 1),
  cm2: unit('cm2', 'cm²', 'area', 1e-4),
  mm2: unit('mm2', 'mm²', 'area', 1e-6),
  ha: unit('ha', 'ha', 'area', 1e4),

  m3: unit('m3', 'm³', 'volume', 1),
  dm3: unit('dm3', 'dm³', 'volume', 1e-3),
  L: unit('L', 'L', 'volume', 1e-3),

  kg: unit('kg', 'kg', 'mass', 1),
  g: unit('g', 'g', 'mass', 1e-3),
  t: unit('t', 't', 'mass', 1e3),

  s: unit('s', 's', 'time', 1),
  min: unit('min', 'min', 'time', 60),
  h: unit('h', 'h', 'time', 3600),
  d: unit('d', 'j', 'time', 86400),

  A: unit('A', 'A', 'current', 1),
  mA: unit('mA', 'mA', 'current', 1e-3),
  kA: unit('kA', 'kA', 'current', 1e3),

  V: unit('V', 'V', 'voltage', 1),
  kV: unit('kV', 'kV', 'voltage', 1e3),

  W: unit('W', 'W', 'power', 1),
  kW: unit('kW', 'kW', 'power', 1e3),
  MW: unit('MW', 'MW', 'power', 1e6),

  VA: unit('VA', 'VA', 'apparentPower', 1),
  kVA: unit('kVA', 'kVA', 'apparentPower', 1e3),
  MVA: unit('MVA', 'MVA', 'apparentPower', 1e6),

  var: unit('var', 'var', 'reactivePower', 1),
  kvar: unit('kvar', 'kvar', 'reactivePower', 1e3),

  J: unit('J', 'J', 'energy', 1),
  Wh: unit('Wh', 'Wh', 'energy', 3600),
  kWh: unit('kWh', 'kWh', 'energy', 3.6e6),

  Pa: unit('Pa', 'Pa', 'pressure', 1),
  kPa: unit('kPa', 'kPa', 'pressure', 1e3),
  MPa: unit('MPa', 'MPa', 'pressure', 1e6),
  bar: unit('bar', 'bar', 'pressure', 1e5),
  // Mètre de colonne d'eau conventionnel : ρ = 1000 kg/m³, g = 9,80665 m/s².
  mCE: unit('mCE', 'mCE', 'pressure', 9806.65),

  'm3/s': unit('m3/s', 'm³/s', 'flowRate', 1),
  'm3/h': unit('m3/h', 'm³/h', 'flowRate', 1 / 3600),
  'L/s': unit('L/s', 'L/s', 'flowRate', 1e-3),
  'L/min': unit('L/min', 'L/min', 'flowRate', 1e-3 / 60),
  'L/h': unit('L/h', 'L/h', 'flowRate', 1e-3 / 3600),

  'm/s': unit('m/s', 'm/s', 'velocity', 1),
  'km/h': unit('km/h', 'km/h', 'velocity', 1 / 3.6),

  rad: unit('rad', 'rad', 'angle', 1),
  deg: unit('deg', '°', 'angle', Math.PI / 180),
  gon: unit('gon', 'gon', 'angle', Math.PI / 200),

  K: unit('K', 'K', 'temperature', 1),
  degC: unit('degC', '°C', 'temperature', 1, 273.15),

  ohm: unit('ohm', 'Ω', 'resistance', 1),
  mohm: unit('mohm', 'mΩ', 'resistance', 1e-3),

  'ohm.m': unit('ohm.m', 'Ω·m', 'resistivity', 1),
  'ohm.mm2/m': unit('ohm.mm2/m', 'Ω·mm²/m', 'resistivity', 1e-6),

  'ohm/m': unit('ohm/m', 'Ω/m', 'linearReactance', 1),
  'mohm/m': unit('mohm/m', 'mΩ/m', 'linearReactance', 1e-3),

  'kg/m3': unit('kg/m3', 'kg/m³', 'density', 1),
  't/m3': unit('t/m3', 't/m³', 'density', 1e3),

  N: unit('N', 'N', 'force', 1),
  kN: unit('kN', 'kN', 'force', 1e3),

  // SI : m²/m³ (= 1/m) pour le rendement ; m²/L = 1000 m²/m³.
  'm2/m3': unit('m2/m3', 'm²/m³', 'spreadRate', 1),
  'm2/L': unit('m2/L', 'm²/L', 'spreadRate', 1e3),

  'kg/m2': unit('kg/m2', 'kg/m²', 'surfaceDensity', 1),

  'kg/m': unit('kg/m', 'kg/m', 'linearDensity', 1),
} as const satisfies Record<string, UnitDefinition>;

export type UnitSymbol = keyof typeof UNITS;

export type UnitOfKind<K extends UnitKind> = {
  [S in UnitSymbol]: (typeof UNITS)[S]['kind'] extends K ? S : never;
}[UnitSymbol];

export interface UnitError {
  readonly code: 'UNIT_UNKNOWN' | 'UNIT_INCOMPATIBLE';
  readonly message: string;
}

export function isUnitSymbol(symbol: string): symbol is UnitSymbol {
  return Object.hasOwn(UNITS, symbol);
}

export function findUnit(symbol: string): UnitDefinition | undefined {
  return isUnitSymbol(symbol) ? UNITS[symbol] : undefined;
}

export function unitsOfKind(kind: UnitKind): readonly UnitDefinition[] {
  return Object.values(UNITS).filter((u) => u.kind === kind);
}

export function toSI(value: number, symbol: UnitSymbol): number {
  const u = UNITS[symbol];
  return value * u.factor + u.offset;
}

export function fromSI(si: number, symbol: UnitSymbol): number {
  const u = UNITS[symbol];
  return (si - u.offset) / u.factor;
}

export function convert(value: number, from: string, to: string): Result<number, UnitError> {
  const source = findUnit(from);
  const target = findUnit(to);
  if (!source || !target) {
    return err({ code: 'UNIT_UNKNOWN', message: `Unité inconnue : ${source ? to : from}` });
  }
  if (source.kind !== target.kind) {
    return err({
      code: 'UNIT_INCOMPATIBLE',
      message: `Conversion impossible de ${source.display || source.symbol} (${source.kind}) vers ${target.display || target.symbol} (${target.kind})`,
    });
  }
  const si = value * source.factor + source.offset;
  return ok((si - target.offset) / target.factor);
}
