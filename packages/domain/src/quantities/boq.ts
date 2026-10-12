import { err, ok, type OutputPresentation, type Result } from '@consulpro/calc-core';

import type { ResultStatus } from '../calculation/workflow';
import type { DomainError } from '../errors';
import { currencyDecimals, type Currency } from './currency';
import {
  decimalFromNumber,
  isStorableDecimal,
  multiplyDecimal,
  parseDecimal,
  type Decimal,
} from './decimal';
import { ancestorsOf, type TreeNode } from './takeoff';

/*
 * Quantitatif (DQE) : lignes issues des calculs rattachés à l'avant-métré, liées à la
 * révision qui les a produites, et lignes saisies. Règles explicites :
 *  - une sortie de moteur alimente le DQE si elle a une famille d'ouvrage (pas MATERIAL) et
 *    une valeur strictement positive ; sa quantité est arrondie à la précision du moteur ;
 *  - une quantité retenue différente de la quantité calculée exige une justification et
 *    reste affichée à côté de la quantité calculée (principe P4) ;
 *  - montant d'une ligne = quantité retenue × prix unitaire, arrondi au pair le plus proche
 *    à l'unité monétaire de la devise ; sous-totaux et total = somme des montants de ligne ;
 *  - un quantitatif sans aucun prix reste complet : il n'affiche simplement pas de montant.
 */

/** Unités d'un DQE (affichage : m³, m², ml, kg, t, L, u, ff, ens). */
export const BOQ_UNITS = ['m3', 'm2', 'm', 'kg', 't', 'L', 'u', 'ff', 'ens'] as const;
export type BoqUnit = (typeof BOQ_UNITS)[number];

export const isBoqUnit = (value: string): value is BoqUnit =>
  (BOQ_UNITS as readonly string[]).includes(value);

/** Unités de DQE réservées à la saisie (aucune sortie de moteur ne s'exprime ainsi). */
const ENTRY_ONLY_UNITS: readonly string[] = ['u', 'ff', 'ens'];

/** Unité de DQE d'une sortie de moteur (`1` : unité de compte) ; null si non reprise. */
export function boqUnitOf(outputUnit: string): BoqUnit | null {
  if (outputUnit === '1') return 'u';
  return isBoqUnit(outputUnit) && !ENTRY_ONLY_UNITS.includes(outputUnit) ? outputUnit : null;
}

/** Lignes d'un quantitatif, au plus. */
export const BOQ_MAX_ITEMS = 2000;
/** Statuts de résultat dont les quantités entrent au quantitatif. */
const QUANTIFIABLE: readonly ResultStatus[] = ['OK', 'OK_WITH_WARNINGS', 'NON_COMPLIANT'];

/** Calcul rattaché à un nœud de l'avant-métré, avec sa révision courante. */
export interface TakeoffSource {
  readonly calculationId: string;
  readonly calculationTitle: string;
  readonly engineId: string;
  readonly nodeId: string;
  readonly revision: {
    readonly id: string;
    readonly resultStatus: ResultStatus;
    readonly outputs: Readonly<Record<string, unknown>> | null;
    readonly outputPresentations: readonly OutputPresentation[];
  } | null;
}

/** Ligne de DQE produite par une sortie de calcul. */
export interface ComputedLine {
  readonly nodeId: string;
  readonly calculationId: string;
  readonly outputKey: string;
  readonly sourceRevisionId: string;
  /** Ouvrage (`<moteur>.<sortie>`) : clé de correspondance avec les bibliothèques de prix. */
  readonly workKey: string;
  readonly designation: string;
  readonly unit: BoqUnit;
  readonly quantity: Decimal;
}

const DESIGNATION_MAX = 300;

/** Désignation d'une ligne calculée : « <intitulé du calcul> — <libellé de la sortie> ». */
export const computedDesignation = (calculationTitle: string, outputLabel: string): string =>
  `${calculationTitle} — ${outputLabel}`.slice(0, DESIGNATION_MAX);

