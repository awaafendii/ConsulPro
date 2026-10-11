import type { UnitKind, UnitSymbol } from '../units/registry';

export type VerificationStatus = 'VERIFIED' | 'TO_VERIFY';

/** Origine documentaire d'un paramètre (principe P10 : aucune valeur sans source). */
export interface ParameterSource {
  readonly document: string;
  readonly clause?: string | undefined;
  readonly table?: string | undefined;
  readonly note?: string | undefined;
}

export interface CategoryAxis {
  readonly name: string;
  readonly kind: 'CATEGORY';
  readonly values: readonly string[];
}

/**
 * Axe numérique d'une table. Règle de lecture explicite, jamais implicite :
 * - EXACT : la coordonnée doit correspondre à une valeur de l'axe ;
 * - NEXT_UPPER / NEXT_LOWER : valeur de l'axe immédiatement supérieure / inférieure ;
 * - LINEAR : interpolation linéaire, sans extrapolation.
 */
export interface NumericAxis {
  readonly name: string;
  readonly kind: 'NUMERIC';
  readonly unit: UnitSymbol;
  readonly values: readonly number[];
  readonly lookup: 'EXACT' | 'NEXT_UPPER' | 'NEXT_LOWER' | 'LINEAR';
}

export type TableAxis = CategoryAxis | NumericAxis;

export interface TableValue {
  readonly axes: readonly TableAxis[];
  /** Unité des cellules. */
  readonly unit: UnitSymbol;
  /** Cellules en ordre « ligne majeure » (dernier axe le plus rapide). `null` = non défini par la source. */
  readonly cells: readonly (number | null)[];
}

export type ParameterValue =
  | { readonly kind: 'SCALAR'; readonly value: number; readonly unit: UnitSymbol }
  | { readonly kind: 'ENUM'; readonly value: string; readonly allowed: readonly string[] }
  | { readonly kind: 'TABLE'; readonly table: TableValue };

export type ParameterKind = ParameterValue['kind'];

/** Paramètre résolu (référentiel + éventuelles surcharges), tel que fourni au moteur. */
export type ResolvedParameter = ParameterValue & {
  readonly key: string;
  readonly source: ParameterSource;
  readonly verification: VerificationStatus;
  /** Présent si une surcharge (organisation ou projet) remplace la valeur du référentiel. */
  readonly override?: {
    readonly referenceValue: ParameterValue;
    readonly justification: string;
    readonly scope: 'ORGANIZATION' | 'PROJECT';
  };
};

/** Paramètre attendu par un moteur. */
export interface ParameterRequirement {
  readonly key: string;
  readonly kind: ParameterKind;
  /** Grandeur attendue (SCALAR : valeur ; TABLE : cellules). */
  readonly unitKind?: UnitKind;
  readonly optional?: boolean;
  readonly description: string;
}

export interface StandardRef {
  readonly standardVersionId: string;
  readonly code: string;
  readonly version: string;
}
