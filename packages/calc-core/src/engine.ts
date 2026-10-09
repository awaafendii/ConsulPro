import type { z } from 'zod';

import type { ParameterRequirement } from './params/parameter';
import type { ParameterReader } from './params/resolved-parameter-set';
import type { CalcFailure, Check } from './result/calculation-result';
import type { Result } from './result/result';
import type { HypothesisRecorder, TraceRecorder, WarningRecorder } from './trace/recorders';
import type { UnitSymbol } from './units/registry';

export type Discipline = 'BTP' | 'ELEC' | 'PLUMBING' | 'TOPO';

/** Documentation d'une formule (affichée dans la bibliothèque et les rapports). */
export interface FormulaDoc {
  readonly id: string;
  readonly label: string;
  readonly latex: string;
  readonly symbols: readonly {
    readonly symbol: string;
    readonly meaning: string;
    readonly unit?: UnitSymbol;
  }[];
  readonly source: string;
}

export interface CalcContext {
  readonly params: ParameterReader;
  readonly trace: TraceRecorder;
  readonly assume: HypothesisRecorder;
  readonly warn: WarningRecorder;
}

export interface VerifyContext {
  readonly params: ParameterReader;
}

/**
 * Contrat d'un moteur de calcul. Fonctions pures uniquement (principe P2) :
 * pas d'horloge, d'aléa, d'entrée-sortie ni d'état global.
 */
export interface EngineDefinition<I, O> {
  /** `<discipline>.<calcul>`, ex. `elec.voltage-drop`. */
  readonly id: string;
  /** Semver. Majeure : une sortie change pour les mêmes entrées. */
  readonly version: string;
  readonly discipline: Discipline;
  readonly title: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly parameters: readonly ParameterRequirement[];
  readonly formulas: readonly FormulaDoc[];
  /** Hypothèses de méthode toujours applicables. */
  readonly hypotheses: readonly { readonly code: string; readonly text: string }[];
  calculate(input: I, ctx: CalcContext): Result<O, CalcFailure>;
  verify(input: I, output: O, ctx: VerifyContext): readonly Check[];
}

export const ENGINE_ID_PATTERN = /^[a-z]+(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
