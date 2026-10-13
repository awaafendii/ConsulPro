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
 * Référentiels NF C 15-100 (2002) et UTE C 15-105, lus depuis les fichiers publiés. Le dossier
 * `standards/seeds` est cherché en remontant l'arborescence : les tests de mutation s'exécutent
 * dans une copie du package (bac à sable de Stryker), où un chemin relatif fixe ne vaut plus.
 */
function seedFile(file: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'standards', 'seeds', 'elec', file);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Référentiel introuvable : ${file}`);
    dir = parent;
  }
}

const read = (file: string) =>
  standardFileSchema.parse(JSON.parse(readFileSync(seedFile(file), 'utf8')));

export const NFC = read('nfc15-100-2002.json');
export const UTE = read('ute-c15-105-2003.json');

const refOf = (seed: typeof NFC, id: string) => ({
  standardVersionId: id,
  code: seed.standard.code,
  version: seed.version.label,
});
const NFC_REF = refOf(NFC, 'nfc15-100-2002');
const UTE_REF = refOf(UTE, 'ute-c15-105-2003');

/**
 * Paramètres résolus pour un moteur, comme le fait l'application : référentiels, puis
 * surcharges éventuelles (portée projet). `omit` retire des paramètres (cas de refus).
 */
export function seedParams(
  engine: AnyEngine,
  omit: readonly string[] = [],
  overrides: Readonly<Record<string, ParameterValue>> = {},
): ResolvedParameterSet {
  const keep = (seed: typeof NFC) => seed.parameters.filter((p) => !omit.includes(p.key));
  const owner = (key: string) =>
    NFC.parameters.some((p) => p.key === key)
      ? NFC_REF.standardVersionId
      : UTE_REF.standardVersionId;
  const resolved = resolveParameters(
    [
      { ref: NFC_REF, parameters: keep(NFC) },
      { ref: UTE_REF, parameters: keep(UTE) },
    ],
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
