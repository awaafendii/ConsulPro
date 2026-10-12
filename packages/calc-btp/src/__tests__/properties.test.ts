import { run, type AnyEngine } from '@consulpro/calc-core';
import fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  btpBeams,
  btpBlocks,
  btpColumns,
  btpEarthworks,
  btpFootings,
  btpGroundBeams,
  btpMasonry,
  btpPainting,
  btpPartitions,
  btpRenders,
  btpSlabs,
  btpStairs,
  btpTiling,
} from '../index';
import { seedParams } from './seed';

/*
 * Invariants des moteurs BTP (06-strategie-de-tests.md §3.3) : quantités positives ou
 * nulles et finies, additives (la somme des éléments égale le total) et homogènes en
 * unités (même grandeur saisie en m, cm ou mm ⇒ même résultat).
 */

const RUNS = { numRuns: 60 };
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function outputsOf(engine: AnyEngine, inputs: unknown): Record<string, number> {
  const result = run(engine, inputs, seedParams(engine));
  if (result.outputs === null) {
    throw new Error(
      `${engine.id} : ${result.status} ${JSON.stringify(result.errors)} ${JSON.stringify(result.failure)}`,
    );
  }
  return result.outputs as Record<string, number>;
}

const m = (value: number) => ({ value, unit: 'm' });
const cm = (value: number) => ({ value: Number((value * 100).toFixed(9)), unit: 'cm' });
const m2 = (value: number) => ({ value, unit: 'm2' });
/** Dimensions « réalistes » au centimètre près (évite les cas dégénérés de l'arithmétique flottante). */
const dim = (min: number, max: number) =>
  fc.integer({ min: Math.round(min * 100), max: Math.round(max * 100) }).map((v) => v / 100);
const steelMode = fc.constantFrom('RATIO', undefined);
const yesNo = fc.constantFrom('YES', 'NO', undefined);

