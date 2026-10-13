import { describe, expect, it } from 'vitest';

import { ELEC_ENGINES, ELEC_REFERENCE_CASES } from '../index';
import { engineOf, engines, files, replay } from './cases';
import { NFC, UTE } from './seed';

/* Cas de référence rejoués sur les référentiels publiés (chargement : ./cases.ts). */

describe('cas de référence Électricité', () => {
  it('un fichier par moteur électrique, nommé d’après le moteur', () => {
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
      expect(ELEC_REFERENCE_CASES[file.engine], file.engine).toEqual({
        total: file.cases.length,
        checked: file.cases.filter((c) => c.source.checkedBy !== null).length,
      });
      expect(engineOf(file.engine).referenceCases).toEqual(ELEC_REFERENCE_CASES[file.engine]);
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
          // Référentiels « à vérifier » : chaque paramètre lu est signalé ; aucun autre avertissement.
          expect(result.warnings.every((w) => w.code === 'PARAMETER_TO_VERIFY')).toBe(true);
          expect(result.warnings.length > 0).toBe(result.parameters.some((p) => p.used));
        });
      }
    });
  }
});

describe('moteurs électriques ↔ référentiels NF C 15-100 et UTE C 15-105', () => {
  const published = [...NFC.parameters, ...UTE.parameters];

  it('chaque paramètre exigé existe dans un référentiel, du même type', () => {
    const byKey = new Map(published.map((p) => [p.key, p]));
    for (const engine of ELEC_ENGINES) {
      for (const requirement of engine.parameters) {
        expect(byKey.get(requirement.key)?.kind, `${engine.id} → ${requirement.key}`).toBe(
          requirement.kind,
        );
      }
    }
  });

  it('chaque paramètre des référentiels sert au moins à un moteur', () => {
    const used = new Set(ELEC_ENGINES.flatMap((e) => e.parameters.map((p) => p.key)));
    expect(published.map((p) => p.key).filter((key) => !used.has(key))).toEqual([]);
  });

  it('chaque règle publiée a son implémentation, et chaque vérification cite une règle publiée', () => {
    const rules = [...NFC.rules, ...UTE.rules];
    for (const rule of rules) {
      const [engineId] = rule.implementation.split('/');
      expect(engines.has(engineId ?? ''), rule.implementation).toBe(true);
    }
    const produced = new Set(
      files
        .flatMap((f) => f.cases.map((c) => replay(c)))
        .flatMap((r) => r.checks.map((k) => k.rule)),
    );
    expect([...produced].sort()).toEqual(rules.map((r) => r.code).sort());
  });
});
