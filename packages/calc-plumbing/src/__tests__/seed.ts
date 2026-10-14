import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AnyEngine, ParameterValue, ResolvedParameterSet } from '@consulpro/calc-core';
import {
  resolveParameters,
  standardFileSchema,
  type ParameterOverrideInput,
} from '@consulpro/standards';

/**
 * Référentiels de plomberie (NF DTU 60.11 et 64.1 de 2013, dimensions des tubes, usages), lus
 * depuis les fichiers publiés. Le dossier `standards/seeds` est cherché en remontant
 * l'arborescence : les tests de mutation s'exécutent dans une copie du package.
 */
function seedFile(file: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'standards', 'seeds', 'plumbing', file);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Référentiel introuvable : ${file}`);
    dir = parent;
  }
}

const read = (file: string) =>
  standardFileSchema.parse(JSON.parse(readFileSync(seedFile(file), 'utf8')));

export const SEEDS = [
  { id: 'nf-dtu-60.11-2013', seed: read('nf-dtu-60.11-2013.json') },
  { id: 'nf-dtu-64.1-2013', seed: read('nf-dtu-64.1-2013.json') },
  { id: 'tubes-en-1', seed: read('tubes-en-1.json') },
  { id: 'usages-plomberie-1', seed: read('usages-plomberie-1.json') },
] as const;

export const PUBLISHED = SEEDS.flatMap((s) => s.seed.parameters);
export const RULES = SEEDS.flatMap((s) => s.seed.rules);

const refOf = (entry: (typeof SEEDS)[number]) => ({
  standardVersionId: entry.id,
  code: entry.seed.standard.code,
  version: entry.seed.version.label,
});

/**
 * Paramètres résolus pour un moteur, comme le fait l'application : référentiels, puis
 * surcharges éventuelles (portée projet). `omit` retire des paramètres (cas de refus).
 */
export function seedParams(
  engine: AnyEngine,
  omit: readonly string[] = [],
  overrides: Readonly<Record<string, ParameterValue>> = {},
): ResolvedParameterSet {
  const owner = (key: string) =>
    SEEDS.find((s) => s.seed.parameters.some((p) => p.key === key))?.id ?? SEEDS[0].id;
  const resolved = resolveParameters(
    SEEDS.map((entry) => ({
      ref: refOf(entry),
      parameters: entry.seed.parameters.filter((p) => !omit.includes(p.key)),
    })),
    Object.entries(overrides).map(([key, value]): ParameterOverrideInput => ({
      scope: 'PROJECT',
      standardVersionId: owner(key),
      key,
      value,
      justification: 'Test de comportement',
    })),
    engine.parameters,
  );
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.error));
  return resolved.value;
}