/** Générateurs d'entrées valides, par moteur. */
const ARBITRARIES: readonly [AnyEngine, fc.Arbitrary<Record<string, unknown>>][] = [
  [
    btpEarthworks,
    fc
      .record({
        excavation: fc.constantFrom('MASS', 'TRENCH', 'PIT'),
        l: dim(0.5, 50),
        w: dim(0.3, 20),
        d: dim(0.2, 5),
        n: fc.integer({ min: 1, max: 20 }),
        soil: fc.constantFrom('TOPSOIL', 'ORDINARY', 'CLAY', 'SAND', 'GRAVEL', 'ROCK'),
        share: fc.double({ min: 0, max: 1, noNaN: true }),
      })
      .map((r) => ({
        excavation: r.excavation,
        length: m(r.l),
        width: m(r.w),
        depth: m(r.d),
        count: r.n,
        soil: r.soil,
        buriedVolume: { value: r.l * r.w * r.d * r.n * r.share * 0.999, unit: 'm3' },
      })),
  ],
  [
    btpFootings,
    fc
      .record({
        type: fc.constantFrom('ISOLATED', 'STRIP'),
        a: dim(0.4, 30),
        b: dim(0.3, 3),
        h: dim(0.2, 1.5),
        n: fc.integer({ min: 1, max: 50 }),
        lean: yesNo,
        steelMode,
      })
      .map((r) => ({
        type: r.type,
        length: m(r.a),
        width: m(r.b),
        height: m(r.h),
        count: r.n,
        leanConcrete: r.lean,
        steelMode: r.steelMode,
      })),
  ],
  [
    btpGroundBeams,
    fc
      .record({
        l: dim(1, 100),
        b: dim(0.15, 0.6),
        h: dim(0.2, 1),
        bottom: yesNo,
        lean: yesNo,
        steelMode,
      })
      .map((r) => ({
        length: m(r.l),
        width: m(r.b),
        height: m(r.h),
        formworkBottom: r.bottom,
        leanConcrete: r.lean,
        steelMode: r.steelMode,
      })),
  ],
  [
    btpColumns,
    fc
      .record({
        a: dim(0.15, 1),
        b: dim(0.15, 1),
        h: dim(2, 10),
        n: fc.integer({ min: 1, max: 100 }),
        steelMode,
      })
      .map((r) => ({
        sectionA: m(r.a),
        sectionB: m(r.b),
        height: m(r.h),
        count: r.n,
        steelMode: r.steelMode,
      })),
  ],
  [
    btpBeams,
    fc
      .record({
        l: dim(1, 15),
        b: dim(0.15, 0.6),
        h: dim(0.1, 1),
        n: fc.integer({ min: 1, max: 100 }),
        steelMode,
      })
      .map((r) => ({
        length: m(r.l),
        width: m(r.b),
        dropHeight: m(r.h),
        count: r.n,
        steelMode: r.steelMode,
      })),
  ],
  [
    btpSlabs,
    fc
      .record({
        type: fc.constantFrom('SOLID', 'H16_4', 'H20_4'),
        s: dim(1, 1000),
        e: dim(0.08, 0.4),
        p: dim(0, 200),
        steelMode,
      })
      .map((r) => ({
        type: r.type,
        area: m2(r.s),
        thickness: m(r.e),
        edgeLength: r.p > 0 ? m(r.p) : undefined,
        steelMode: r.steelMode,
      })),
  ],
  [
    btpStairs,
    fc
      .record({
        w: dim(0.8, 3),
        n: fc.integer({ min: 1, max: 30 }),
        h: dim(0.14, 0.22),
        g: dim(0.22, 0.35),
        e: dim(0.1, 0.25),
        lp: dim(0, 3),
      })
      .map((r) => ({
        width: m(r.w),
        steps: r.n,
        riser: m(r.h),
        going: m(r.g),
        waistThickness: m(r.e),
        landingLength: r.lp > 0 ? m(r.lp) : undefined,
      })),
  ],
  [
    btpMasonry,
    fc
      .record({
        l: dim(1, 50),
        h: dim(1, 6),
        t: fc.constantFrom('T10', 'T15', 'T20'),
        ow: dim(0.3, 1.5),
        oh: dim(0.3, 2.2),
        on: fc.integer({ min: 0, max: 3 }),
      })
      .filter((r) => r.ow * r.oh * r.on < r.l * r.h)
      .map((r) => ({
        length: m(r.l),
        height: m(r.h),
        thickness: r.t,
        openings: r.on > 0 ? [{ width: m(r.ow), height: m(r.oh), count: r.on }] : undefined,
      })),
  ],
  [
    btpBlocks,
    fc
      .record({ s: dim(0.1, 5000), t: fc.constantFrom('T10', 'T15', 'T20') })
      .map((r) => ({ area: m2(r.s), thickness: r.t })),
  ],
  [
    btpPartitions,
    fc
      .record({
        type: fc.constantFrom('BLOCKS', 'BOARDS'),
        l: dim(0.5, 30),
        h: dim(2, 4),
        share: fc.double({ min: 0, max: 0.5, noNaN: true }),
      })
      .map((r) => ({
        type: r.type,
        length: m(r.l),
        height: m(r.h),
        openingsArea: m2(r.l * r.h * r.share),
      })),
  ],
  [
    btpRenders,
    fc
      .record({ s: dim(0.1, 5000), side: fc.constantFrom('INTERIOR', 'EXTERIOR') })
      .map((r) => ({ area: m2(r.s), side: r.side })),
  ],
  [
    btpTiling,
    fc
      .record({
        s: dim(0.5, 2000),
        a: dim(0.1, 1.2),
        b: dim(0.1, 1.2),
        laying: fc.constantFrom('ADHESIVE', 'MORTAR_BED'),
        sk: dim(0, 200),
      })
      .map((r) => ({
        area: m2(r.s),
        tileLength: m(r.a),
        tileWidth: m(r.b),
        laying: r.laying,
        skirtingLength: r.sk > 0 ? m(r.sk) : undefined,
      })),
  ],
  [
    btpPainting,
    fc
      .record({
        s: dim(0.5, 5000),
        coats: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
        primer: yesNo,
      })
      .map((r) => ({ area: m2(r.s), coats: r.coats, primer: r.primer })),
  ],
];

/** Retire les clés `undefined` (une saisie absente n'est pas transmise). */
const compact = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

describe('propriétés : quantités positives ou nulles et finies', () => {
  it.each(ARBITRARIES.map(([engine, arb]) => [engine.id, engine, arb] as const))(
    '%s',
    (_id, engine, arb) => {
      fc.assert(
        fc.property(arb, (inputs) => {
          const outputs = outputsOf(engine, compact(inputs));
          return Object.values(outputs).every((v) => Number.isFinite(v) && v >= 0);
        }),
        RUNS,
      );
    },
  );
});

