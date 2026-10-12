import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { EngineRegistry, run, type AnyEngine } from '@consulpro/calc-core';
import { standardFileSchema } from '@consulpro/standards';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BTP_ENGINES, BTP_REFERENCE_CASES } from '../index';
import { seedParams } from './seed';

/*
 * Cas de référence (docs/architecture/06-strategie-de-tests.md §3) : chaque fichier
 * `cases/<moteur>.json` est rejoué sur le référentiel BTP-USAGES-METRE v1 ; les valeurs
 * attendues proviennent d'un calcul manuel détaillé (`source.reference`).
 */

const expectedOutput = z.object({ value: z.number(), tolerance: z.number().positive() }).strict();
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
      .object({ standard: z.literal('BTP-USAGES-METRE'), version: z.literal('1') })
      .strict(),
    omitParameters: z.array(z.string()).optional(),
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
    ]),
  })
  .strict();
const fileSchema = z
  .object({ engine: z.string(), parameterSet: z.unknown(), cases: z.array(caseSchema) })
  .strict();
type ReferenceCase = z.output<typeof caseSchema>;

const casesDir = fileURLToPath(new URL('../../cases/', import.meta.url));
const files = readdirSync(casesDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    name,
    ...fileSchema.parse(JSON.parse(readFileSync(casesDir + name, 'utf8'))),
  }));
const engines = new Map(BTP_ENGINES.map((e) => [e.id, e]));
const engineOf = (id: string): AnyEngine => {
  const engine = engines.get(id);
  if (!engine) throw new Error(`Moteur inconnu : ${id}`);
  return engine;
};

const seedFile = standardFileSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../standards/seeds/btp/usages-metre-1.json', import.meta.url)),
      'utf8',
    ),
  ),
);

function replay(c: ReferenceCase) {
  const engine = engineOf(c.engine);
  return run(engine, c.inputs, seedParams(engine, c.omitParameters ?? []));
}

describe('cas de référence BTP', () => {
  it('un fichier par moteur BTP, nommé d’après le moteur', () => {
    expect(files.map((f) => f.engine).sort()).toEqual([...engines.keys()].sort());
    for (const file of files) {
      expect(file.name).toBe(`${file.engine}.json`);
      expect(
        file.cases.every((c) => c.engine === file.engine && c.id.startsWith(`${file.engine}/`)),
      ).toBe(true);
    }
    const ids = files.flatMap((f) => f.cases.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('seuils 06 §3.2 : au moins 3 nominaux, 2 limites, 2 refus par moteur', () => {
    for (const file of files) {
      const count = (category: string) => file.cases.filter((c) => c.category === category).length;
      expect(count('NOMINAL'), file.engine).toBeGreaterThanOrEqual(3);
      expect(count('LIMIT'), file.engine).toBeGreaterThanOrEqual(2);
      expect(count('REFUSAL'), file.engine).toBeGreaterThanOrEqual(2);
    }
  });

  it('le décompte exposé à l’interface (moteur « vérifié » ou non) suit les fichiers', () => {
    for (const file of files) {
      expect(BTP_REFERENCE_CASES[file.engine], file.engine).toEqual({
        total: file.cases.length,
        checked: file.cases.filter((c) => c.source.checkedBy !== null).length,
      });
      expect(engineOf(file.engine).referenceCases).toEqual(BTP_REFERENCE_CASES[file.engine]);
    }
  });

  for (const file of files) {
    describe(file.engine, () => {
      for (const c of file.cases) {
        it(`${c.category} — ${c.id}`, () => {
          const result = replay(c);
          expect(
            result.status,
            JSON.stringify(result.errors.length ? result.errors : result.failure),
          ).toBe(c.expected.resultStatus);
          if (c.expected.resultStatus === 'INVALID') {
            expect(result.errors.map((e) => ({ path: e.path, code: e.code }))).toEqual(
              c.expected.errors,
            );
            return;
          }
          const outputs = result.outputs as Record<string, number>;
          // Toutes les sorties du moteur sont attendues : aucune n'échappe au calcul manuel.
          expect(Object.keys(c.expected.outputs).sort()).toEqual(Object.keys(outputs).sort());
          for (const [key, { value, tolerance }] of Object.entries(c.expected.outputs)) {
            const actual = outputs[key] ?? Number.NaN;
            expect(
              Math.abs(actual - value),
              `${key} : ${actual} au lieu de ${value}`,
            ).toBeLessThanOrEqual(tolerance);
          }
          expect(result.checks.map((k) => ({ rule: k.rule, status: k.status }))).toEqual(
            c.expected.checks,
          );
          expect(result.hypotheses.map((h) => h.code).sort()).toEqual(c.expected.hypotheses);
          // Référentiel « à vérifier » : chaque paramètre lu est signalé.
          expect(result.warnings.every((w) => w.code === 'PARAMETER_TO_VERIFY')).toBe(true);
          expect(result.warnings.length).toBeGreaterThan(0);
        });
      }
    });
  }
});

describe('moteurs BTP ↔ référentiel BTP-USAGES-METRE', () => {
  it('chaque paramètre exigé existe dans le référentiel, du même type', () => {
    const published = new Map(seedFile.parameters.map((p) => [p.key, p]));
    for (const engine of BTP_ENGINES) {
      for (const requirement of engine.parameters) {
        expect(published.get(requirement.key)?.kind, `${engine.id} → ${requirement.key}`).toBe(
          requirement.kind,
        );
      }
    }
  });

  it('chaque paramètre du référentiel sert au moins à un moteur', () => {
    const used = new Set(BTP_ENGINES.flatMap((e) => e.parameters.map((p) => p.key)));
    expect(seedFile.parameters.map((p) => p.key).filter((key) => !used.has(key))).toEqual([]);
  });

  it('chaque règle publiée a son implémentation, et chaque vérification cite une règle publiée', () => {
    for (const rule of seedFile.rules) {
      const [engineId] = rule.implementation.split('/');
      expect(engines.has(engineId ?? ''), rule.implementation).toBe(true);
    }
    const produced = new Set(
      files
        .flatMap((f) => f.cases.map((c) => replay(c)))
        .flatMap((r) => r.checks.map((k) => k.rule)),
    );
    expect([...produced].sort()).toEqual(seedFile.rules.map((r) => r.code).sort());
  });
});

describe('registre et présentation', () => {
  it('les 13 moteurs s’enregistrent ; chaque sortie présentée existe dans le schéma', () => {
    const registry = new EngineRegistry();
    for (const engine of BTP_ENGINES) registry.register(engine);
    expect(registry.list()).toHaveLength(13);
    for (const engine of BTP_ENGINES) {
      expect(engine.discipline).toBe('BTP');
      const keys = engine.presentation.outputs.map((o) => o.key);
      expect(new Set(keys).size, engine.id).toBe(keys.length);
      const parsed = engine.outputSchema.parse(
        Object.fromEntries(keys.map((k) => [k, 1])),
      ) as object;
      expect(Object.keys(parsed).sort(), engine.id).toEqual([...keys].sort());
      const inputKeys = engine.presentation.inputs.map((i) => i.key);
      expect(new Set(inputKeys).size, engine.id).toBe(inputKeys.length);
    }
  });
});
