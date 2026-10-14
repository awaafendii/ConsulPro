import type { OutputPresentation } from '@consulpro/calc-core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  BREAKDOWN_WORK_PATTERN,
  boqTotals,
  boqUnitOf,
  computedLines,
  groupLines,
  isBoqPresentation,
  isPlanEmpty,
  lineAmount,
  materialBreakdown,
  planPriceApplication,
  planSync,
  validateAmount,
  validateDesignation,
  validateOverride,
  workKeyOf,
  type ComputedLine,
  type TakeoffSource,
} from '../quantities/boq';
import { CURRENCY_CODES, currencyDecimals, isCurrency } from '../quantities/currency';
import {
  decimalFromNumber,
  formatDecimal,
  isStorableDecimal,
  multiplyDecimal,
  parseDecimal,
  roundDecimal,
  sumDecimals,
} from '../quantities/decimal';
import {
  ancestorsOf,
  checkNesting,
  compareNodeCodes,
  orderTree,
  validateNodeCode,
} from '../quantities/takeoff';

const dec = (text: string) => {
  const parsed = parseDecimal(text);
  if (!parsed.ok) throw new Error(text);
  return parsed.value;
};

describe('décimaux exacts', () => {
  it('lit et écrit sans perte, sans zéros superflus', () => {
    expect(dec('12')).toBe(120_000n);
    expect(dec('12.5')).toBe(125_000n);
    expect(dec('0.0004')).toBe(4n);
    expect(formatDecimal(dec('12.5000'))).toBe('12.5');
    expect(formatDecimal(dec('1250'))).toBe('1250');
    expect(formatDecimal(0n)).toBe('0');
    expect(formatDecimal(-125_000n)).toBe('-12.5');
  });

  it('refuse les écritures ambiguës ou hors NUMERIC(18,4)', () => {
    for (const text of ['', '-1', '1,5', '1e3', '12.34567', '.5', '1.', '123456789012345', 'abc']) {
      expect(parseDecimal(text).ok, text).toBe(false);
    }
    expect(parseDecimal(' 7.25 ').ok).toBe(true);
  });

  it('arrondit au pair le plus proche (arrondi bancaire)', () => {
    expect(formatDecimal(roundDecimal(dec('2.5'), 0))).toBe('2');
    expect(formatDecimal(roundDecimal(dec('3.5'), 0))).toBe('4');
    expect(formatDecimal(roundDecimal(dec('2.51'), 0))).toBe('3');
    expect(formatDecimal(roundDecimal(dec('0.125'), 2))).toBe('0.12');
    expect(formatDecimal(roundDecimal(dec('0.135'), 2))).toBe('0.14');
    expect(formatDecimal(roundDecimal(-25_000n, 0))).toBe('-2');
    expect(formatDecimal(roundDecimal(-35_000n, 0))).toBe('-4');
    expect(formatDecimal(roundDecimal(-35_001n, 0))).toBe('-4');
  });

  it('multiplie exactement, puis arrondit à la précision demandée', () => {
    // 0,1 × 0,2 : exact (0,02), là où le flottant donne 0,020000000000000004.
    expect(formatDecimal(multiplyDecimal(dec('0.1'), dec('0.2'), 4))).toBe('0.02');
    // 12,345 m³ × 65 000 F = 802 425 F.
    expect(formatDecimal(multiplyDecimal(dec('12.345'), dec('65000'), 0))).toBe('802425');
    // 1,5 × 0,5 € = 0,75 € ; 0,125 × 1 € = 0,12 € (pair) ; 0,375 × 1 € = 0,38 €.
    expect(formatDecimal(multiplyDecimal(dec('1.5'), dec('0.5'), 2))).toBe('0.75');
    expect(formatDecimal(multiplyDecimal(dec('0.125'), dec('1'), 2))).toBe('0.12');
    expect(formatDecimal(multiplyDecimal(dec('0.375'), dec('1'), 2))).toBe('0.38');
  });

  it('convertit une quantité calculée à la précision du moteur', () => {
    expect(decimalFromNumber(12.3456789, 3)).toBe(dec('12.346'));
    expect(decimalFromNumber(2.5, 0)).toBe(dec('3')); // toFixed : arrondi de la valeur binaire
    expect(decimalFromNumber(1 / 3, 6)).toBe(dec('0.3333')); // 4 décimales au plus
    expect(decimalFromNumber(-1, 2)).toBeNull();
    expect(decimalFromNumber(Number.NaN, 2)).toBeNull();
    expect(decimalFromNumber(1e15, 2)).toBeNull();
    expect(() => decimalFromNumber(1, 7.5)).toThrow(RangeError);
  });

  it('propriété : écrire puis relire rend la même valeur', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 18n - 1n }), (value) => {
        expect(dec(formatDecimal(value))).toBe(value);
        expect(isStorableDecimal(value)).toBe(true);
      }),
    );
  });

  it('propriété : l’arrondi est à moins d’une demi-unité, et idempotent', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 16n }),
        fc.integer({ min: 0, max: 4 }),
        (value, decimals) => {
          const rounded = roundDecimal(value, decimals);
          const half = 10n ** BigInt(4 - decimals) / 2n;
          const gap = rounded > value ? rounded - value : value - rounded;
          expect(gap <= half).toBe(true);
          expect(roundDecimal(rounded, decimals)).toBe(rounded);
        },
      ),
    );
  });

  it('propriété : la somme est exacte et ne dépend pas de l’ordre', () => {
    fc.assert(
      fc.property(fc.array(fc.bigInt({ min: 0n, max: 10n ** 14n })), (values) => {
        expect(sumDecimals(values)).toBe(sumDecimals([...values].reverse()));
      }),
    );
  });
});