describe('propriétés : additivité (la somme des éléments égale le total)', () => {
  const linearInCount = [
    [btpFootings, { type: 'ISOLATED', length: m(1.2), width: m(1.2), height: m(0.4) }],
    [btpColumns, { sectionA: m(0.25), sectionB: m(0.3), height: m(3) }],
    [btpBeams, { length: m(5), width: m(0.2), dropHeight: m(0.35) }],
    [
      btpEarthworks,
      { excavation: 'PIT', length: m(1.2), width: m(1.2), depth: m(1.5), soil: 'CLAY' },
    ],
  ] as const;
  it.each(linearInCount.map(([engine, base]) => [engine.id, engine, base] as const))(
    '%s : n éléments identiques = n × un élément',
    (_id, engine, base) => {
      const one = outputsOf(engine, { ...base, count: 1 });
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 500 }), (n) => {
          const many = outputsOf(engine, { ...base, count: n });
          return Object.keys(one).every((k) =>
            close(many[k] ?? Number.NaN, n * (one[k] ?? Number.NaN)),
          );
        }),
        RUNS,
      );
    },
  );

  const additiveInArea = [
    [btpRenders, (s: number) => ({ area: m2(s), side: 'EXTERIOR' }), []],
    [btpPainting, (s: number) => ({ area: m2(s), coats: 2, primer: 'YES' }), []],
    [
      btpTiling,
      (s: number) => ({ area: m2(s), tileLength: m(0.4), tileWidth: m(0.4), laying: 'MORTAR_BED' }),
      [],
    ],
    [btpBlocks, (s: number) => ({ area: m2(s), thickness: 'T15' }), ['perM2']],
    [btpSlabs, (s: number) => ({ type: 'H20_4', area: m2(s) }), []],
    [
      btpSlabs,
      (s: number) => ({ type: 'SOLID', area: m2(s), thickness: m(0.16), steelMode: 'RATIO' }),
      [],
    ],
  ] as const;
  it.each(
    additiveInArea.map(
      ([engine, make, intensive], i) => [`${engine.id} #${i}`, engine, make, intensive] as const,
    ),
  )('%s : f(S₁ + S₂) = f(S₁) + f(S₂)', (_id, engine, make, intensive) => {
    fc.assert(
      fc.property(dim(0.5, 500), dim(0.5, 500), (s1, s2) => {
        const [a, b, ab] = [
          outputsOf(engine, make(s1)),
          outputsOf(engine, make(s2)),
          outputsOf(engine, make(s1 + s2)),
        ];
        return Object.keys(ab)
          .filter((k) => !(intensive as readonly string[]).includes(k))
          .every((k) => close(ab[k] ?? Number.NaN, (a[k] ?? 0) + (b[k] ?? 0)));
      }),
      RUNS,
    );
  });

  it('btp.masonry : deux murs de même hauteur = un mur de longueur cumulée', () => {
    fc.assert(
      fc.property(dim(1, 30), dim(1, 30), dim(2, 4), (l1, l2, h) => {
        const wall = (l: number) =>
          outputsOf(btpMasonry, { length: m(l), height: m(h), thickness: 'T20' });
        const [a, b, ab] = [wall(l1), wall(l2), wall(l1 + l2)];
        return Object.keys(ab).every((k) => close(ab[k] ?? Number.NaN, (a[k] ?? 0) + (b[k] ?? 0)));
      }),
      RUNS,
    );
  });
});

describe('propriétés : homogénéité des unités (m ↔ cm)', () => {
  it.each([
    [
      btpFootings,
      (a: number, b: number, h: number) => [
        { type: 'STRIP', length: m(a), width: m(b), height: m(h) },
        { type: 'STRIP', length: cm(a), width: cm(b), height: cm(h) },
      ],
    ],
    [
      btpGroundBeams,
      (a: number, b: number, h: number) => [
        { length: m(a), width: m(b), height: m(h) },
        { length: cm(a), width: cm(b), height: cm(h) },
      ],
    ],
    [
      btpStairs,
      (a: number, b: number, h: number) => [
        { width: m(a / 4), steps: 12, riser: m(h / 5), going: m(b / 2), waistThickness: m(0.15) },
        {
          width: cm(a / 4),
          steps: 12,
          riser: cm(h / 5),
          going: cm(b / 2),
          waistThickness: cm(0.15),
        },
      ],
    ],
    [
      btpMasonry,
      (a: number, _b: number, h: number) => [
        { length: m(a), height: m(h * 2), thickness: 'T15' },
        { length: cm(a), height: cm(h * 2), thickness: 'T15' },
      ],
    ],
  ] as const)('moteur n° %#', (engine, pair) => {
    fc.assert(
      fc.property(dim(1, 20), dim(0.3, 0.6), dim(0.5, 1), (a, b, h) => {
        const [inMeters, inCentimeters] = pair(a, b, h);
        const [x, y] = [outputsOf(engine, inMeters), outputsOf(engine, inCentimeters)];
        return Object.keys(x).every((k) => close(x[k] ?? Number.NaN, y[k] ?? Number.NaN));
      }),
      RUNS,
    );
  });
});
