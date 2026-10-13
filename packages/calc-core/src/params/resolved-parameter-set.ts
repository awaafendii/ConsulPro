import { err, ok, type Result } from '../result/result';
import { findUnit, fromSI, toSI, UNITS, type UnitSymbol } from '../units/registry';
import type { ParameterRequirement, ResolvedParameter, StandardRef } from './parameter';
import {
  readTable,
  validateTable,
  type TableCoordinates,
  type TableError,
  type TableReading,
} from './table';

export interface ParameterError {
  readonly key: string;
  readonly code:
    | 'PARAMETER_DUPLICATE'
    | 'PARAMETER_INVALID'
    | 'PARAMETER_MISSING'
    | 'PARAMETER_KIND_MISMATCH'
    | 'PARAMETER_UNIT_INCOMPATIBLE';
  readonly message: string;
}

/**
 * Erreur de programmation : un moteur lit un paramètre qu'il n'a pas déclaré,
 * ou avec une unité incompatible. Elle produit un résultat `ERROR`, jamais une valeur.
 */
export class ParameterAccessError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = 'ParameterAccessError';
  }
}

/**
 * Ensemble figé de paramètres résolus fourni à un calcul.
 * Construit par l'application (référentiel + surcharges), jamais par l'UI.
 */
export class ResolvedParameterSet {
  private constructor(
    private readonly byKey: ReadonlyMap<string, ResolvedParameter>,
    readonly standards: readonly StandardRef[],
  ) {}

  static create(
    parameters: readonly ResolvedParameter[],
    standards: readonly StandardRef[] = [],
  ): Result<ResolvedParameterSet, readonly ParameterError[]> {
    const errors: ParameterError[] = [];
    const byKey = new Map<string, ResolvedParameter>();
    for (const parameter of parameters) {
      if (byKey.has(parameter.key)) {
        errors.push({
          key: parameter.key,
          code: 'PARAMETER_DUPLICATE',
          message: 'Paramètre fourni deux fois.',
        });
        continue;
      }
      const invalid = invalidity(parameter);
      if (invalid) {
        errors.push({ key: parameter.key, code: 'PARAMETER_INVALID', message: invalid });
        continue;
      }
      byKey.set(parameter.key, parameter);
    }
    if (errors.length > 0) return err(errors);
    return ok(new ResolvedParameterSet(byKey, standards));
  }

  get(key: string): ResolvedParameter | undefined {
    return this.byKey.get(key);
  }

  /** Vérifie que les paramètres exigés sont présents, du bon type et de la bonne grandeur. */
  checkRequirements(requirements: readonly ParameterRequirement[]): readonly ParameterError[] {
    const errors: ParameterError[] = [];
    for (const requirement of requirements) {
      const parameter = this.byKey.get(requirement.key);
      if (!parameter) {
        if (!requirement.optional) {
          errors.push({
            key: requirement.key,
            code: 'PARAMETER_MISSING',
            message: `Paramètre requis absent du référentiel : ${requirement.description}`,
          });
        }
        continue;
      }
      if (parameter.kind !== requirement.kind) {
        errors.push({
          key: requirement.key,
          code: 'PARAMETER_KIND_MISMATCH',
          message: `Type ${parameter.kind} fourni, ${requirement.kind} attendu.`,
        });
        continue;
      }
      if (requirement.unitKind) {
        const unit =
          parameter.kind === 'SCALAR'
            ? parameter.unit
            : parameter.kind === 'TABLE'
              ? parameter.table.unit
              : undefined;
        const unitKind = unit ? findUnit(unit)?.kind : undefined;
        if (unitKind !== requirement.unitKind) {
          errors.push({
            key: requirement.key,
            code: 'PARAMETER_UNIT_INCOMPATIBLE',
            message: `Grandeur ${unitKind ?? 'absente'} fournie, ${requirement.unitKind} attendue.`,
          });
        }
      }
    }
    return errors;
  }

