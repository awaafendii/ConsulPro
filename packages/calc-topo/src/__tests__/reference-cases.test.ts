import { describe, expect, it } from 'vitest';

import { TOPO_REFERENCE_CASES } from '../index';
import { engineOf, engines, files, replay } from './cases';

/* Cas de référence topographiques rejoués sur les tolérances publiées (chargement : ./cases.ts). */

describe('cas de référence Topographie', () => {
  it('un fichier par moteur topographique, nommé d’après le moteur', () => {
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

  it('le décompte exposé à l’interface (moteur « contre-vérifié » ou non) suit les fichiers', () => {
    for (const file of files) {
      expect(TOPO_REFERENCE_CASES[file.engine], file.engine).toEqual({
        total: file.cases.length,
        checked: file.cases.filter((c) => c.source.checkedBy !== null).length,
      });
      expect(engineOf(file.engine).referenceCases).toEqual(TOPO_REFERENCE_CASES[file.engine]);
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
            expect(result.failure?.code).toBe(c.expected.failure.code);
            return;
          }
          const outputs = result.outputs as Record<string, number | null>;
          // Toutes les sorties du moteur sont attendues : aucune n'échappe au calcul manuel.
          expect(Object.keys(c.expected.outputs).sort()).toEqual(Object.keys(outputs).sort());
          for (const [key, { value, tolerance }] of Object.entries(c.expected.outputs)) {
            const actual = outputs[key] ?? null;
            if (value === null) {
              expect(actual, `${key} attendu nul`).toBeNull();
              continue;
            }
            expect(actual, `${key} inattendu nul`).not.toBeNull();
            expect(
              Math.abs((actual ?? Number.NaN) - value),
              `${key} : ${String(actual)} au lieu de ${String(value)}`,
            ).toBeLessThanOrEqual(tolerance);
          }
          expect(result.checks.map((k) => ({ rule: k.rule, status: k.status }))).toEqual(
            c.expected.checks,
          );
          expect(result.hypotheses.map((h) => h.code).sort()).toEqual(c.expected.hypotheses);
        });
      }
    });
  }
});
