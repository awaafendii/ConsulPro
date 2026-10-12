import { checkLimit, ok, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import {
  area,
  count,
  length,
  LENGTH_UNITS,
  scheduleRequired,
  SMALL_LENGTH_UNITS,
  STEEL_PRESENTATION,
  steelFields,
} from '../common/inputs';
import {
  BTP_HYPOTHESIS,
  MATERIAL_OUTPUTS,
  materialShape,
  materialValues,
  nonNegative,
  requirements,
} from '../common/outputs';
import {
  cementBags,
  CONCRETE_PARAMETERS,
  concreteMaterials,
  STEEL_PARAMETERS,
  steel,
  tableValue,
} from '../common/quantities';

// --- Dalles -------------------------------------------------------------------------------

/** Hauteur totale (corps creux + table) déduite du type : 16 + 4 = 0,20 m ; 20 + 4 = 0,24 m. */
const HOLLOW_HEIGHT = { H16_4: 0.2, H20_4: 0.24 } as const;

const slabInput = z
  .object({
    type: z.enum(['SOLID', 'H16_4', 'H20_4']),
    area: area(),
    thickness: length(1).optional(),
    edgeLength: length(10_000).optional(),
    ...steelFields,
  })
  .superRefine((i, ctx) => {
    scheduleRequired(i, ctx);
    if (i.type === 'SOLID' && i.thickness === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['thickness'],
        message: 'Épaisseur obligatoire pour une dalle pleine.',
        params: { code: 'THICKNESS_REQUIRED' },
      });
    }
  });

const slabOutput = z.object({
  concrete: nonNegative,
  formwork: nonNegative,
  steel: nonNegative,
  steelOrdered: nonNegative,
  hollowBlocks: nonNegative,
  joists: nonNegative,
  mesh: nonNegative,
  ...materialShape,
});

