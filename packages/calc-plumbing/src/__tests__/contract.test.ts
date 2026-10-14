import {
  findUnit,
  isBreakdown,
  SEMVER_PATTERN,
  type AnyEngine,
  type CalculationResult,
} from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { PLUMBING_ENGINES } from '../index';
import { files, replay } from './cases';
import { PUBLISHED } from './seed';

/*
 * Contrat de présentation et de traçabilité (principes P3 et P4) : tout ce que l'interface
 * affiche d'un moteur — entrées, sorties, formules, étapes de calcul, hypothèses, vérifications —
 * est décrit, dans des unités connues, et cohérent avec le schéma des entrées.
 */

const text = (value: unknown, min = 1) => typeof value === 'string' && value.trim().length >= min;
const knownUnit = (unit: unknown) => typeof unit === 'string' && findUnit(unit) !== undefined;

type Shape = Record<string, z.ZodType>;
const shapeOf = (schema: z.ZodType): Shape => (schema as unknown as { shape: Shape }).shape;
const unwrap = (schema: z.ZodType): z.ZodType =>
  schema instanceof z.ZodOptional ? unwrap(schema.unwrap() as z.ZodType) : schema;

const published = PUBLISHED;
const unitOfParameter = (key: string) => {
  const parameter = published.find((p) => p.key === key);
  if (parameter?.kind === 'TABLE') return parameter.table.unit;
  return parameter?.kind === 'SCALAR' ? parameter.unit : undefined;
};

describe.each(PLUMBING_ENGINES.map((e) => [e.id, e] as const))('%s', (_, engine: AnyEngine) => {
  it('identité : discipline, version, titre, description, hypothèses et formules décrites', () => {
    expect(engine.id.startsWith('plumbing.')).toBe(true);
    expect(engine.discipline).toBe('PLUMBING');
    expect(engine.version).toMatch(SEMVER_PATTERN);
    expect(text(engine.title, 5)).toBe(true);
    expect(text(engine.presentation.description, 20)).toBe(true);
    expect(engine.hypotheses.length).toBeGreaterThan(0);
    for (const h of engine.hypotheses) {
      expect(h.code).toMatch(/^[A-Z]+(\.[A-Z0-9_]+)+$/);
      expect(text(h.text, 20), h.code).toBe(true);
    }
    expect(engine.formulas.length).toBeGreaterThan(0);
    for (const f of engine.formulas) {
      expect(
        [f.id, f.label, f.latex, f.source].every((v) => text(v)),
        f.id,
      ).toBe(true);
      expect(f.symbols.length, f.id).toBeGreaterThan(0);
      for (const s of f.symbols) {
        expect(text(s.symbol) && text(s.meaning, 3), `${f.id} ${s.symbol}`).toBe(true);
        if (s.unit !== undefined) expect(knownUnit(s.unit), `${f.id} ${s.unit}`).toBe(true);
      }
    }
  });

  it('paramètres : décrits, grandeur conforme au référentiel publié', () => {
    for (const requirement of engine.parameters) {
      expect(text(requirement.description, 10), requirement.key).toBe(true);
      const unit = unitOfParameter(requirement.key);
      expect(unit, requirement.key).toBeDefined();
      expect(findUnit(unit ?? '')?.kind, requirement.key).toBe(requirement.unitKind);
    }
  });

  it('entrées : chaque champ du schéma est présenté, avec la même obligation et des unités admises', () => {
    const shape = shapeOf(engine.inputSchema);
    const presented = engine.presentation.inputs;
    expect(presented.map((i) => i.key).sort()).toEqual(Object.keys(shape).sort());
    for (const input of presented) {
      const field = shape[input.key];
      if (!field) throw new Error(input.key);
      expect(text(input.label, 2), input.key).toBe(true);
      if (input.help !== undefined) expect(text(input.help, 10), input.key).toBe(true);
      expect(input.optional === true, `${input.key} facultatif`).toBe(
        field.safeParse(undefined).success,
      );
      switch (input.kind) {
        case 'quantity': {
          expect(input.units.length, input.key).toBeGreaterThan(0);
          for (const unit of input.units) {
            expect(findUnit(unit)?.kind, `${input.key} ${unit}`).toBe(input.unitKind);
            const parsed = field.safeParse({ value: 1, unit });
            const issues = parsed.success ? [] : parsed.error.issues;
            expect(
              issues.some((issue) => issue.message.includes('incompatible')),
              `${input.key} ${unit}`,
            ).toBe(false);
          }
          break;
        }
        case 'enum': {
          const inner = unwrap(field) as z.ZodEnum;
          expect(input.options.map((o) => o.value).sort(), input.key).toEqual(
            [...inner.options].map(String).sort(),
          );
          expect(
            input.options.every((o) => text(o.label, 2)),
            input.key,
          ).toBe(true);
          break;
        }
        case 'integer': {
          expect(field.safeParse(input.min).success, input.key).toBe(true);
          expect(field.safeParse(input.min - 1).success, input.key).toBe(false);
          break;
        }
        case 'dataset': {
          expect(input.datasetKind).toMatch(/^[A-Z]+(_[A-Z]+)+$/);
          break;
        }
        case 'list': {
          expect(input.maxItems, input.key).toBeGreaterThan(0);
          const item = (unwrap(field) as unknown as { element: z.ZodType }).element;
          expect(input.fields.map((f) => f.key).sort(), input.key).toEqual(
            Object.keys(shapeOf(item)).sort(),
          );
          for (const f of input.fields) {
            expect(text(f.label, 2), `${input.key}.${f.key}`).toBe(true);
            if (f.kind === 'quantity') {
              for (const unit of f.units) expect(findUnit(unit)?.kind).toBe(f.unitKind);
            }
          }
          break;
        }
        default: {
          throw new Error('Présentation non attendue');
        }
      }
    }
  });

  it('sorties : chaque sortie du schéma est présentée, dans une unité connue', () => {
    const presented = engine.presentation.outputs;
    expect(presented.map((o) => o.key).sort()).toEqual(
      Object.keys(shapeOf(engine.outputSchema)).sort(),
    );
    for (const output of presented) {
      expect(text(output.label, 2), output.key).toBe(true);
      expect(knownUnit(output.unit), `${output.key} ${output.unit}`).toBe(true);
      expect(Number.isInteger(output.precision) && output.precision >= 0).toBe(true);
      if (output.breakdown) expect(output.family, output.key).toBeDefined();
      if (output.family !== undefined)
        expect(output.family, output.key).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    }
  });
});

