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

/** Champ d'une ligne de liste (ouverture, barre d'acier…) : grandeur ou entier. */
export type ListFieldPresentation =
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'quantity';
      readonly unitKind: UnitKind;
      readonly units: readonly UnitSymbol[];
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'integer';
      readonly min: number;
    };

/**
 * Présentation d'une entrée : construit le formulaire de saisie (aucun calcul dans l'interface).
 * Une grandeur se saisit `{ value, unit }` dans l'une des unités proposées ; un entier, comme
 * un nombre ; une liste, comme un tableau de lignes.
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
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'integer';
      readonly min: number;
      readonly optional?: boolean;
      readonly help?: string;
    }
  | {
      readonly key: string;
      readonly label: string;
      readonly kind: 'list';
      readonly fields: readonly ListFieldPresentation[];
      readonly maxItems: number;
      readonly optional?: boolean;
      readonly help?: string;
    }
  | {
      /**
       * Jeu de données du projet (ex. `ELEC_BOARD_TREE`) : l'application remplace la référence
       * par les lignes de sa révision courante et trace la révision lue dans le calcul.
       */
      readonly key: string;
      readonly label: string;
      readonly kind: 'dataset';
      readonly datasetKind: string;
      readonly optional?: boolean;
      readonly help?: string;
    };

/**
 * Famille d'une sortie dans le quantitatif : un ouvrage (ligne de DQE) ou un matériau
 * (décomposition). Sans famille, la sortie n'alimente pas le quantitatif.
 */
export type QuantityFamily =
  | 'EARTHWORKS'
  | 'CONCRETE'
  | 'FORMWORK'
  | 'STEEL'
  | 'MASONRY'
  | 'RENDER'
  | 'FINISHES'
  | 'PAINTING'
  | 'MATERIAL';

/**
 * Présentation d'une sortie : la valeur est exprimée dans l'unité `unit` (SI ou unité d'usage,
 * ex. litres d'eau) et affichée avec `precision` décimales, sans arrondi de la valeur stockée.
 */
export interface OutputPresentation {
  readonly key: string;
  readonly label: string;
  readonly unit: UnitSymbol;
  readonly precision: number;
  readonly family?: QuantityFamily;
  /**
   * Matériau générique (ciment, sable, aciers…) : la décomposition d'un quantitatif cumule
   * ses quantités entre calculs. Absent : matériau propre à une référence (format de
   * carreau, hauteur d'entrevous…), présenté calcul par calcul, jamais additionné.
   */
  readonly additive?: boolean;
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
  /**
   * Cas de référence du moteur (06-strategie-de-tests.md §3) : tant que tous ne sont pas
   * contre-vérifiés par un ingénieur du métier, le moteur est affiché « non vérifié ».
   */
  readonly referenceCases?: { readonly total: number; readonly checked: number };
  calculate(input: I, ctx: CalcContext): Result<O, CalcFailure>;
  verify(input: I, output: O, ctx: VerifyContext): readonly Check[];
}

export const ENGINE_ID_PATTERN = /^[a-z]+(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
