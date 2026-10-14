import { isBreakdown } from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';

import { PLUMBING_ENGINES, PLUMBING_REFERENCE_CASES } from '../index';
import { engineOf, engines, files, replay } from './cases';
import { PUBLISHED, RULES } from './seed';

/* Cas de référence rejoués sur les référentiels publiés (chargement : ./cases.ts). */

describe('cas de référence Plomberie', () => {
  it('un fichier par moteur de plomberie, nommé d’après le moteur', () => {
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
      expect(PLUMBING_REFERENCE_CASES[file.engine], file.engine).toEqual({
        total: file.cases.length,
        checked: file.cases.filter((c) => c.source.checkedBy !== null).length,
      });
      expect(engineOf(file.engine).referenceCases).toEqual(PLUMBING_REFERENCE_CASES[file.engine]);
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
          if (c.expected.resultStatus === 'ERROR') {
            expect(result.failure?.code).toBe(c.expected.failure);
            expect(result.outputs).toBeNull();
            return;
          }
          const outputs = result.outputs as Record<string, unknown>;
          // Toutes les sorties du moteur sont attendues : aucune n'échappe au calcul de référence.
          expect(Object.keys(c.expected.outputs).sort()).toEqual(Object.keys(outputs).sort());
          for (const [key, expected] of Object.entries(c.expected.outputs)) {
            const actual = outputs[key];
            if (Array.isArray(expected)) {
              expect(isBreakdown(actual), key).toBe(true);
              const entries = actual as { key: string; value: number }[];
              expect(
                entries.map((e) => e.key),
                key,
              ).toEqual(expected.map((e) => e.key));
              entries.forEach((entry, k) => {
                const want = expected[k];
                if (!want) return;
                expect(
                  Math.abs(entry.value - want.value),
                  `${key}.${entry.key}`,
                ).toBeLessThanOrEqual(want.tolerance);
              });
              continue;
            }
            const value = typeof actual === 'number' ? actual : Number.NaN;
            expect(
              Math.abs(value - expected.value),
              `${key} : ${String(value)} au lieu de ${String(expected.value)}`,
            ).toBeLessThanOrEqual(expected.tolerance);
          }
          expect(result.checks.map((k) => ({ rule: k.rule, status: k.status }))).toEqual(
            c.expected.checks,
          );
          expect(result.hypotheses.map((h) => h.code).sort()).toEqual(c.expected.hypotheses);
          // Référentiels « à vérifier » : chaque paramètre lu est signalé ; aucun autre avertissement.
          expect(result.warnings.every((w) => w.code === 'PARAMETER_TO_VERIFY')).toBe(true);
          expect(result.warnings.length > 0).toBe(result.parameters.some((p) => p.used));
        });
      }
    });
  }
});

describe('moteurs de plomberie ↔ référentiels', () => {
  it('chaque paramètre exigé existe dans un référentiel, du même type', () => {
    const byKey = new Map(PUBLISHED.map((p) => [p.key, p]));
    for (const engine of PLUMBING_ENGINES) {
      for (const requirement of engine.parameters) {
        expect(byKey.get(requirement.key)?.kind, `${engine.id} → ${requirement.key}`).toBe(
          requirement.kind,
        );
      }
    }
  });

  it('chaque paramètre des référentiels sert au moins à un moteur', () => {
    const used = new Set(PLUMBING_ENGINES.flatMap((e) => e.parameters.map((p) => p.key)));
    expect(PUBLISHED.map((p) => p.key).filter((key) => !used.has(key))).toEqual([]);
  });

  it('chaque règle publiée a son implémentation, et chaque vérification cite une règle publiée', () => {
    for (const rule of RULES) {
      const [engineId] = rule.implementation.split('/');
      expect(engines.has(engineId ?? ''), rule.implementation).toBe(true);
    }
    const produced = new Set(
      files
        .flatMap((f) => f.cases.map((c) => replay(c)))
        .flatMap((r) => r.checks.map((k) => k.rule)),
    );
    expect([...produced].sort()).toEqual(RULES.map((r) => r.code).sort());
  });
});
