import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { AnyEngine, ParameterValue, ResolvedParameterSet } from '@consulpro/calc-core';
import {
  resolveParameters,
  standardFileSchema,
  type ParameterOverrideInput,
} from '@consulpro/standards';

/** Référentiel BTP-USAGES-METRE v1, lu depuis le fichier de seed publié. */
const seed = standardFileSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../standards/seeds/btp/usages-metre-1.json', import.meta.url)),
      'utf8',
    ),
  ),
);

const REF = {
  standardVersionId: 'btp-usages-metre-1',
  code: seed.standard.code,
  version: seed.version.label,
};

/**
 * Paramètres résolus pour un moteur, comme le fait l'application : référentiel, puis
 * surcharges éventuelles (portée projet). `omit` retire des paramètres (cas de refus).
 */
export function seedParams(
  engine: AnyEngine,
  omit: readonly string[] = [],
  overrides: Readonly<Record<string, ParameterValue>> = {},
): ResolvedParameterSet {
  const parameters = seed.parameters.filter((p) => !omit.includes(p.key));
  const resolved = resolveParameters(
    [{ ref: REF, parameters }],
    Object.entries(overrides).map(([key, value]): ParameterOverrideInput => ({
      scope: 'PROJECT',
      standardVersionId: REF.standardVersionId,
      key,
      value,
      justification: 'Test de comportement',
    })),
    engine.parameters,
  );
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.error));
  return resolved.value;
}
