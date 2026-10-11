import type { z } from 'zod';

import type { ParameterRequirement } from './params/parameter';
import type { ParameterReader } from './params/resolved-parameter-set';
import type { CalcFailure, Check } from './result/calculation-result';
import type { Result } from './result/result';
import type { HypothesisRecorder, TraceRecorder, WarningRecorder } from './trace/recorders';
import type { UnitKind, UnitSymbol } from './units/registry';

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

/**
 * Présentation d'une entrée : construit le formulaire de saisie (aucun calcul dans l'interface).
 * Une grandeur se saisit `{ value, unit }` dans l'une des unités proposées.
 */
export type InputPresentation =
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'quantity';
      readonly unitKind: UnitKind;
      /** Unités proposées à la saisie ; la première est l'unité par défaut. */
      readonly units: readonly UnitSymbol[];
      readonly optional?: boolean;
      readonly help?: string;
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'enum';
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly optional?: boolean;
      readonly help?: string;
    };

/** Présentation d'une sortie : la valeur stockée est en SI (`unit`), affichée avec `precision` décimales. */
export interface OutputPresentation {
  readonly key: string;
  readonly label: string;
  readonly unit: UnitSymbol;
  readonly precision: number;
}

export interface EnginePresentation {
  readonly description: string;
  readonly inputs: readonly InputPresentation[];
  readonly outputs: readonly OutputPresentation[];
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
  /** Libellés et précisions d'affichage (le serveur construit la vue du résultat). */
  readonly presentation: EnginePresentation;
  calculate(input: I, ctx: CalcContext): Result<O, CalcFailure>;
  verify(input: I, output: O, ctx: VerifyContext): readonly Check[];
}

export const ENGINE_ID_PATTERN = /^[a-z]+(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
