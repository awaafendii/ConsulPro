import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { run, type AnyEngine } from '@consulpro/calc-core';
import { z } from 'zod';

import { TOPO_ENGINES } from '../index';
import { seedParams } from './seed';

/*
 * Cas de référence (docs/architecture/06-strategie-de-tests.md §3) : chaque fichier
 * `cases/<moteur>.json` est rejoué sur les tolérances topographiques publiées
 * (CONSULPRO-TOPO-TOL 2026) ; les valeurs attendues proviennent d'un calcul manuel
 * détaillé (`source.reference`). Certaines sorties sont nulles par construction (polygonale
 * ouverte, contrôle planimétrique seul), d'où des valeurs attendues `null`. Les refus se
 * distinguent : entrée rejetée au schéma (INVALID) ou calcul refusé par le moteur (ERROR).
 */

const expectedOutput = z
  .object({ value: z.number().nullable(), tolerance: z.number().nonnegative() })
  .strict();
const caseSchema = z
  .object({
    id: z.string(),
    engine: z.string(),
    engineVersionRange: z.string(),
    category: z.enum(['NOMINAL', 'LIMIT', 'REFUSAL']),
    source: z
      .object({
        kind: z.enum(['NORM_EXAMPLE', 'TEXTBOOK', 'HAND_CALCULATION', 'VALIDATED_SPREADSHEET']),
        reference: z.string().min(10),
        checkedBy: z.string().nullable(),
        checkedAt: z.string().nullable(),
      })
      .strict(),
    parameterSet: z
      .object({ standard: z.literal('CONSULPRO-TOPO-TOL'), version: z.literal('2026') })
      .strict(),
    inputs: z.record(z.string(), z.unknown()),
    expected: z.union([
      z
        .object({
          resultStatus: z.enum(['OK', 'OK_WITH_WARNINGS', 'NON_COMPLIANT']),
          outputs: z.record(z.string(), expectedOutput),
          checks: z.array(
            z.object({ rule: z.string(), status: z.enum(['PASS', 'FAIL']) }).strict(),
          ),
          hypotheses: z.array(z.string()),
        })
        .strict(),
      z
        .object({
          resultStatus: z.literal('INVALID'),
          errors: z.array(z.object({ path: z.string(), code: z.string() }).strict()).min(1),
        })
        .strict(),
      z
        .object({
          resultStatus: z.literal('ERROR'),
          failure: z.object({ code: z.string() }).strict(),
        })
        .strict(),
    ]),
  })
  .strict();
const fileSchema = z
  .object({ engine: z.string(), parameterSet: z.unknown(), cases: z.array(caseSchema) })
  .strict();
export type ReferenceCase = z.output<typeof caseSchema>;

const casesDir = fileURLToPath(new URL('../../cases/', import.meta.url));
export const files = readdirSync(casesDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    name,
    ...fileSchema.parse(JSON.parse(readFileSync(casesDir + name, 'utf8'))),
  }));
export const engines = new Map(TOPO_ENGINES.map((e) => [e.id, e]));
export const engineOf = (id: string): AnyEngine => {
  const engine = engines.get(id);
  if (!engine) throw new Error(`Moteur inconnu : ${id}`);
  return engine;
};

export function replay(c: ReferenceCase) {
  return run(engineOf(c.engine), c.inputs, seedParams(engineOf(c.engine)));
}