export const btpSlabs: EngineDefinition<z.output<typeof slabInput>, z.output<typeof slabOutput>> = {
  id: 'btp.slabs',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Dalles et planchers',
  inputSchema: slabInput,
  outputSchema: slabOutput,
  parameters: requirements(CONCRETE_PARAMETERS, STEEL_PARAMETERS, [
    {
      key: 'btp.slab.hollow_concrete',
      kind: 'TABLE',
      unitKind: 'length',
      description: 'Béton par m² de plancher à corps creux',
    },
    {
      key: 'btp.slab.joist_spacing',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Entraxe des poutrelles',
    },
    {
      key: 'btp.slab.block_length',
      kind: 'SCALAR',
      unitKind: 'length',
      description: "Longueur d'un entrevous",
    },
    {
      key: 'btp.waste.hollow_blocks',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Taux de pertes sur entrevous',
    },
    {
      key: 'btp.mesh.overlap',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Recouvrement des treillis soudés',
    },
  ]),
  formulas: [
    {
      id: 'solid',
      label: 'Dalle pleine',
      latex: 'V = S \\, e ; \\; S_c = S + P \\, e',
      symbols: [
        { symbol: 'S', meaning: 'surface', unit: 'm2' },
        { symbol: 'e', meaning: 'épaisseur', unit: 'm' },
        { symbol: 'P', meaning: 'longueur de rive', unit: 'm' },
      ],
      source: 'Métré : sous-face et rives coffrées',
    },
    {
      id: 'hollow',
      label: 'Plancher à corps creux',
      latex: 'V = S \\, e_q ; \\; N = \\frac{S}{a \\, \\ell} (1 + p) ; \\; L_p = \\frac{S}{a}',
      symbols: [
        { symbol: 'e_q', meaning: 'épaisseur équivalente de béton', unit: 'm' },
        { symbol: 'a', meaning: 'entraxe des poutrelles', unit: 'm' },
        { symbol: '\\ell', meaning: 'longueur d’un entrevous', unit: 'm' },
      ],
      source: 'Métré : un entrevous par entraxe et par longueur d’entrevous',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description:
      'Dalle pleine (béton, coffrage, aciers) ou plancher à corps creux 16 + 4 / 20 + 4 (béton, entrevous, poutrelles, treillis).',
    inputs: [
      {
        key: 'type',
        label: 'Type',
        kind: 'enum',
        options: [
          { value: 'SOLID', label: 'Dalle pleine' },
          { value: 'H16_4', label: 'Corps creux 16 + 4' },
          { value: 'H20_4', label: 'Corps creux 20 + 4' },
        ],
      },
      { key: 'area', label: 'Surface', kind: 'quantity', unitKind: 'area', units: ['m2'] },
      {
        key: 'thickness',
        label: 'Épaisseur (dalle pleine)',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
        optional: true,
      },
      {
        key: 'edgeLength',
        label: 'Longueur de rive coffrée',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
        optional: true,
        help: 'Sans saisie : rives non comptées.',
      },
      ...STEEL_PRESENTATION,
    ],
    outputs: [
      { key: 'concrete', label: 'Béton', unit: 'm3', precision: 3, family: 'CONCRETE' },
      { key: 'formwork', label: 'Coffrage', unit: 'm2', precision: 2, family: 'FORMWORK' },
      { key: 'steel', label: 'Aciers (net)', unit: 'kg', precision: 1, family: 'STEEL' },
      {
        key: 'steelOrdered',
        label: 'Aciers commandés (avec pertes)',
        unit: 'kg',
        precision: 1,
        family: 'MATERIAL',
        additive: true,
      },
      {
        key: 'hollowBlocks',
        label: 'Entrevous (avec pertes)',
        unit: '1',
        precision: 0,
        family: 'MATERIAL',
      },
      {
        key: 'joists',
        label: 'Poutrelles (longueur)',
        unit: 'm',
        precision: 2,
        family: 'MATERIAL',
      },
      {
        key: 'mesh',
        label: 'Treillis soudé (recouvrements compris)',
        unit: 'm2',
        precision: 2,
        family: 'MATERIAL',
      },
      ...MATERIAL_OUTPUTS,
    ],
  },
  calculate(i, ctx) {
    const s = i.area.si;
    const edge = i.edgeLength?.si ?? 0;
    if (i.edgeLength === undefined) ctx.assume.defaulted('edgeLength', 0, 'Rives non coffrées.');
    let concrete: number;
    let formwork: number;
    let hollowBlocks = 0;
    let joists = 0;
    let mesh = 0;
    let bars = { net: 0, ordered: 0 };
    if (i.type === 'SOLID') {
      // Épaisseur garantie par le schéma pour une dalle pleine.
      const e = i.thickness?.si ?? 0;
      concrete = s * e;
      ctx.trace.step({
        id: 'T1',
        label: 'Béton de la dalle',
        formula: 'V = S \\, e',
        value: concrete,
        unit: 'm3',
      });
      formwork = s + edge * e;
      ctx.trace.step({
        id: 'T2',
        label: 'Coffrage',
        formula: 'S_c = S + P \\, e',
        value: formwork,
        unit: 'm2',
      });
      bars = steel(ctx, 'T3', i, 'SLAB', concrete);
    } else {
      const eq = tableValue(ctx, 'btp.slab.hollow_concrete', { type: i.type }, 'm');
      concrete = s * eq;
      ctx.trace.step({
        id: 'T1',
        label: 'Béton du plancher (table et nervures)',
        formula: 'V = S \\, e_q',
        substitutions: [
          { symbol: 'S', value: s, unit: 'm2' },
          { symbol: 'e_q', value: eq, unit: 'm' },
        ],
        value: concrete,
        unit: 'm3',
      });
      formwork = edge * HOLLOW_HEIGHT[i.type];
      ctx.trace.step({
        id: 'T2',
        label: 'Coffrage des rives',
        formula: 'S_c = P \\, h',
        value: formwork,
        unit: 'm2',
      });
      const a = ctx.params.scalar('btp.slab.joist_spacing', 'm');
      const l = ctx.params.scalar('btp.slab.block_length', 'm');
      const w = ctx.params.scalar('btp.waste.hollow_blocks', '1');
      hollowBlocks = (s / (a * l)) * (1 + w);
      ctx.trace.step({
        id: 'T3',
        label: 'Entrevous',
        formula: 'N = \\frac{S}{a \\, \\ell} (1 + p)',
        substitutions: [
          { symbol: 'a', value: a, unit: 'm' },
          { symbol: '\\ell', value: l, unit: 'm' },
          { symbol: 'p', value: w },
        ],
        value: hollowBlocks,
      });
      joists = s / a;
      ctx.trace.step({
        id: 'T4',
        label: 'Poutrelles',
        formula: 'L_p = S / a',
        value: joists,
        unit: 'm',
      });
      mesh = s * (1 + ctx.params.scalar('btp.mesh.overlap', '1'));
      ctx.trace.step({
        id: 'T5',
        label: 'Treillis soudé',
        formula: 'S_t = S (1 + r)',
        value: mesh,
        unit: 'm2',
      });
      if (i.steelMode === 'SCHEDULE') bars = steel(ctx, 'T6', i, 'SLAB', concrete);
      else {
        ctx.assume.engine(
          'BTP.HOLLOW_STEEL',
          'Plancher à corps creux : aciers des poutrelles fournis avec elles ; chapeaux et chaînages à saisir par nomenclature.',
        );
      }
    }
    const materials = concreteMaterials(ctx, 'T7', 'Béton', 'ARME', concrete);
    return ok({
      concrete,
      formwork,
      steel: bars.net,
      steelOrdered: bars.ordered,
      hollowBlocks,
      joists,
      mesh,
      ...materialValues(materials, cementBags(ctx, materials.cement)),
    });
  },
  verify() {
    return [];
  },
};

// --- Escaliers ----------------------------------------------------------------------------

const stairsInput = z
  .object({
    width: length(10),
    steps: count(200),
    riser: length(0.5),
    going: length(1),
    waistThickness: length(0.5),
    landingLength: length(20).optional(),
    landingThickness: length(0.5).optional(),
    ...steelFields,
  })
  .superRefine(scheduleRequired);

const stairsOutput = z.object({
  concrete: nonNegative,
  formwork: nonNegative,
  steel: nonNegative,
  steelOrdered: nonNegative,
  blondel: nonNegative,
  ...materialShape,
});

export const btpStairs: EngineDefinition<
  z.output<typeof stairsInput>,
  z.output<typeof stairsOutput>
> = {
  id: 'btp.stairs',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Escaliers droits',
  inputSchema: stairsInput,
  outputSchema: stairsOutput,
  parameters: requirements(CONCRETE_PARAMETERS, STEEL_PARAMETERS, [
    {
      key: 'btp.stairs.blondel_min',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Formule de Blondel : borne basse',
    },
    {
      key: 'btp.stairs.blondel_max',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Formule de Blondel : borne haute',
    },
  ]),
  formulas: [
    {
      id: 'stairs',
      label: 'Paillasse, marches et palier',
      latex:
        'L_i = n \\sqrt{h^2 + g^2} ; \\; V = w L_i e + n \\frac{h g}{2} w + w L_p e_p ; \\; m = 2h + g',
      symbols: [
        { symbol: 'n', meaning: 'nombre de marches' },
        { symbol: 'h', meaning: 'hauteur de marche', unit: 'm' },
        { symbol: 'g', meaning: 'giron', unit: 'm' },
        { symbol: 'w', meaning: 'emmarchement', unit: 'm' },
        { symbol: 'e', meaning: 'épaisseur de paillasse', unit: 'm' },
      ],
      source: 'Métré : géométrie d’une volée droite ; formule de Blondel pour le confort',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description:
      'Volée droite et palier : béton, coffrage, aciers ; contrôle de confort par la formule de Blondel.',
    inputs: [
      {
        key: 'width',
        label: 'Emmarchement (largeur)',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      { key: 'steps', label: 'Nombre de marches', kind: 'integer', min: 1 },
      {
        key: 'riser',
        label: 'Hauteur de marche',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'going',
        label: 'Giron',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'waistThickness',
        label: 'Épaisseur de paillasse',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'landingLength',
        label: 'Longueur du palier',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
        optional: true,
        help: 'Sans saisie : pas de palier.',
      },
      {
        key: 'landingThickness',
        label: 'Épaisseur du palier',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
        optional: true,
        help: 'Sans saisie : épaisseur de la paillasse.',
      },
      ...STEEL_PRESENTATION,
    ],
    outputs: [
      { key: 'concrete', label: 'Béton', unit: 'm3', precision: 3, family: 'CONCRETE' },
      { key: 'formwork', label: 'Coffrage', unit: 'm2', precision: 2, family: 'FORMWORK' },
      { key: 'steel', label: 'Aciers (net)', unit: 'kg', precision: 1, family: 'STEEL' },
      {
        key: 'steelOrdered',
        label: 'Aciers commandés (avec pertes)',
        unit: 'kg',
        precision: 1,
        family: 'MATERIAL',
        additive: true,
      },
      { key: 'blondel', label: '2h + g (Blondel)', unit: 'm', precision: 3 },
      ...MATERIAL_OUTPUTS,
    ],
  },
  calculate(i, ctx) {
    const [w, n, h, g, e] = [i.width.si, i.steps, i.riser.si, i.going.si, i.waistThickness.si];
    const lp = i.landingLength?.si ?? 0;
    if (i.landingLength === undefined) ctx.assume.defaulted('landingLength', 0, 'Pas de palier.');
    const ep = i.landingThickness?.si ?? e;
    if (i.landingThickness === undefined && lp > 0) {
      ctx.assume.defaulted('landingThickness', e, 'Palier de même épaisseur que la paillasse.');
    }
    const li = n * Math.hypot(h, g);
    ctx.trace.step({
      id: 'T1',
      label: 'Longueur rampante de la paillasse',
      formula: 'L_i = n \\sqrt{h^2 + g^2}',
      substitutions: [
        { symbol: 'n', value: n },
        { symbol: 'h', value: h, unit: 'm' },
        { symbol: 'g', value: g, unit: 'm' },
      ],
      value: li,
      unit: 'm',
    });
    const waist = w * li * e;
    const steps = n * ((h * g) / 2) * w;
    const landing = w * lp * ep;
    const concrete = waist + steps + landing;
    ctx.trace.step({
      id: 'T2',
      label: 'Béton (paillasse + marches + palier)',
      formula: 'V = w L_i e + n \\frac{h g}{2} w + w L_p e_p',
      value: concrete,
      unit: 'm3',
    });
    const formwork = w * li + n * h * w + 2 * (li * e + n * ((h * g) / 2)) + w * lp;
    ctx.trace.step({
      id: 'T3',
      label: 'Coffrage (sous-face, contremarches, joues, palier)',
      formula: 'S_c = w L_i + n h w + 2 (L_i e + n \\frac{h g}{2}) + w L_p',
      value: formwork,
      unit: 'm2',
    });
    const bars = steel(ctx, 'T4', i, 'STAIRS', concrete);
    const materials = concreteMaterials(ctx, 'T5', 'Béton', 'ARME', concrete);
    const blondel = 2 * h + g;
    ctx.trace.step({
      id: 'T6',
      label: 'Formule de Blondel',
      formula: 'm = 2h + g',
      value: blondel,
      unit: 'm',
    });
    return ok({
      concrete,
      formwork,
      steel: bars.net,
      steelOrdered: bars.ordered,
      blondel,
      ...materialValues(materials, cementBags(ctx, materials.cement)),
    });
  },
  verify(_input, out, ctx) {
    return [
      checkLimit({
        rule: 'btp.stairs.blondel',
        label: '2h + g au moins égal à la borne basse de Blondel',
        measured: out.blondel,
        limit: ctx.params.scalar('btp.stairs.blondel_min', 'm'),
        comparison: '>=',
        severity: 'WARNING',
        unit: 'm',
      }),
      checkLimit({
        rule: 'btp.stairs.blondel',
        label: '2h + g au plus égal à la borne haute de Blondel',
        measured: out.blondel,
        limit: ctx.params.scalar('btp.stairs.blondel_max', 'm'),
        comparison: '<=',
        severity: 'WARNING',
        unit: 'm',
      }),
    ];
  },
};