  /** Vue restreinte aux paramètres déclarés par un moteur, qui enregistre les lectures. */
  scopedTo(requirements: readonly ParameterRequirement[]): ParameterReader {
    return new ParameterReader(this, new Set(requirements.map((r) => r.key)));
  }
}

export class ParameterReader {
  private readonly used = new Set<string>();

  constructor(
    private readonly set: ResolvedParameterSet,
    private readonly declared: ReadonlySet<string>,
  ) {}

  /** Valeur scalaire convertie dans l'unité demandée. */
  scalar(key: string, unit: UnitSymbol): number {
    const parameter = this.access(key);
    if (parameter.kind !== 'SCALAR')
      throw new ParameterAccessError(key, `${key} n'est pas un scalaire.`);
    if (UNITS[parameter.unit].kind !== UNITS[unit].kind) {
      throw new ParameterAccessError(key, `${key} ne peut pas être lu en ${unit}.`);
    }
    // Même unité : valeur telle quelle (aucun aller-retour flottant par le SI).
    return parameter.unit === unit
      ? parameter.value
      : fromSI(toSI(parameter.value, parameter.unit), unit);
  }

  enumValue(key: string): string {
    const parameter = this.access(key);
    if (parameter.kind !== 'ENUM')
      throw new ParameterAccessError(key, `${key} n'est pas une énumération.`);
    return parameter.value;
  }

  table(key: string, coordinates: TableCoordinates): Result<TableReading, TableError> {
    const parameter = this.access(key);
    if (parameter.kind !== 'TABLE')
      throw new ParameterAccessError(key, `${key} n'est pas une table.`);
    return readTable(parameter.table, coordinates);
  }

  /**
   * Valeurs d'un axe numérique d'une table, converties dans l'unité demandée : pour choisir
   * parmi les valeurs normalisées (la plus petite section qui convient, par exemple).
   */
  axisValues(key: string, axis: string, unit: UnitSymbol): readonly number[] {
    const parameter = this.access(key);
    if (parameter.kind !== 'TABLE')
      throw new ParameterAccessError(key, `${key} n'est pas une table.`);
    const found = parameter.table.axes.find((a) => a.name === axis);
    if (found?.kind !== 'NUMERIC') {
      throw new ParameterAccessError(key, `${key} n'a pas d'axe numérique « ${axis} ».`);
    }
    if (UNITS[found.unit].kind !== UNITS[unit].kind) {
      throw new ParameterAccessError(
        key,
        `L'axe ${axis} de ${key} ne peut pas être lu en ${unit}.`,
      );
    }
    return found.unit === unit
      ? [...found.values]
      : found.values.map((v) => fromSI(toSI(v, found.unit), unit));
  }

  has(key: string): boolean {
    return this.declared.has(key) && this.set.get(key) !== undefined;
  }

  usedKeys(): readonly string[] {
    return [...this.used].sort();
  }

  private access(key: string): ResolvedParameter {
    if (!this.declared.has(key)) {
      throw new ParameterAccessError(key, `Le moteur lit le paramètre non déclaré « ${key} ».`);
    }
    const parameter = this.set.get(key);
    if (!parameter) {
      throw new ParameterAccessError(
        key,
        `Paramètre optionnel « ${key} » absent : tester has() avant lecture.`,
      );
    }
    this.used.add(key);
    return parameter;
  }
}

function invalidity(parameter: ResolvedParameter): string | null {
  if (parameter.source.document.trim() === '')
    return 'Source documentaire obligatoire (principe P10).';
  switch (parameter.kind) {
    case 'SCALAR':
      if (!Number.isFinite(parameter.value)) return 'Valeur non finie.';
      if (!findUnit(parameter.unit)) return `Unité inconnue : ${parameter.unit}`;
      return null;
    case 'ENUM':
      return parameter.allowed.includes(parameter.value)
        ? null
        : `Valeur « ${parameter.value} » hors des valeurs admises.`;
    case 'TABLE': {
      const validated = validateTable(parameter.table);
      return validated.ok ? null : validated.error.message;
    }
  }
}