describe('devises', () => {
  it('décimales ISO 4217 de l’unité monétaire', () => {
    expect(currencyDecimals('XOF')).toBe(0);
    expect(currencyDecimals('XAF')).toBe(0);
    expect(currencyDecimals('EUR')).toBe(2);
    expect(CURRENCY_CODES).toContain('XOF');
    expect(isCurrency('XOF')).toBe(true);
    expect(isCurrency('ABC')).toBe(false);
    expect(isCurrency('toString')).toBe(false);
  });
});

describe('avant-métré', () => {
  it('lot à la racine, niveau dans un lot, ouvrage dans un lot ou un niveau', () => {
    expect(checkNesting(null, 'LOT').ok).toBe(true);
    expect(checkNesting('LOT', 'LEVEL').ok).toBe(true);
    expect(checkNesting('LOT', 'ELEMENT').ok).toBe(true);
    expect(checkNesting('LEVEL', 'ELEMENT').ok).toBe(true);
    for (const [parent, child] of [
      [null, 'LEVEL'],
      [null, 'ELEMENT'],
      ['LOT', 'LOT'],
      ['LEVEL', 'LEVEL'],
      ['LEVEL', 'LOT'],
      ['ELEMENT', 'ELEMENT'],
    ] as const) {
      expect(checkNesting(parent, child)).toMatchObject({
        ok: false,
        error: { code: 'TAKEOFF_NESTING_INVALID' },
      });
    }
  });

  it('codes de nœuds', () => {
    expect(validateNodeCode(' 2.1 ')).toEqual({ ok: true, value: '2.1' });
    expect(validateNodeCode('GO-A_1').ok).toBe(true);
    for (const code of ['', ' ', '.1', 'a b', 'x'.repeat(21), 'é']) {
      expect(validateNodeCode(code).ok, code).toBe(false);
    }
  });

  it('ordre naturel des codes et parcours en profondeur', () => {
    expect(['10', '2', '1.10', '1.2', '1'].sort(compareNodeCodes)).toEqual([
      '1',
      '1.2',
      '1.10',
      '2',
      '10',
    ]);
    const nodes = [
      { id: 'b', parentId: null, code: '2' },
      { id: 'a2', parentId: 'a', code: '1.10' },
      { id: 'a', parentId: null, code: '1' },
      { id: 'a1', parentId: 'a', code: '1.2' },
      { id: 'a11', parentId: 'a1', code: 'x' },
      { id: 'orphan', parentId: 'missing', code: '0' },
    ];
    expect(orderTree(nodes).map((n) => `${n.id}:${String(n.depth)}`)).toEqual([
      'a:0',
      'a1:1',
      'a11:2',
      'a2:1',
      'b:0',
    ]);
    expect(ancestorsOf(nodes, 'a11')).toEqual(['a1', 'a']);
    expect(ancestorsOf(nodes, 'a')).toEqual([]);
  });
});

const out = (
  key: string,
  family: OutputPresentation['family'],
  unit: OutputPresentation['unit'] = 'm3',
  extra: Partial<OutputPresentation> = {},
): OutputPresentation => ({
  key,
  label: key.toUpperCase(),
  unit,
  precision: 3,
  ...(family ? { family } : {}),
  ...extra,
});

