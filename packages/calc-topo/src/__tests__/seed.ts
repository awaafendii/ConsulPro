import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AnyEngine, ResolvedParameterSet } from '@consulpro/calc-core';
import { resolveParameters, standardFileSchema } from '@consulpro/standards';

/**
 * Référentiel des tolérances topographiques, lu depuis le fichier publié. Le dossier
 * `standards/seeds` est cherché en remontant l'arborescence (comme pour les autres métiers).
 * Les moteurs de géométrie n'ont aucun paramètre : la résolution leur renvoie un ensemble vide.
 */
function seedFile(file: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'standards', 'seeds', 'topo', file);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Référentiel introuvable : ${file}`);
    dir = parent;
  }
}

const TOL = standardFileSchema.parse(
  JSON.parse(readFileSync(seedFile('topo-tolerances.json'), 'utf8')),
);
const TOL_REF = {
  standardVersionId: 'consulpro-topo-tol-2026',
  code: TOL.standard.code,
  version: TOL.version.label,
};

/** Paramètres résolus pour un moteur topographique, comme le fait l'application. */
export function seedParams(engine: AnyEngine): ResolvedParameterSet {
  const resolved = resolveParameters(
    [{ ref: TOL_REF, parameters: TOL.parameters }],
    [],
    engine.parameters,
  );
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.error));
  return resolved.value;
}
