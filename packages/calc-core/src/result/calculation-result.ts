import type {
  ParameterValue,
  ParameterSource,
  StandardRef,
  VerificationStatus,
} from '../params/parameter';
import type { UnitSymbol } from '../units/registry';

/**
 * Statut global d'un calcul, par ordre de priorité :
 * INVALID > ERROR > NON_COMPLIANT > OK_WITH_WARNINGS > OK.
 */
export type ResultStatus = 'OK' | 'OK_WITH_WARNINGS' | 'NON_COMPLIANT' | 'INVALID' | 'ERROR';

export interface FieldError {
  /** Chemin pointé (`length.value`, `parameters.elec.x`). */
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface Hypothesis {
  readonly code: string;
  readonly text: string;
  /** ENGINE : hypothèse de méthode ; DEFAULT_VALUE : valeur appliquée faute de saisie. */
  readonly origin: 'ENGINE' | 'DEFAULT_VALUE';
  readonly field?: string;
  readonly value?: unknown;
}

export type WarningOrigin = 'ENGINE' | 'PARAMETER_TO_VERIFY' | 'PARAMETER_OVERRIDDEN';

export interface Warning {
  readonly code: string;
  readonly severity: 'INFO' | 'WARNING';
  readonly text: string;
  readonly origin: WarningOrigin;
  readonly parameterKey?: string;
}

export type CheckStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
export type CheckSeverity = 'BLOCKING' | 'WARNING' | 'INFO';
export type Comparison = '<=' | '<' | '>=' | '>';

export interface Check {
  /** Code de la règle du référentiel (`Rule.code`). */
  readonly rule: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly severity: CheckSeverity;
  readonly measured?: number;
  readonly limit?: number;
  readonly comparison?: Comparison;
  readonly unit?: UnitSymbol;
  readonly clause?: string;
  readonly note?: string;
}

export interface TraceSubstitution {
  readonly symbol: string;
  readonly value: number | string;
  readonly unit?: UnitSymbol;
}

export interface TraceStep {
  readonly id: string;
  readonly label: string;
  /** Formule en LaTeX. */
  readonly formula?: string;
  readonly substitutions?: readonly TraceSubstitution[];
  readonly value?: number | string;
  readonly unit?: UnitSymbol;
  readonly source?: string;
  readonly note?: string;
}

export interface ParameterSnapshotEntry {
  readonly key: string;
  readonly value: ParameterValue;
  readonly source: ParameterSource;
  readonly verification: VerificationStatus;
  readonly used: boolean;
  readonly override?: {
    readonly referenceValue: ParameterValue;
    readonly justification: string;
    readonly scope: 'ORGANIZATION' | 'PROJECT';
  };
}

export interface CalcFailure {
  readonly code: string;
  readonly message: string;
}

export interface CalculationResult<O> {
  readonly engine: { readonly id: string; readonly version: string };
  readonly standards: readonly StandardRef[];
  readonly status: ResultStatus;
  /** Entrées telles que reçues (conservées même si refusées). */
  readonly rawInputs: unknown;
  /** Entrées validées et normalisées (SI), `null` si refusées. */
  readonly inputs: unknown;
  /** Paramètres déclarés par le moteur et présents, triés par clé. */
  readonly parameters: readonly ParameterSnapshotEntry[];
  readonly hypotheses: readonly Hypothesis[];
  /** `null` si INVALID ou ERROR : aucune valeur n'est présentée comme un résultat. */
  readonly outputs: O | null;
  readonly checks: readonly Check[];
  readonly warnings: readonly Warning[];
  readonly trace: readonly TraceStep[];
  readonly errors: readonly FieldError[];
  readonly failure: CalcFailure | null;
}