/** Un résultat calculé est entièrement décrit : étapes, hypothèses, vérifications, avertissements. */
function expectDescribed(
  result: CalculationResult<unknown>,
  label: string,
  engine: AnyEngine | undefined,
) {
  // Une sortie ventilée (liste) est déclarée comme telle : sinon ni affichée ni reprise au DQE.
  for (const [key, value] of Object.entries((result.outputs ?? {}) as Record<string, unknown>)) {
    const presented = engine?.presentation.outputs.find((o) => o.key === key);
    expect(presented?.breakdown === true, `${label} ${key}`).toBe(Array.isArray(value));
  }
  expect(result.trace.length, label).toBeGreaterThan(0);
  const ids = result.trace.map((s) => s.id);
  expect(new Set(ids).size, `${label} : identifiants d’étapes uniques`).toBe(ids.length);
  for (const step of result.trace) {
    const where = `${label} ${step.id}`;
    expect(step.id, where).toMatch(/^T\d+$/);
    expect(text(step.label, 3), where).toBe(true);
    expect(text(step.formula, 3), where).toBe(true);
    expect(step.substitutions?.length ?? 0, where).toBeGreaterThan(0);
    for (const s of step.substitutions ?? []) {
      expect(text(s.symbol), where).toBe(true);
      expect(typeof s.value === 'number' ? Number.isFinite(s.value) : text(s.value), where).toBe(
        true,
      );
      if (s.unit !== undefined) expect(knownUnit(s.unit), `${where} ${s.symbol}`).toBe(true);
    }
    expect(typeof step.value === 'number' && Number.isFinite(step.value), where).toBe(true);
    if (step.unit !== undefined) expect(knownUnit(step.unit), where).toBe(true);
    if (step.source !== undefined) expect(text(step.source, 5), where).toBe(true);
  }
  for (const h of result.hypotheses) {
    expect(text(h.code, 3) && text(h.text, 10), `${label} ${h.code}`).toBe(true);
    if (h.origin === 'DEFAULT_VALUE') {
      expect(text(h.field), `${label} ${h.code}`).toBe(true);
      expect(h.value, `${label} ${h.code}`).not.toBe('');
    }
  }
  for (const check of result.checks) {
    const where = `${label} ${check.rule}`;
    expect(check.rule).toMatch(/^plumbing\.[a-z0-9.-]+$/);
    expect(text(check.label, 10), where).toBe(true);
    expect(['BLOCKING', 'WARNING', 'INFO'], where).toContain(check.severity);
    if (check.clause !== undefined) expect(check.clause, where).toMatch(/^P\d+(-\d+)?$/);
    if (check.unit !== undefined) expect(knownUnit(check.unit), where).toBe(true);
    if (check.note !== undefined) expect(text(check.note, 10), where).toBe(true);
  }
  // Sorties ventilées : entrées valides, libellés sans « — » (désignation des lignes de DQE).
  for (const [key, value] of Object.entries((result.outputs ?? {}) as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    expect(isBreakdown(value), `${label} ${key}`).toBe(true);
    for (const entry of value as { label: string; groupLabel: string }[]) {
      expect(entry.label.includes(' — ') || entry.groupLabel.includes(' — '), label).toBe(false);
    }
  }
  for (const warning of result.warnings) {
    expect(text(warning.code, 3) && text(warning.text, 10), label).toBe(true);
  }
}

describe('résultats des cas de référence', () => {
  it('chaque étape, hypothèse, vérification et avertissement est décrit', () => {
    let computed = 0;
    for (const file of files) {
      for (const c of file.cases) {
        if (c.expected.resultStatus === 'INVALID' || c.expected.resultStatus === 'ERROR') continue;
        expectDescribed(
          replay(c),
          c.id,
          PLUMBING_ENGINES.find((e) => e.id === c.engine),
        );
        computed += 1;
      }
    }
    expect(computed).toBeGreaterThan(20);
  });

  it('chaque refus désigne le champ en cause par un message', () => {
    for (const file of files) {
      for (const c of file.cases) {
        if (c.expected.resultStatus !== 'INVALID') continue;
        const result = replay(c);
        for (const error of result.errors) {
          expect(text(error.message, 5), `${c.id} ${error.path}`).toBe(true);
        }
      }
    }
  });
});
