import { describe, expect, it } from 'vitest';

import { toCalculationView } from '../calculations/presenter';
import type { RevisionRecord } from '../ports-calculations';

const base: RevisionRecord = {
  id: 'r1',
  calculationId: 'c1',
  organizationId: 'o1',
  projectId: 'p1',
  number: 1,
  resultStatus: 'ERROR',
  workflowStatus: 'COMPUTED',
  authorId: 'u1',
  authorName: 'Auteur',
  createdAt: new Date('2026-10-09T10:00:00Z'),
  engineId: 'test.engine',
  engineVersion: '1.0.0',
  standards: [{ standardVersionId: 'v1', code: 'STD', version: '2' }],
  parameterSnapshot: [
    {
      key: 'p.table',
      value: {
        kind: 'TABLE',
        table: {
          axes: [{ name: 'x', kind: 'CATEGORY', values: ['a', 'b'] }],
          unit: '1',
          cells: [1, 2],
        },
      },
      source: { document: 'Doc', clause: '§2', table: 'T1', note: 'n' },
      verification: 'VERIFIED',
      used: false,
    },
    {
      key: 'p.mode',
      value: { kind: 'ENUM', value: 'B', allowed: ['A', 'B'] },
      source: { document: 'Doc' },
      verification: 'TO_VERIFY',
      used: true,
      override: {
        referenceValue: { kind: 'ENUM', value: 'A', allowed: ['A', 'B'] },
        justification: 'Choix du bureau',
        scope: 'ORGANIZATION',
      },
    },
  ],
  parameterSnapshotHash: 'h',
  rawInputs: { mode: 'B', count: 3, flag: true, missing: undefined },
  inputs: null,
  outputs: null,
  checks: [{ rule: 'r', label: 'Règle', status: 'NOT_APPLICABLE', severity: 'INFO' }],
  warnings: [],
  hypotheses: [{ code: 'H', text: 'Valeur par défaut', origin: 'DEFAULT_VALUE', field: 'count' }],
  trace: [
    { id: 'T1', label: 'Étape', substitutions: [{ symbol: 'k', value: 2 }], value: 'x' },
    { id: 'T2', label: 'Étape 2', formula: 'a=b', unit: 'm', note: 'note', source: 'src' },
  ],
  errors: [],
  failure: { code: 'ENGINE_EXCEPTION', message: 'panne' },
  presentation: {
    title: 'Moteur de test',
    description: '',
    parameters: [{ key: 'p.mode', label: 'Mode' }],
    inputs: [
      {
        key: 'mode',
        label: 'Mode',
        kind: 'enum',
        options: [
          { value: 'A', label: 'Option A' },
          { value: 'B', label: 'Option B' },
        ],
      },
      { key: 'count', label: 'Nombre', kind: 'quantity', unitKind: 'dimensionless', units: ['1'] },
      { key: 'flag', label: 'Drapeau', kind: 'enum', options: [] },
      { key: 'missing', label: 'Absent', kind: 'quantity', unitKind: 'length', units: ['m'] },
    ],
    outputs: [{ key: 'x', label: 'X', unit: 'm', precision: 2 }],
  },
};

describe('présentateur CalculationResult → CalculationView', () => {
  it('reconstruit la vue à partir du résultat enregistré, sans calcul', () => {
    const view = toCalculationView(base);
    expect(view).toMatchObject({
      engine: { id: 'test.engine', version: '1.0.0', title: 'Moteur de test' },
      status: 'ERROR',
      preview: false,
      standards: [{ code: 'STD', version: '2' }],
      outputs: [],
      failure: { code: 'ENGINE_EXCEPTION' },
    });
    expect(view.inputs).toEqual([
      { key: 'mode', label: 'Mode', value: 'Option B', defaulted: false },
      { key: 'count', label: 'Nombre', value: 3, defaulted: true },
      { key: 'flag', label: 'Drapeau', value: true, defaulted: false },
      { key: 'missing', label: 'Absent', value: null, defaulted: false },
    ]);
    expect(view.parameters).toEqual([
      {
        key: 'p.table',
        label: 'p.table',
        kind: 'TABLE',
        value: 'Table (2 valeurs)',
        source: { document: 'Doc', clause: '§2', table: 'T1', note: 'n' },
        verification: 'VERIFIED',
        used: false,
      },
      {
        key: 'p.mode',
        label: 'Mode',
        kind: 'ENUM',
        value: 'B',
        source: { document: 'Doc' },
        verification: 'TO_VERIFY',
        used: true,
        override: { referenceValue: 'A', justification: 'Choix du bureau', scope: 'ORGANIZATION' },
      },
    ]);
    expect(view.checks).toEqual([
      { rule: 'r', label: 'Règle', status: 'NOT_APPLICABLE', severity: 'INFO' },
    ]);
    expect(view.trace).toEqual([
      { id: 'T1', label: 'Étape', substitutions: [{ symbol: 'k', value: 2 }], value: 'x' },
      { id: 'T2', label: 'Étape 2', formula: 'a=b', unit: 'm', source: 'src', note: 'note' },
    ]);
    expect(view.units).toEqual({ m: 'm' });
  });

  it('sorties non numériques ignorées', () => {
    const view = toCalculationView({
      ...base,
      resultStatus: 'OK',
      failure: null,
      outputs: { x: 'texte' },
    });
    expect(view.outputs).toEqual([]);
  });
});
