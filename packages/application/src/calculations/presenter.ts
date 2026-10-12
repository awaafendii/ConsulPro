import { findUnit, type ParameterValue } from '@consulpro/calc-core';
import type { CalculationView } from '@consulpro/contracts';

import type { RevisionRecord } from '../ports-calculations';

/*
 * Présentateur CalculationResult → CalculationView (10-moteur-de-calcul.md §5) : le résultat
 * enregistré et la présentation du moteur figée au moment du calcul suffisent à reconstruire
 * l'affichage, même si le moteur n'est plus disponible. Aucun calcul : mise en forme seulement.
 */

type Scalar = number | string | boolean | null;

const isMeasured = (v: unknown): v is { value: number; unit: string } =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { value?: unknown }).value === 'number' &&
  typeof (v as { unit?: unknown }).unit === 'string';

function parameterValue(value: ParameterValue): { value: number | string; unit?: string } {
  switch (value.kind) {
    case 'SCALAR':
      return { value: value.value, unit: value.unit };
    case 'ENUM':
      return { value: value.value };
    case 'TABLE':
      return {
        value: `Table (${String(value.table.cells.length)} valeurs)`,
        unit: value.table.unit,
      };
  }
}

export function toCalculationView(revision: RevisionRecord): CalculationView {
  const p = revision.presentation;
  const symbols = new Set<string>();
  const unit = (symbol: string | undefined) => {
    if (symbol && symbol !== '1') symbols.add(symbol);
    return symbol && symbol !== '1' ? symbol : undefined;
  };
  const optional = <K extends string, V>(key: K, value: V | undefined) =>
    (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;

  const normalized = (revision.inputs ?? {}) as Record<string, unknown>;
  const defaulted = new Set(
    revision.hypotheses.filter((h) => h.origin === 'DEFAULT_VALUE').map((h) => h.field),
  );
  const inputs = p.inputs.map((input) => {
    const raw = normalized[input.key] ?? revision.rawInputs[input.key];
    const measured = isMeasured(raw);
    let value: Scalar = null;
    if (Array.isArray(raw)) value = `${String(raw.length)} ligne${raw.length > 1 ? 's' : ''}`;
    else if (measured) value = raw.value;
    else if (['string', 'number', 'boolean'].includes(typeof raw)) value = raw as Scalar;
    else if (input.kind === 'enum' && typeof raw === 'string') value = raw;
    const label =
      input.kind === 'enum' && typeof value === 'string'
        ? (input.options.find((o) => o.value === value)?.label ?? value)
        : value;
    return {
      key: input.key,
      label: input.label,
      value: label,
      ...optional('unit', measured ? unit(raw.unit) : undefined),
      defaulted: defaulted.has(input.key),
    };
  });

  const labels = new Map(p.parameters.map((x) => [x.key, x.label]));
  const parameters = revision.parameterSnapshot.map((entry) => {
    const shown = parameterValue(entry.value);
    return {
      key: entry.key,
      label: labels.get(entry.key) ?? entry.key,
      kind: entry.value.kind,
      value: shown.value,
      ...optional('unit', unit(shown.unit)),
      source: {
        document: entry.source.document,
        ...optional('clause', entry.source.clause),
        ...optional('table', entry.source.table),
        ...optional('note', entry.source.note),
      },
      verification: entry.verification,
      used: entry.used,
      ...(entry.override
        ? {
            override: {
              referenceValue: parameterValue(entry.override.referenceValue).value,
              justification: entry.override.justification,
              scope: entry.override.scope,
            },
          }
        : {}),
    };
  });

  const outputs = revision.outputs
    ? p.outputs.flatMap((o) => {
        const value = revision.outputs?.[o.key];
        return typeof value === 'number'
          ? [
              {
                key: o.key,
                label: o.label,
                value,
                ...optional('unit', unit(o.unit)),
                precision: o.precision,
              },
            ]
          : [];
      })
    : [];

  const checks = revision.checks.map((c) => ({
    rule: c.rule,
    label: c.label,
    status: c.status,
    severity: c.severity,
    ...optional('measured', c.measured),
    ...optional('limit', c.limit),
    ...optional('comparison', c.comparison),
    ...optional('unit', unit(c.unit)),
    ...optional('clause', c.clause),
  }));

  const trace = revision.trace.map((s) => ({
    id: s.id,
    label: s.label,
    ...optional('formula', s.formula),
    ...(s.substitutions
      ? {
          substitutions: s.substitutions.map((x) => ({
            symbol: x.symbol,
            value: x.value,
            ...optional('unit', unit(x.unit)),
          })),
        }
      : {}),
    ...optional('value', s.value),
    ...optional('unit', unit(s.unit)),
    ...optional('source', s.source),
    ...optional('note', s.note),
  }));

  return {
    engine: {
      id: revision.engineId,
      version: revision.engineVersion,
      title: p.title,
      verified:
        p.referenceCases !== undefined &&
        p.referenceCases.total > 0 &&
        p.referenceCases.checked === p.referenceCases.total,
    },
    status: revision.resultStatus,
    preview: false,
    standards: revision.standards.map((s) => ({ code: s.code, version: s.version })),
    units: Object.fromEntries([...symbols].map((s) => [s, findUnit(s)?.display ?? s])),
    inputs,
    hypotheses: revision.hypotheses.map((h) => ({ code: h.code, text: h.text, origin: h.origin })),
    parameters,
    outputs,
    checks,
    warnings: revision.warnings.map((w) => ({
      code: w.code,
      severity: w.severity,
      text: w.text,
      origin: w.origin,
    })),
    trace,
    errors: revision.errors.map((e) => ({ path: e.path, code: e.code, message: e.message })),
    failure: revision.failure,
  };
}