/** Ouvrage d'une sortie de moteur, clé des bibliothèques de prix. */
export const workKeyOf = (engineId: string, outputKey: string): string =>
  `${engineId}.${outputKey}`;

/** Lignes attendues au DQE d'après l'avant-métré et les révisions courantes. */
export function computedLines(sources: readonly TakeoffSource[]): ComputedLine[] {
  const lines: ComputedLine[] = [];
  for (const source of sources) {
    const revision = source.revision;
    if (!revision?.outputs || !QUANTIFIABLE.includes(revision.resultStatus)) continue;
    for (const output of revision.outputPresentations) {
      if (output.family === undefined || output.family === 'MATERIAL') continue;
      const unit = boqUnitOf(output.unit);
      const value = revision.outputs[output.key];
      if (unit === null || typeof value !== 'number') continue;
      const quantity = decimalFromNumber(value, output.precision);
      if (quantity === null || quantity === 0n) continue;
      lines.push({
        nodeId: source.nodeId,
        calculationId: source.calculationId,
        outputKey: output.key,
        sourceRevisionId: revision.id,
        workKey: workKeyOf(source.engineId, output.key),
        designation: computedDesignation(source.calculationTitle, output.label),
        unit,
        quantity,
      });
    }
  }
  return lines;
}

/** Ligne calculée déjà présente au quantitatif. */
export interface ExistingComputedItem extends ComputedLine {
  readonly id: string;
}

export interface SyncPlan {
  readonly add: readonly ComputedLine[];
  readonly update: readonly { readonly id: string; readonly line: ComputedLine }[];
  readonly remove: readonly string[];
  readonly unchanged: number;
}

/** Identité d'une ligne calculée : (calcul, sortie). Ni un UUID ni une clé ne contient « | ». */
const lineKey = (line: { calculationId: string; outputKey: string }) =>
  `${line.calculationId}|${line.outputKey}`;

const sameLine = (a: ComputedLine, b: ComputedLine) =>
  a.nodeId === b.nodeId &&
  a.sourceRevisionId === b.sourceRevisionId &&
  a.workKey === b.workKey &&
  a.designation === b.designation &&
  a.unit === b.unit &&
  a.quantity === b.quantity;

/**
 * Mise à jour d'un quantitatif depuis l'avant-métré : une ligne calculée est identifiée par
 * (calcul, sortie). Ajout des nouvelles, mise à jour des modifiées (quantité, révision, nœud),
 * retrait de celles qui ne sont plus produites. Les prix, quantités retenues et lignes
 * saisies sont conservés (l'application ne touche qu'aux champs calculés).
 */
export function planSync(
  existing: readonly ExistingComputedItem[],
  target: readonly ComputedLine[],
): SyncPlan {
  const current = new Map(existing.map((item) => [lineKey(item), item]));
  const add: ComputedLine[] = [];
  const update: { id: string; line: ComputedLine }[] = [];
  let unchanged = 0;
  const kept = new Set<string>();
  for (const line of target) {
    const key = lineKey(line);
    const item = current.get(key);
    if (!item) add.push(line);
    else if (sameLine(item, line)) unchanged += 1;
    else update.push({ id: item.id, line });
    kept.add(key);
  }
  const remove = existing.filter((item) => !kept.has(lineKey(item))).map((item) => item.id);
  return { add, update, remove, unchanged };
}

export const isPlanEmpty = (plan: SyncPlan): boolean =>
  plan.add.length === 0 && plan.update.length === 0 && plan.remove.length === 0;

// ---------------------------------------------------------------------------------------
// Saisie
// ---------------------------------------------------------------------------------------

const fail = (code: string, message: string) => err<DomainError>({ code, message });

/** Désignation d'une ligne saisie : 2 à 300 caractères. */
export function validateDesignation(value: string): Result<string, DomainError> {
  const designation = value.trim();
  return designation.length >= 2 && designation.length <= DESIGNATION_MAX
    ? ok(designation)
    : fail('BOQ_DESIGNATION_INVALID', 'La désignation doit comporter entre 2 et 300 caractères.');
}