const footing = (overrides: Partial<TakeoffSource> = {}): TakeoffSource => ({
  calculationId: 'c1',
  calculationTitle: 'Semelles S1',
  engineId: 'btp.footings',
  nodeId: 'lot1',
  revision: {
    id: 'r1',
    resultStatus: 'OK',
    outputs: { concrete: 2.1234, formwork: 0, steel: 120.04, cement: 700, note: 'x' },
    outputPresentations: [
      out('concrete', 'CONCRETE'),
      out('formwork', 'FORMWORK', 'm2'),
      out('steel', 'STEEL', 'kg', { precision: 1 }),
      out('cement', 'MATERIAL', 'kg', { additive: true }),
      out('note', undefined),
    ],
  },
  ...overrides,
});

describe('lignes calculées', () => {
  it('une sortie d’ouvrage non nulle donne une ligne, à la précision du moteur', () => {
    expect(computedLines([footing()])).toEqual([
      {
        nodeId: 'lot1',
        calculationId: 'c1',
        outputKey: 'concrete',
        outputPart: '',
        groupDesignation: null,
        sourceRevisionId: 'r1',
        workKey: 'btp.footings.concrete',
        designation: 'Semelles S1 — CONCRETE',
        unit: 'm3',
        quantity: dec('2.123'),
      },
      {
        nodeId: 'lot1',
        calculationId: 'c1',
        outputKey: 'steel',
        outputPart: '',
        groupDesignation: null,
        sourceRevisionId: 'r1',
        workKey: 'btp.footings.steel',
        designation: 'Semelles S1 — STEEL',
        unit: 'kg',
        quantity: dec('120'),
      },
    ]);
  });

  it('aucune ligne sans révision, sans résultat ou en erreur', () => {
    expect(computedLines([footing({ revision: null })])).toEqual([]);
    const base = footing().revision!;
    expect(computedLines([footing({ revision: { ...base, outputs: null } })])).toEqual([]);
    expect(computedLines([footing({ revision: { ...base, resultStatus: 'ERROR' } })])).toEqual([]);
    expect(
      computedLines([footing({ revision: { ...base, resultStatus: 'NON_COMPLIANT' } })]),
    ).toHaveLength(2);
  });

  it('unités reprises', () => {
    expect(boqUnitOf('1')).toBe('u');
    expect(boqUnitOf('m3')).toBe('m3');
    expect(boqUnitOf('L')).toBe('L');
    expect(boqUnitOf('ff')).toBeNull();
    expect(boqUnitOf('kN')).toBeNull();
  });
});

describe('sorties ventilées (décision Q9)', () => {
  const pipes = (entries: unknown) =>
    computedLines([
      {
        calculationId: 'c2',
        calculationTitle: 'Réseau EF',
        engineId: 'plumbing.supply-network',
        nodeId: 'lot2',
        revision: {
          id: 'r2',
          resultStatus: 'OK',
          outputs: { pipes: entries, flow: 1.2 },
          outputPresentations: [
            out('pipes', 'PIPES', 'm', { precision: 2, breakdown: true }),
            out('flow', undefined, 'L/s'),
          ],
        },
      },
    ]);
  const entry = (key: string, label: string, value: number) => ({
    key,
    label,
    group: 'PVC_PN16',
    groupLabel: 'Tube PVC pression PN16',
    value,
  });

  it('une ligne par entrée, ouvrage suffixé par l’entrée, groupe désigné', () => {
    const lines = pipes([
      entry('PVC_PN16-32', 'Tube PVC Ø32', 48.204),
      entry('PVC_PN16-20', 'Tube PVC Ø20', 0),
    ]);
    expect(lines).toEqual([
      expect.objectContaining({
        outputKey: 'pipes',
        outputPart: 'PVC_PN16-32',
        workKey: 'plumbing.supply-network.pipes:PVC_PN16-32',
        designation: 'Réseau EF — Tube PVC Ø32',
        groupDesignation: 'Réseau EF — Tube PVC pression PN16',
        unit: 'm',
        quantity: dec('48.2'),
      }),
    ]);
    expect(lines[0]?.workKey).toMatch(BREAKDOWN_WORK_PATTERN);
    expect(workKeyOf('btp.footings', 'concrete')).not.toMatch(BREAKDOWN_WORK_PATTERN);
  });

  it('une ventilation mal formée est ignorée, jamais additionnée', () => {
    expect(pipes([{ key: 'x', value: 3 }])).toEqual([]);
    expect(pipes(12)).toEqual([]);
  });

  it('présentation agrégée : quantités et montants additionnés par groupe', () => {
    const line = (
      id: string,
      groupDesignation: string | null,
      quantity: string,
      price: string | null,
    ) => ({
      id,
      nodeId: 'lot2',
      calculationId: groupDesignation === null ? null : 'c2',
      outputKey: groupDesignation === null ? null : 'pipes',
      groupDesignation,
      unit: 'm',
      quantity: dec(quantity),
      overrideQuantity: null,
      unitPrice: price === null ? null : dec(price),
    });
    const groups = groupLines(
      [
        line('a', 'Réseau EF — Tube PVC', '10', '1000'),
        line('b', 'Réseau EF — Tube PVC', '5.5', null),
        line('c', 'Réseau EF — Tube PPR', '2', '3000'),
        line('d', null, '1', '50'),
      ],
      'GNF',
    );
    expect(
      groups.map((g) => [g.designation, g.quantity, g.amount, g.lines, g.unpriced, g.itemIds]),
    ).toEqual([
      ['Réseau EF — Tube PVC', dec('15.5'), dec('10000'), 2, 1, ['a', 'b']],
      ['Réseau EF — Tube PPR', dec('2'), dec('6000'), 1, 0, ['c']],
    ]);
    expect(isBoqPresentation('AGGREGATED')).toBe(true);
    expect(isBoqPresentation('SUMMARY')).toBe(false);
  });
});

