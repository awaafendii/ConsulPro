import type { z } from 'zod';

import type { EngineDefinition } from '../engine';
import type { ParameterRequirement } from '../params/parameter';
import { ParameterAccessError, type ResolvedParameterSet } from '../params/resolved-parameter-set';
import type {
  CalcFailure,
  CalculationResult,
  Check,
  FieldError,
  ParameterSnapshotEntry,
  ResultStatus,
  Warning,
} from '../result/calculation-result';
import { HypothesisRecorder, TraceRecorder, WarningRecorder } from '../trace/recorders';
import { deepFreeze } from './deep-freeze';

/**
 * Exécute un moteur selon le pipeline commun :
 * INPUT → VALIDATION → CALCULATION → VERIFICATION → RESULT → WARNINGS → HYPOTHESES.
 * (HISTORY est assuré par l'application.)
 *
 * Fonction pure : mêmes entrées, mêmes paramètres et même moteur ⇒ même résultat.
 * Elle ne lève jamais d'exception : tout défaut du moteur devient un statut ERROR.
 */
export function run<I, O>(
  engine: EngineDefinition<I, O>,
  rawInputs: unknown,
  params: ResolvedParameterSet,
): CalculationResult<O> {
  const header = {
    engine: { id: engine.id, version: engine.version },
    standards: params.standards,
    rawInputs,
  };

  // VALIDATION
  const parsed = engine.inputSchema.safeParse(rawInputs);
  const errors: FieldError[] = [
    ...(parsed.success ? [] : zodErrors(parsed.error)),
    ...params.checkRequirements(engine.parameters).map((e) => ({
      path: `parameters.${e.key}`,
      code: e.code,
      message: e.message,
    })),
  ];
  if (!parsed.success || errors.length > 0) {
    return {
      ...header,
      status: 'INVALID',
      inputs: null,
      parameters: snapshot(engine.parameters, params, new Set()),
      hypotheses: [],
      outputs: null,
      checks: [],
      warnings: [],
      trace: [],
      errors,
      failure: null,
    };
  }

  const inputs = deepFreeze(parsed.data);
  const reader = params.scopedTo(engine.parameters);
  const trace = new TraceRecorder();
  const assume = new HypothesisRecorder();
  const warn = new WarningRecorder();
  for (const hypothesis of engine.hypotheses) assume.engine(hypothesis.code, hypothesis.text);

  const failed = (failure: CalcFailure): CalculationResult<O> => {
    const used = new Set(reader.usedKeys());
    return {
      ...header,
      status: 'ERROR',
      inputs,
      parameters: snapshot(engine.parameters, params, used),
      hypotheses: assume.all(),
      outputs: null,
      checks: [],
      warnings: [...warn.all(), ...parameterWarnings(params, used)],
      trace: trace.all(),
      errors: [],
      failure,
    };
  };

  // CALCULATION
  let calculated: ReturnType<typeof engine.calculate>;
  try {
    calculated = engine.calculate(inputs, { params: reader, trace, assume, warn });
  } catch (error) {
    return failed(exceptionFailure(error));
  }
  if (!calculated.ok) return failed(calculated.error);

  // RESULT (garde-fou : une sortie hors schéma est un défaut du moteur)
  const output = engine.outputSchema.safeParse(calculated.value);
  if (!output.success) {
    return failed({
      code: 'OUTPUT_SCHEMA_MISMATCH',
      message: `Sortie du moteur non conforme : ${zodErrors(output.error)
        .map((e) => `${e.path} (${e.message})`)
        .join(' ; ')}`,
    });
  }
  const outputs = deepFreeze(output.data);

  // VERIFICATION
  let checks: readonly Check[];
  try {
    checks = engine.verify(inputs, outputs, { params: reader });
  } catch (error) {
    return failed(exceptionFailure(error));
  }

  // WARNINGS + HYPOTHESES
  const used = new Set(reader.usedKeys());
  const warnings = [...warn.all(), ...parameterWarnings(params, used)];

  return {
    ...header,
    status: statusOf(checks, warnings),
    inputs,
    parameters: snapshot(engine.parameters, params, used),
    hypotheses: assume.all(),
    outputs,
    checks,
    warnings,
    trace: trace.all(),
    errors: [],
    failure: null,
  };
}

function statusOf(checks: readonly Check[], warnings: readonly Warning[]): ResultStatus {
  if (checks.some((c) => c.status === 'FAIL' && c.severity === 'BLOCKING')) return 'NON_COMPLIANT';
  if (warnings.length > 0 || checks.some((c) => c.status === 'FAIL')) return 'OK_WITH_WARNINGS';
  return 'OK';
}

function snapshot(
  requirements: readonly ParameterRequirement[],
  params: ResolvedParameterSet,
  used: ReadonlySet<string>,
): ParameterSnapshotEntry[] {
  return requirements
    .map((requirement) => params.get(requirement.key))
    .filter((p) => p !== undefined)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((p) => {
      const { key, source, verification, override, ...value } = p;
      return {
        key,
        value,
        source,
        verification,
        used: used.has(key),
        ...(override ? { override } : {}),
      };
    });
}

function parameterWarnings(params: ResolvedParameterSet, used: ReadonlySet<string>): Warning[] {
  const warnings: Warning[] = [];
  for (const key of [...used].sort()) {
    const p = params.get(key);
    if (!p) continue;
    if (p.verification === 'TO_VERIFY') {
      const where = [p.source.document, p.source.clause, p.source.table].filter(Boolean).join(', ');
      warnings.push({
        code: 'PARAMETER_TO_VERIFY',
        severity: 'WARNING',
        origin: 'PARAMETER_TO_VERIFY',
        parameterKey: key,
        text: `Paramètre non vérifié utilisé : ${key} (source : ${where}).`,
      });
    }
    if (p.override) {
      warnings.push({
        code: 'PARAMETER_OVERRIDDEN',
        severity: 'INFO',
        origin: 'PARAMETER_OVERRIDDEN',
        parameterKey: key,
        text: `Paramètre ${key} surchargé (${p.override.scope === 'PROJECT' ? 'projet' : 'organisation'}) : ${p.override.justification}`,
      });
    }
  }
  return warnings;
}

function exceptionFailure(error: unknown): CalcFailure {
  if (error instanceof ParameterAccessError) {
    return { code: 'PARAMETER_ACCESS', message: error.message };
  }
  return {
    code: 'ENGINE_EXCEPTION',
    message: error instanceof Error ? error.message : String(error),
  };
}

export function zodErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => {
    const params = 'params' in issue ? (issue.params as { code?: unknown } | undefined) : undefined;
    return {
      path: issue.path.map(String).join('.'),
      code: typeof params?.code === 'string' ? params.code : issue.code,
      message: issue.message,
    };
  });
}