/** Décimale saisie (quantité ou prix), positive ou nulle, ou strictement positive. */
export function validateAmount(
  text: string,
  code: string,
  options: { positive?: boolean } = {},
): Result<Decimal, DomainError> {
  const parsed = parseDecimal(text);
  if (!parsed.ok) return fail(code, parsed.error.message);
  if (!isStorableDecimal(parsed.value)) return fail(code, 'Valeur trop grande.');
  if (options.positive && parsed.value === 0n) {
    return fail(code, 'La valeur doit être strictement positive.');
  }
  return ok(parsed.value);
}

/** Quantité retenue d'une ligne calculée : justification d'au moins 3 caractères. */
export function validateOverride(
  quantity: string,
  justification: string,
): Result<{ quantity: Decimal; justification: string }, DomainError> {
  const value = validateAmount(quantity, 'BOQ_OVERRIDE_INVALID');
  if (!value.ok) return value;
  const text = justification.trim();
  if (text.length < 3 || text.length > 500) {
    return fail(
      'BOQ_OVERRIDE_JUSTIFICATION_REQUIRED',
      'Justifiez la quantité retenue (3 à 500 caractères).',
    );
  }
  return ok({ quantity: value.value, justification: text });
}

// ---------------------------------------------------------------------------------------
// Totaux
// ---------------------------------------------------------------------------------------

export interface PricedLine {
  readonly nodeId: string;
  readonly quantity: Decimal;
  readonly overrideQuantity: Decimal | null;
  readonly unitPrice: Decimal | null;
}

/** Quantité retenue : la quantité justifiée si elle existe, sinon la quantité calculée. */
export const effectiveQuantity = (line: {
  quantity: Decimal;
  overrideQuantity: Decimal | null;
}): Decimal => line.overrideQuantity ?? line.quantity;

/** Montant d'une ligne, arrondi à l'unité monétaire ; null sans prix unitaire. */
export function lineAmount(line: PricedLine, currency: Currency): Decimal | null {
  return line.unitPrice === null
    ? null
    : multiplyDecimal(effectiveQuantity(line), line.unitPrice, currencyDecimals(currency));
}

export interface Subtotal {
  /** Somme des montants des lignes chiffrées du nœud et de ses descendants. */
  readonly amount: Decimal;
  readonly lines: number;
  readonly unpriced: number;
}

export interface BoqTotals {
  readonly byNode: ReadonlyMap<string, Subtotal>;
  readonly total: Subtotal;
}

/** Sous-totaux par nœud (descendants compris) et total général. */
export function boqTotals(
  nodes: readonly TreeNode[],
  lines: readonly PricedLine[],
  currency: Currency,
): BoqTotals {
  const byNode = new Map<string, { amount: Decimal; lines: number; unpriced: number }>(
    nodes.map((n) => [n.id, { amount: 0n, lines: 0, unpriced: 0 }]),
  );
  const total = { amount: 0n, lines: 0, unpriced: 0 };
  for (const line of lines) {
    const amount = lineAmount(line, currency);
    for (const id of [line.nodeId, ...ancestorsOf(nodes, line.nodeId)]) {
      const subtotal = byNode.get(id);
      if (!subtotal) continue;
      subtotal.lines += 1;
      if (amount === null) subtotal.unpriced += 1;
      else subtotal.amount += amount;
    }
    total.lines += 1;
    if (amount === null) total.unpriced += 1;
    else total.amount += amount;
  }
  return { byNode, total };
}

// ---------------------------------------------------------------------------------------
// Prix
// ---------------------------------------------------------------------------------------

export interface PriceCandidate {
  readonly id: string;
  readonly workKey: string | null;
  readonly unit: string;
  readonly price: Decimal;
}

export interface PriceTarget {
  readonly id: string;
  readonly workKey: string | null;
  readonly unit: string;
  readonly unitPrice: Decimal | null;
}