describe('mise à jour depuis l’avant-métré', () => {
  const line = (patch: Partial<ComputedLine> = {}): ComputedLine => ({
    nodeId: 'lot1',
    calculationId: 'c1',
    outputKey: 'concrete',
    outputPart: '',
    groupDesignation: null,
    sourceRevisionId: 'r1',
    workKey: 'btp.footings.concrete',
    designation: 'Semelles — Béton',
    unit: 'm3',
    quantity: dec('2'),
    ...patch,
  });

  it('ajoute, met à jour, retire ; laisse les lignes identiques', () => {
    const existing = [
      { ...line(), id: 'i1' },
      { ...line({ outputKey: 'steel', unit: 'kg' }), id: 'i2' },
      { ...line({ calculationId: 'c9' }), id: 'i3' },
    ];
    const plan = planSync(existing, [
      line(),
      line({ outputKey: 'steel', unit: 'kg', quantity: dec('3'), sourceRevisionId: 'r2' }),
      line({ calculationId: 'c2' }),
    ]);
    expect(plan.unchanged).toBe(1);
    expect(plan.update).toEqual([
      {
        id: 'i2',
        line: line({ outputKey: 'steel', unit: 'kg', quantity: dec('3'), sourceRevisionId: 'r2' }),
      },
    ]);
    expect(plan.add).toEqual([line({ calculationId: 'c2' })]);
    expect(plan.remove).toEqual(['i3']);
  });

  it('propriété : appliquer le plan rend le quantitatif conforme, et un second plan est vide', () => {
    const arbLine = fc.record({
      calculationId: fc.constantFrom('c1', 'c2', 'c3'),
      outputKey: fc.constantFrom('concrete', 'steel', 'formwork'),
      nodeId: fc.constantFrom('n1', 'n2'),
      sourceRevisionId: fc.constantFrom('r1', 'r2'),
      quantity: fc.bigInt({ min: 1n, max: 10n ** 8n }),
    });
    const unique = (lines: ComputedLine[]) => [
      ...new Map(lines.map((l) => [`${l.calculationId}|${l.outputKey}`, l])).values(),
    ];
    const toLine = (l: Partial<ComputedLine>) => line(l);
    fc.assert(
      fc.property(fc.array(arbLine), fc.array(arbLine), (before, after) => {
        const existing = unique(before.map(toLine)).map((l, i) => ({ ...l, id: `i${String(i)}` }));
        const target = unique(after.map(toLine));
        const plan = planSync(existing, target);
        const removed = new Set(plan.remove);
        const updated = new Map(plan.update.map((u) => [u.id, u.line]));
        const result = [
          ...existing
            .filter((e) => !removed.has(e.id))
            .map((e) => ({ ...(updated.get(e.id) ?? e), id: e.id })),
          ...plan.add.map((l, i) => ({ ...l, id: `new${String(i)}` })),
        ];
        const key = (l: ComputedLine) => `${l.calculationId}|${l.outputKey}`;
        const byKey = (a: ComputedLine, b: ComputedLine) => key(a).localeCompare(key(b));
        expect([...result].sort(byKey).map((l) => ({ ...line(l), id: undefined }))).toEqual(
          [...target].sort(byKey).map((l) => ({ ...l, id: undefined })),
        );
        const again = planSync(result, target);
        expect(again.add.length + again.update.length + again.remove.length).toBe(0);
        expect(again.unchanged).toBe(target.length);
      }),
    );
  });
});

