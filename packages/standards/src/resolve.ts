import {
  err,
  findUnit,
  ok,
  ResolvedParameterSet,
  type ParameterRequirement,
  type ParameterValue,
  type ResolvedParameter,
  type Result,
  type StandardRef,
} from '@consulpro/calc-core';

import { parameterValueSchema, type ParameterDefinition } from './schema';

/** Version de référentiel retenue pour un calcul, avec ses paramètres. */
export interface SelectedVersion {
  readonly ref: StandardRef;
  readonly parameters: readonly ParameterDefinition[];
}

export interface ParameterOverrideInput {
  readonly scope: 'ORGANIZATION' | 'PROJECT';
  readonly standardVersionId: string;
  readonly key: string;
  readonly value: ParameterValue;
  readonly justification: string;
}

export interface ResolutionError {
  readonly key: string;
  readonly code:
    'PARAMETER_AMBIGUOUS' | 'OVERRIDE_INCOMPATIBLE' | 'OVERRIDE_UNJUSTIFIED' | 'PARAMETER_INVALID';
  readonly message: string;
}

const PRIORITY = { ORGANIZATION: 1, PROJECT: 2 } as const;

function compatible(base: ParameterValue, value: ParameterValue): boolean {
  if (base.kind !== value.kind) return false;
  if (base.kind === 'SCALAR' && value.kind === 'SCALAR') {
    return findUnit(base.unit)?.kind === findUnit(value.unit)?.kind;
  }
  if (base.kind === 'ENUM' && value.kind === 'ENUM') return base.allowed.includes(value.value);
  return true;
}

/** Valeur de référence d'un paramètre de référentiel. */
export function valueOf(p: ParameterDefinition): ParameterValue {
  switch (p.kind) {
    case 'SCALAR':
      return { kind: 'SCALAR', value: p.value, unit: p.unit };
    case 'ENUM':
      return { kind: 'ENUM', value: p.value, allowed: p.allowed };
    case 'TABLE':
      return { kind: 'TABLE', table: p.table };
  }
}

/**
 * Résout les paramètres exigés par un moteur (docs/architecture/11-referentiels.md §4) :
 *   valeur = surcharge projet ?? surcharge organisation ?? valeur du référentiel.
 * Une surcharge exige une justification, conserve la valeur de référence et passe
 * le paramètre « à vérifier » : la source documentaire ne garantit plus la valeur.
 * Seuls les paramètres déclarés par le moteur sont retenus.
 */
export function resolveParameters(
  versions: readonly SelectedVersion[],
  overrides: readonly ParameterOverrideInput[],
  requirements: readonly ParameterRequirement[],
): Result<ResolvedParameterSet, readonly ResolutionError[]> {
  const errors: ResolutionError[] = [];
  const resolved: ResolvedParameter[] = [];

  for (const requirement of requirements) {
    const candidates = versions.flatMap((v) =>
      v.parameters
        .filter((p) => p.key === requirement.key)
        .map((p) => ({ version: v, parameter: p })),
    );
    if (candidates.length === 0) continue; // absence signalée par le moteur (PARAMETER_MISSING)
    if (candidates.length > 1) {
      errors.push({
        key: requirement.key,
        code: 'PARAMETER_AMBIGUOUS',
        message: `Paramètre défini par plusieurs référentiels retenus : ${candidates.map((c) => c.version.ref.code).join(', ')}.`,
      });
      continue;
    }
    const [{ version, parameter }] = candidates as [(typeof candidates)[number]];
    const base = valueOf(parameter);
    const applicable = overrides
      .filter(
        (o) => o.key === parameter.key && o.standardVersionId === version.ref.standardVersionId,
      )
      .sort((a, b) => PRIORITY[b.scope] - PRIORITY[a.scope]);
    const winner = applicable[0];

    if (!winner) {
      resolved.push({
        ...base,
        key: parameter.key,
        source: parameter.source,
        verification: parameter.verification,
      });
      continue;
    }
    if (winner.justification.trim().length < 3) {
      errors.push({
        key: parameter.key,
        code: 'OVERRIDE_UNJUSTIFIED',
        message: 'Une surcharge doit être justifiée.',
      });
      continue;
    }
    if (!compatible(base, winner.value)) {
      errors.push({
        key: parameter.key,
        code: 'OVERRIDE_INCOMPATIBLE',
        message:
          'La surcharge ne correspond pas au type ou à la grandeur du paramètre de référence.',
      });
      continue;
    }
    resolved.push({
      ...winner.value,
      key: parameter.key,
      source: { ...parameter.source, note: `Valeur surchargée : ${winner.justification}` },
      verification: 'TO_VERIFY',
      override: { referenceValue: base, justification: winner.justification, scope: winner.scope },
    });
  }

  if (errors.length > 0) return err(errors);
  const set = ResolvedParameterSet.create(
    resolved,
    versions.map((v) => v.ref),
  );
  if (!set.ok) {
    return err(
      set.error.map((e) => ({
        key: e.key,
        code: 'PARAMETER_INVALID' as const,
        message: e.message,
      })),
    );
  }
  return ok(set.value);
}

/**
 * Contrôle une surcharge avant enregistrement : valeur bien formée (unité connue,
 * table cohérente), justification présente, même type et même grandeur que la référence.
 */
export function checkOverride(
  definition: ParameterDefinition,
  rawValue: unknown,
  justification: string,
): Result<ParameterValue, ResolutionError> {
  const parsed = parameterValueSchema.safeParse(rawValue);
  if (!parsed.success) {
    return err({
      key: definition.key,
      code: 'PARAMETER_INVALID',
      message: parsed.error.issues[0]?.message ?? 'Valeur invalide.',
    });
  }
  if (justification.trim().length < 3) {
    return err({
      key: definition.key,
      code: 'OVERRIDE_UNJUSTIFIED',
      message: 'Une surcharge doit être justifiée.',
    });
  }
  if (!compatible(valueOf(definition), parsed.data)) {
    return err({
      key: definition.key,
      code: 'OVERRIDE_INCOMPATIBLE',
      message: 'La surcharge ne correspond pas au type ou à la grandeur du paramètre de référence.',
    });
  }
  return ok(parsed.data);
}
