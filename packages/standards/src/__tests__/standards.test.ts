import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ParameterRequirement } from '@consulpro/calc-core';
import { describe, expect, it } from 'vitest';

import { checkOverride, resolveParameters, type SelectedVersion } from '../resolve';
import { standardFileSchema, type ParameterDefinition } from '../schema';

const demo: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../seeds/demo/demo-1.json', import.meta.url)), 'utf8'),
);

describe('format des référentiels', () => {
  it('le référentiel de démonstration est valide', () => {
    const parsed = standardFileSchema.safeParse(demo);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  const base = standardFileSchema.parse(demo);
  const withParam = (p: Record<string, unknown>) => ({ ...base, parameters: [p], rules: [] });
  const scalar = {
    key: 'x.y',
    label: 'X',
    kind: 'SCALAR',
    value: 1,
    unit: 'm',
    source: { document: 'Doc' },
    verification: 'VERIFIED',
  };

  it('accepte une table cohérente', () => {
    const table = {
      key: 't.ok',
      label: 'Table',
      kind: 'TABLE',
      table: {
        axes: [{ name: 'x', kind: 'NUMERIC', unit: 'm', values: [0, 1], lookup: 'LINEAR' }],
        unit: 'A',
        cells: [0, 10],
      },
      source: { document: 'D' },
      verification: 'VERIFIED',
    };
    expect(standardFileSchema.safeParse(withParam(table)).success).toBe(true);
  });

  it.each([
    [
      'source absente',
      withParam({ ...scalar, source: { document: ' ' } }),
      'Source documentaire obligatoire',
    ],
    ['unité inconnue', withParam({ ...scalar, unit: 'pieds' }), 'Unité inconnue'],
    ['clé invalide', withParam({ ...scalar, key: 'X Y' }), 'Clé'],
    [
      'énumération hors domaine',
      withParam({
        key: 'e',
        label: 'E',
        kind: 'ENUM',
        value: 'Z',
        allowed: ['A'],
        source: { document: 'D' },
        verification: 'VERIFIED',
      }),
      'hors des valeurs',
    ],
    [
      'table incohérente',
      withParam({
        key: 't',
        label: 'T',
        kind: 'TABLE',
        table: {
          axes: [{ name: 'x', kind: 'NUMERIC', unit: 'm', values: [2, 1], lookup: 'EXACT' }],
          unit: 'A',
          cells: [1, 2],
        },
        source: { document: 'D' },
        verification: 'VERIFIED',
      }),
      'strictement croissantes',
    ],
    [
      'paramètre en double',
      { ...base, parameters: [scalar, scalar], rules: [] },
      'Paramètre en double',
    ],
    [
      'règle sur paramètre inconnu',
      { ...base, rules: [{ ...base.rules[0], parameterKeys: ['inconnu'] }] },
      'paramètre inconnu',
    ],
    ['règle en double', { ...base, rules: [base.rules[0], base.rules[0]] }, 'Règle en double'],
    ['code en minuscules', { ...base, standard: { ...base.standard, code: 'demo' } }, 'majuscules'],
  ])('refuse : %s', (_label, file, message) => {
    const parsed = standardFileSchema.safeParse(file);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain(message);
  });
});

const parameter = (key: string, value: number, unit: 'm' | '%' | 'm2'): ParameterDefinition => ({
  key,
  label: key,
  kind: 'SCALAR',
  value,
  unit,
  source: { document: 'Référentiel A', clause: '§1' },
  verification: 'VERIFIED',
});

const versionA: SelectedVersion = {
  ref: { standardVersionId: 'va', code: 'A', version: '1' },
  parameters: [
    parameter('p.length', 3, 'm'),
    parameter('p.rate', 5, '%'),
    parameter('p.unused', 1, 'm'),
  ],
};
const versionB: SelectedVersion = {
  ref: { standardVersionId: 'vb', code: 'B', version: '2' },
  parameters: [parameter('p.area', 10, 'm2')],
};
const requirements: ParameterRequirement[] = [
  { key: 'p.length', kind: 'SCALAR', unitKind: 'length', description: 'Longueur' },
  { key: 'p.rate', kind: 'SCALAR', unitKind: 'dimensionless', description: 'Taux' },
  { key: 'p.area', kind: 'SCALAR', unitKind: 'area', description: 'Surface' },
  { key: 'p.absent', kind: 'SCALAR', optional: true, description: 'Absent' },
];

describe('résolution des paramètres', () => {
  it('valeurs du référentiel ; paramètres non déclarés ignorés ; références conservées', () => {
    const r = resolveParameters([versionA, versionB], [], requirements);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.get('p.length')).toMatchObject({ value: 3, verification: 'VERIFIED' });
    expect(r.value.get('p.area')).toMatchObject({ value: 10 });
    expect(r.value.get('p.unused')).toBeUndefined();
    expect(r.value.standards.map((s) => s.code)).toEqual(['A', 'B']);
  });

  it('priorité : projet > organisation > référentiel ; la surcharge passe « à vérifier »', () => {
    const r = resolveParameters(
      [versionA],
      [
        {
          scope: 'ORGANIZATION',
          standardVersionId: 'va',
          key: 'p.rate',
          value: { kind: 'SCALAR', value: 6, unit: '%' },
          justification: 'Pratique du bureau',
        },
        {
          scope: 'PROJECT',
          standardVersionId: 'va',
          key: 'p.rate',
          value: { kind: 'SCALAR', value: 8, unit: '%' },
          justification: 'Exigence du maître d’ouvrage',
        },
        {
          scope: 'ORGANIZATION',
          standardVersionId: 'va',
          key: 'p.length',
          value: { kind: 'SCALAR', value: 2500, unit: 'mm' },
          justification: 'Valeur interne',
        },
      ],
      requirements,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.get('p.rate')).toMatchObject({
      value: 8,
      verification: 'TO_VERIFY',
      override: {
        scope: 'PROJECT',
        justification: 'Exigence du maître d’ouvrage',
        referenceValue: { value: 5, unit: '%' },
      },
    });
    expect(r.value.get('p.rate')?.source.note).toContain('Valeur surchargée');
    expect(r.value.get('p.length')).toMatchObject({
      value: 2500,
      unit: 'mm',
      override: { scope: 'ORGANIZATION' },
    });
  });

  it('une surcharge d’une autre version de référentiel est sans effet', () => {
    const r = resolveParameters(
      [versionA],
      [
        {
          scope: 'PROJECT',
          standardVersionId: 'autre',
          key: 'p.rate',
          value: { kind: 'SCALAR', value: 9, unit: '%' },
          justification: 'Hors sujet',
        },
      ],
      requirements,
    );
    expect(r.ok && r.value.get('p.rate')).toMatchObject({ value: 5 });
  });

  it('refus : ambiguïté, surcharge incompatible ou non justifiée', () => {
    const ambiguous = resolveParameters(
      [versionA, { ...versionB, parameters: [parameter('p.rate', 7, '%')] }],
      [],
      requirements,
    );
    expect(ambiguous).toMatchObject({
      ok: false,
      error: [{ key: 'p.rate', code: 'PARAMETER_AMBIGUOUS' }],
    });

    const incompatible = resolveParameters(
      [versionA],
      [
        {
          scope: 'PROJECT',
          standardVersionId: 'va',
          key: 'p.length',
          value: { kind: 'SCALAR', value: 1, unit: 'kg' },
          justification: 'Erreur',
        },
      ],
      requirements,
    );
    expect(incompatible).toMatchObject({ ok: false, error: [{ code: 'OVERRIDE_INCOMPATIBLE' }] });

    const wrongKind = resolveParameters(
      [versionA],
      [
        {
          scope: 'PROJECT',
          standardVersionId: 'va',
          key: 'p.length',
          value: { kind: 'ENUM', value: 'A', allowed: ['A'] },
          justification: 'Erreur',
        },
      ],
      requirements,
    );
    expect(wrongKind).toMatchObject({ ok: false, error: [{ code: 'OVERRIDE_INCOMPATIBLE' }] });

    const unjustified = resolveParameters(
      [versionA],
      [
        {
          scope: 'PROJECT',
          standardVersionId: 'va',
          key: 'p.rate',
          value: { kind: 'SCALAR', value: 9, unit: '%' },
          justification: ' ',
        },
      ],
      requirements,
    );
    expect(unjustified).toMatchObject({ ok: false, error: [{ code: 'OVERRIDE_UNJUSTIFIED' }] });
  });

  it('énumérations et tables : surcharge compatible acceptée, valeur invalide refusée', () => {
    const enumVersion: SelectedVersion = {
      ref: { standardVersionId: 've', code: 'E', version: '1' },
      parameters: [
        {
          key: 'p.mode',
          label: 'Mode',
          kind: 'ENUM',
          value: 'A',
          allowed: ['A', 'B'],
          source: { document: 'D' },
          verification: 'VERIFIED',
        },
        {
          key: 'p.table',
          label: 'Table',
          kind: 'TABLE',
          table: {
            axes: [{ name: 'x', kind: 'NUMERIC', unit: 'm', values: [0, 1], lookup: 'LINEAR' }],
            unit: 'A',
            cells: [0, 10],
          },
          source: { document: 'D' },
          verification: 'VERIFIED',
        },
      ],
    };
    const reqs: ParameterRequirement[] = [
      { key: 'p.mode', kind: 'ENUM', description: 'Mode' },
      { key: 'p.table', kind: 'TABLE', unitKind: 'current', description: 'Table' },
    ];
    const r = resolveParameters(
      [enumVersion],
      [
        {
          scope: 'ORGANIZATION',
          standardVersionId: 've',
          key: 'p.mode',
          value: { kind: 'ENUM', value: 'B', allowed: ['A', 'B'] },
          justification: 'Choix interne',
        },
      ],
      reqs,
    );
    expect(r.ok && r.value.get('p.mode')).toMatchObject({ value: 'B' });
    expect(r.ok && r.value.get('p.table')?.kind).toBe('TABLE');

    const tableOverride = resolveParameters(
      [enumVersion],
      [
        {
          scope: 'PROJECT',
          standardVersionId: 've',
          key: 'p.table',
          value: {
            kind: 'TABLE',
            table: {
              axes: [{ name: 'x', kind: 'NUMERIC', unit: 'm', values: [0, 1], lookup: 'LINEAR' }],
              unit: 'A',
              cells: [0, 12],
            },
          },
          justification: 'Table du fabricant',
        },
      ],
      reqs,
    );
    expect(tableOverride.ok && tableOverride.value.get('p.table')?.override?.scope).toBe('PROJECT');

    const outside = resolveParameters(
      [enumVersion],
      [
        {
          scope: 'ORGANIZATION',
          standardVersionId: 've',
          key: 'p.mode',
          value: { kind: 'ENUM', value: 'Z', allowed: ['Z'] },
          justification: 'Erreur',
        },
      ],
      reqs,
    );
    expect(outside).toMatchObject({ ok: false, error: [{ code: 'OVERRIDE_INCOMPATIBLE' }] });

    const invalid = resolveParameters(
      [{ ...versionA, parameters: [{ ...parameter('p.length', Number.NaN, 'm') }] }],
      [],
      requirements,
    );
    expect(invalid).toMatchObject({ ok: false, error: [{ code: 'PARAMETER_INVALID' }] });
  });
});

describe('checkOverride', () => {
  const rate = parameter('p.rate', 5, '%');

  it('accepte une valeur compatible et justifiée', () => {
    expect(checkOverride(rate, { kind: 'SCALAR', value: 6, unit: '%' }, 'Essai')).toEqual({
      ok: true,
      value: { kind: 'SCALAR', value: 6, unit: '%' },
    });
  });

  it.each([
    [
      'valeur mal formée',
      { kind: 'SCALAR', value: 6, unit: 'pieds' },
      'Essai',
      'PARAMETER_INVALID',
    ],
    ['type inconnu', { kind: 'AUTRE' }, 'Essai', 'PARAMETER_INVALID'],
    ['sans justification', { kind: 'SCALAR', value: 6, unit: '%' }, '  ', 'OVERRIDE_UNJUSTIFIED'],
    [
      'grandeur différente',
      { kind: 'SCALAR', value: 6, unit: 'm' },
      'Essai',
      'OVERRIDE_INCOMPATIBLE',
    ],
  ])('refuse : %s', (_label, value, justification, code) => {
    expect(checkOverride(rate, value, justification)).toMatchObject({ ok: false, error: { code } });
  });
});

describe('référentiel BTP « Usages courants — métré »', () => {
  it('est valide et entièrement « à vérifier », chaque valeur étant sourcée', () => {
    const raw: unknown = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../seeds/btp/usages-metre-1.json', import.meta.url)),
        'utf8',
      ),
    );
    const parsed = standardFileSchema.safeParse(raw);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.standard).toMatchObject({ code: 'BTP-USAGES-METRE', discipline: 'BTP' });
    expect(parsed.data.parameters.every((p) => p.verification === 'TO_VERIFY')).toBe(true);
    expect(parsed.data.parameters.every((p) => p.source.document.length > 0)).toBe(true);
  });
});