describe('saisie', () => {
  it('désignation, montants et quantité retenue', () => {
    expect(validateDesignation('  Installation de chantier ')).toEqual({
      ok: true,
      value: 'Installation de chantier',
    });
    expect(validateDesignation('x').ok).toBe(false);
    expect(validateAmount('12.5', 'Q')).toEqual({ ok: true, value: dec('12.5') });
    expect(validateAmount('0', 'Q', { positive: true })).toMatchObject({
      ok: false,
      error: { code: 'Q' },
    });
    expect(validateAmount('abc', 'Q')).toMatchObject({ ok: false, error: { code: 'Q' } });
    expect(validateOverride('3', 'Relevé sur site')).toEqual({
      ok: true,
      value: { quantity: dec('3'), justification: 'Relevé sur site' },
    });
    expect(validateOverride('3', ' ab ')).toMatchObject({
      ok: false,
      error: { code: 'BOQ_OVERRIDE_JUSTIFICATION_REQUIRED' },
    });
    expect(validateOverride('-3', 'Relevé')).toMatchObject({
      ok: false,
      error: { code: 'BOQ_OVERRIDE_INVALID' },
    });
  });
});

describe('totaux', () => {
  const nodes = [
    { id: 'lot1', parentId: null, code: '1' },
    { id: 'lvl', parentId: 'lot1', code: '1.1' },
    { id: 'el', parentId: 'lvl', code: '1.1.1' },
    { id: 'lot2', parentId: null, code: '2' },
  ];

  it('sans aucun prix : quantitatif complet, montants nuls et lignes non chiffrées comptées', () => {
    const totals = boqTotals(
      nodes,
      [
        { nodeId: 'el', quantity: dec('2'), overrideQuantity: null, unitPrice: null },
        { nodeId: 'lot2', quantity: dec('5'), overrideQuantity: null, unitPrice: null },
      ],
      'XOF',
    );
    expect(totals.total).toEqual({ amount: 0n, lines: 2, unpriced: 2 });
    expect(totals.byNode.get('lot1')).toEqual({ amount: 0n, lines: 1, unpriced: 1 });
  });

  it('sous-totaux cumulés vers la racine ; la quantité retenue l’emporte', () => {
    const totals = boqTotals(
      nodes,
      [
        { nodeId: 'el', quantity: dec('2.125'), overrideQuantity: null, unitPrice: dec('65000') },
        { nodeId: 'lvl', quantity: dec('10'), overrideQuantity: dec('9'), unitPrice: dec('1500') },
        { nodeId: 'lot1', quantity: dec('1'), overrideQuantity: null, unitPrice: null },
        { nodeId: 'lot2', quantity: dec('0.5'), overrideQuantity: null, unitPrice: dec('3') },
      ],
      'XOF',
    );
    // 2,125 × 65 000 = 138 125 ; 9 × 1 500 = 13 500 ; 0,5 × 3 = 1,5 → 2 (pair).
    expect(totals.byNode.get('el')?.amount).toBe(dec('138125'));
    expect(totals.byNode.get('lvl')?.amount).toBe(dec('151625'));
    expect(totals.byNode.get('lot1')).toEqual({ amount: dec('151625'), lines: 3, unpriced: 1 });
    expect(totals.byNode.get('lot2')?.amount).toBe(dec('2'));
    expect(totals.total).toEqual({ amount: dec('151627'), lines: 4, unpriced: 1 });
  });

  it('montant arrondi à l’unité monétaire de la devise', () => {
    const line = {
      nodeId: 'x',
      quantity: dec('0.125'),
      overrideQuantity: null,
      unitPrice: dec('1'),
    };
    expect(lineAmount(line, 'XOF')).toBe(0n);
    expect(lineAmount(line, 'EUR')).toBe(dec('0.12'));
    expect(lineAmount({ ...line, unitPrice: null }, 'EUR')).toBeNull();
  });

  it('propriété : le total est la somme des montants de ligne arrondis', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            quantity: fc.bigInt({ min: 0n, max: 10n ** 10n }),
            unitPrice: fc.option(fc.bigInt({ min: 0n, max: 10n ** 10n })),
          }),
        ),
        fc.constantFrom(...CURRENCY_CODES),
        (raw, currency) => {
          const lines = raw.map((l) => ({ ...l, nodeId: 'lot1', overrideQuantity: null }));
          const totals = boqTotals(nodes, lines, currency);
          const sum = sumDecimals(lines.map((l) => lineAmount(l, currency) ?? 0n));
          expect(totals.total.amount).toBe(sum);
          expect(totals.byNode.get('lot1')?.amount).toBe(sum);
          expect(totals.total.unpriced).toBe(lines.filter((l) => l.unitPrice === null).length);
          // Chaque montant est un multiple de l'unité monétaire.
          const unit = 10n ** BigInt(4 - currencyDecimals(currency));
          expect(sum % unit).toBe(0n);
        },
      ),
    );
  });
});