export interface PricePlan {
  readonly apply: readonly {
    readonly id: string;
    readonly unitPrice: Decimal;
    readonly priceItemId: string;
  }[];
  /** Lignes sans article correspondant (ouvrage ou unité différents) : non chiffrées. */
  readonly unmatched: number;
  /** Lignes déjà chiffrées, laissées telles quelles (sans `overwrite`). */
  readonly kept: number;
}

/**
 * Application d'une bibliothèque de prix : une ligne reçoit le prix de l'article de même
 * ouvrage (`workKey`) et de même unité. Sans `overwrite`, les lignes déjà chiffrées gardent
 * leur prix. Les lignes sans correspondance sont comptées, jamais chiffrées par défaut.
 */
export function planPriceApplication(
  targets: readonly PriceTarget[],
  candidates: readonly PriceCandidate[],
  overwrite: boolean,
): PricePlan {
  const byWork = new Map<string, PriceCandidate>();
  for (const c of candidates) if (c.workKey) byWork.set(`${c.workKey}|${c.unit}`, c);
  const apply: { id: string; unitPrice: Decimal; priceItemId: string }[] = [];
  let unmatched = 0;
  let kept = 0;
  for (const target of targets) {
    if (target.unitPrice !== null && !overwrite) {
      kept += 1;
      continue;
    }
    const match = target.workKey ? byWork.get(`${target.workKey}|${target.unit}`) : undefined;
    if (match) apply.push({ id: target.id, unitPrice: match.price, priceItemId: match.id });
    else unmatched += 1;
  }
  return { apply, unmatched, kept };
}

// ---------------------------------------------------------------------------------------
// Décomposition en matériaux
// ---------------------------------------------------------------------------------------

export interface MaterialSource {
  readonly calculationId: string;
  readonly calculationTitle: string;
  readonly revisionId: string;
  readonly outputs: Readonly<Record<string, unknown>> | null;
  readonly outputPresentations: readonly OutputPresentation[];
}

export interface MaterialContribution {
  readonly calculationId: string;
  readonly calculationTitle: string;
  readonly revisionId: string;
  readonly value: number;
}

export interface MaterialRow {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly precision: number;
  /** Cumulé entre calculs (matériau générique) ; sinon, ligne propre à un calcul. */
  readonly additive: boolean;
  /** Quantité physique (double précision), arrondie seulement à l'affichage. */
  readonly total: number;
  readonly contributions: readonly MaterialContribution[];
}

/**
 * Décomposition en matériaux des révisions d'un quantitatif : les matériaux génériques
 * (`additive`) sont cumulés, avec le détail des calculs contributeurs ; les autres
 * (format de carreau, type d'entrevous…) restent une ligne par calcul. Matériaux
 * génériques d'abord, dans l'ordre de première apparition.
 */
export function materialBreakdown(sources: readonly MaterialSource[]): MaterialRow[] {
  const additive = new Map<string, MaterialRow>();
  const specific: MaterialRow[] = [];
  for (const source of sources) {
    if (!source.outputs) continue;
    for (const output of source.outputPresentations) {
      const value = source.outputs[output.key];
      if (output.family !== 'MATERIAL' || typeof value !== 'number' || !(value > 0)) continue;
      const contribution: MaterialContribution = {
        calculationId: source.calculationId,
        calculationTitle: source.calculationTitle,
        revisionId: source.revisionId,
        value,
      };
      const row: MaterialRow = {
        key: output.key,
        label: output.label,
        unit: output.unit,
        precision: output.precision,
        additive: output.additive === true,
        total: value,
        contributions: [contribution],
      };
      if (!row.additive) {
        specific.push(row);
        continue;
      }
      const key = `${output.key}|${output.unit}`;
      const previous = additive.get(key);
      additive.set(
        key,
        previous
          ? {
              ...previous,
              total: previous.total + value,
              contributions: [...previous.contributions, contribution],
            }
          : row,
      );
    }
  }
  return [...additive.values(), ...specific];
}