describe('application d’une bibliothèque de prix', () => {
  const targets = [
    { id: 'a', workKey: 'btp.footings.concrete', unit: 'm3', unitPrice: null },
    { id: 'b', workKey: 'btp.footings.steel', unit: 'kg', unitPrice: dec('900') },
    { id: 'c', workKey: 'btp.columns.concrete', unit: 'm3', unitPrice: null },
    { id: 'd', workKey: null, unit: 'ff', unitPrice: null },
    { id: 'e', workKey: 'btp.footings.formwork', unit: 'm2', unitPrice: null },
  ];
  const candidates = [
    { id: 'p1', workKey: 'btp.footings.concrete', unit: 'm3', price: dec('65000') },
    { id: 'p2', workKey: 'btp.footings.steel', unit: 'kg', price: dec('950') },
    { id: 'p3', workKey: 'btp.footings.formwork', unit: 'm3', price: dec('1') },
    { id: 'p4', workKey: null, unit: 'ff', price: dec('500000') },
  ];

  it('même ouvrage et même unité ; les lignes chiffrées sont conservées', () => {
    expect(planPriceApplication(targets, candidates, false)).toEqual({
      apply: [{ id: 'a', unitPrice: dec('65000'), priceItemId: 'p1' }],
      unmatched: 3,
      kept: 1,
    });
  });

  it('avec remplacement, les lignes chiffrées reprennent le prix de la bibliothèque', () => {
    expect(planPriceApplication(targets, candidates, true).apply).toEqual([
      { id: 'a', unitPrice: dec('65000'), priceItemId: 'p1' },
      { id: 'b', unitPrice: dec('950'), priceItemId: 'p2' },
    ]);
  });
});

describe('décomposition en matériaux', () => {
  const presentations = [
    out('cement', 'MATERIAL', 'kg', { additive: true, precision: 0 }),
    out('tiles', 'MATERIAL', '1', { precision: 0 }),
    out('concrete', 'CONCRETE'),
  ];
  const source = (id: string, outputs: Record<string, unknown>) => ({
    calculationId: id,
    calculationTitle: `Calcul ${id}`,
    revisionId: `r-${id}`,
    outputs,
    outputPresentations: presentations,
  });

  it('cumule les matériaux génériques, garde une ligne par calcul pour les autres', () => {
    const rows = materialBreakdown([
      source('a', { cement: 700, tiles: 120, concrete: 2 }),
      source('b', { cement: 350.5, tiles: 80 }),
      source('c', { cement: 0, tiles: -1 }),
      { ...source('d', {}), outputs: null },
    ]);
    expect(rows.map((r) => [r.key, r.additive, r.total, r.contributions.length])).toEqual([
      ['cement', true, 1050.5, 2],
      ['tiles', false, 120, 1],
      ['tiles', false, 80, 1],
    ]);
    expect(rows[0]?.contributions.map((c) => c.revisionId)).toEqual(['r-a', 'r-b']);
  });
});

describe('cas limites', () => {
  it('plan vide, décimales hors bornes, valeur non stockable', () => {
    expect(isPlanEmpty(planSync([], []))).toBe(true);
    expect(isPlanEmpty(planSync([], computedLines([footing()])))).toBe(false);
    expect(() => roundDecimal(1n, 5)).toThrow(RangeError);
    expect(() => multiplyDecimal(1n, 1n, -1)).toThrow(RangeError);
    expect(isStorableDecimal(10n ** 18n)).toBe(false);
    expect(isStorableDecimal(-1n)).toBe(false);
  });
});
