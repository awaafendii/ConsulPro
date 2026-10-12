import { ok, type CalcContext, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { area, areaOrZero, count, length, LENGTH_UNITS } from '../common/inputs';
import {
  BTP_HYPOTHESIS,
  MATERIAL_OUTPUTS,
  materialShape,
  materialValues,
  nonNegative,
  requirements,
} from '../common/outputs';
import { cementBags, MORTAR_PARAMETERS, mortarMaterials } from '../common/quantities';

/*
 * Maçonnerie de blocs (agglos) : surfaces nettes, mortier de pose, nombre de blocs ;
 * cloisons en blocs ou en plaques. Épaisseurs de blocs : 10, 15 ou 20 cm (désignation).
 */

const THICKNESS = { T10: 0.1, T15: 0.15, T20: 0.2 } as const;
type Thickness = keyof typeof THICKNESS;
const thicknessEnum = z.enum(['T10', 'T15', 'T20']);
const THICKNESS_OPTIONS = [
  { value: 'T10', label: 'Blocs de 10 cm' },
  { value: 'T15', label: 'Blocs de 15 cm' },
  { value: 'T20', label: 'Blocs de 20 cm' },
];

const BLOCK_PARAMETERS = [
  {
    key: 'btp.block.length',
    kind: 'SCALAR',
    unitKind: 'length',
    description: "Longueur d'un bloc",
  },
  { key: 'btp.block.height', kind: 'SCALAR', unitKind: 'length', description: "Hauteur d'un bloc" },
  {
    key: 'btp.masonry.joint',
    kind: 'SCALAR',
    unitKind: 'length',
    description: 'Épaisseur des joints',
  },
  {
    key: 'btp.waste.blocks',
    kind: 'SCALAR',
    unitKind: 'dimensionless',
    description: 'Taux de pertes sur blocs',
  },
] as const;

/** Blocs par m² de mur : un bloc par module (L + j)(H + j). */
function blocksPerM2(ctx: CalcContext) {
  const l = ctx.params.scalar('btp.block.length', 'm');
  const h = ctx.params.scalar('btp.block.height', 'm');
  const j = ctx.params.scalar('btp.masonry.joint', 'm');
  return { perM2: 1 / ((l + j) * (h + j)), l, h, j };
}

/** Nombre de blocs commandés, avec pertes. */
function blockCount(ctx: CalcContext, id: string, netArea: number) {
  const { perM2, l, h, j } = blocksPerM2(ctx);
  const waste = ctx.params.scalar('btp.waste.blocks', '1');
  const blocks = netArea * perM2 * (1 + waste);
  ctx.trace.step({
    id,
    label: 'Nombre de blocs (avec pertes)',
    formula: 'N = \\frac{S}{(L_b + j)(H_b + j)} (1 + p)',
    substitutions: [
      { symbol: 'S', value: netArea, unit: 'm2' },
      { symbol: 'L_b', value: l, unit: 'm' },
      { symbol: 'H_b', value: h, unit: 'm' },
      { symbol: 'j', value: j, unit: 'm' },
      { symbol: 'p', value: waste },
    ],
    value: blocks,
  });
  return { blocks, perM2 };
}

/** Mortier de pose : part des joints dans le mur × épaisseur. */
function layingMortar(ctx: CalcContext, id: string, netArea: number, thickness: number) {
  const { l, h, j } = blocksPerM2(ctx);
  const jointShare = 1 - (l * h) / ((l + j) * (h + j));
  const volume = netArea * thickness * jointShare;
  ctx.trace.step({
    id,
    label: 'Mortier de pose (joints)',
    formula: 'V_m = S \\, t \\left(1 - \\frac{L_b H_b}{(L_b + j)(H_b + j)}\\right)',
    substitutions: [
      { symbol: 'S', value: netArea, unit: 'm2' },
      { symbol: 't', value: thickness, unit: 'm' },
    ],
    value: volume,
    unit: 'm3',
  });
  return volume;
}

const blockOutputs = {
  blocks10: nonNegative,
  blocks15: nonNegative,
  blocks20: nonNegative,
};
const BLOCK_OUTPUTS = [
  {
    key: 'blocks10',
    label: 'Blocs de 10 (avec pertes)',
    unit: '1',
    precision: 0,
    family: 'MATERIAL',
    additive: true,
  },
  {
    key: 'blocks15',
    label: 'Blocs de 15 (avec pertes)',
    unit: '1',
    precision: 0,
    family: 'MATERIAL',
    additive: true,
  },
  {
    key: 'blocks20',
    label: 'Blocs de 20 (avec pertes)',
    unit: '1',
    precision: 0,
    family: 'MATERIAL',
    additive: true,
  },
] as const;
const byThickness = (thickness: Thickness, blocks: number) => ({
  blocks10: thickness === 'T10' ? blocks : 0,
  blocks15: thickness === 'T15' ? blocks : 0,
  blocks20: thickness === 'T20' ? blocks : 0,
});

// --- Maçonnerie ---------------------------------------------------------------------------

const opening = z.object({ width: length(50), height: length(20), count: count(1000) });

const masonryInput = z
  .object({
    length: length(),
    height: length(50),
    thickness: thicknessEnum,
    openings: z.array(opening).max(200).optional(),
  })
  .superRefine((i, ctx) => {
    const openings = (i.openings ?? []).reduce((s, o) => s + o.width.si * o.height.si * o.count, 0);
    if (openings > i.length.si * i.height.si) {
      ctx.addIssue({
        code: 'custom',
        path: ['openings'],
        message: 'Les ouvertures dépassent la surface du mur.',
        params: { code: 'OPENINGS_EXCEED_WALL' },
      });
    }
  });

const masonryOutput = z.object({
  grossArea: nonNegative,
  openingsDeducted: nonNegative,
  area: nonNegative,
  mortarVolume: nonNegative,
  ...blockOutputs,
  ...materialShape,
});

export const btpMasonry: EngineDefinition<
  z.output<typeof masonryInput>,
  z.output<typeof masonryOutput>
> = {
  id: 'btp.masonry',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Maçonnerie de blocs',
  inputSchema: masonryInput,
  outputSchema: masonryOutput,
  parameters: requirements(MORTAR_PARAMETERS, BLOCK_PARAMETERS, [
    {
      key: 'btp.masonry.opening_min_area',
      kind: 'SCALAR',
      unitKind: 'area',
      description: 'Surface au-dessous de laquelle une ouverture n’est pas déduite',
    },
  ]),
  formulas: [
    {
      id: 'masonry',
      label: 'Surface nette',
      latex: 'S_n = L \\, H - \\sum_{s_k > s_0} s_k \\, n_k',
      symbols: [
        { symbol: 's_k', meaning: 'surface d’une ouverture', unit: 'm2' },
        { symbol: 's_0', meaning: 'seuil de déduction', unit: 'm2' },
      ],
      source: 'Convention de métré : les petits vides ne sont pas déduits',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description:
      'Surfaces brute et nette (déduction des ouvertures selon la convention du référentiel), mortier de pose et blocs.',
    inputs: [
      {
        key: 'length',
        label: 'Longueur du mur',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      {
        key: 'height',
        label: 'Hauteur du mur',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      { key: 'thickness', label: 'Épaisseur', kind: 'enum', options: THICKNESS_OPTIONS },
      {
        key: 'openings',
        label: 'Ouvertures',
        kind: 'list',
        optional: true,
        maxItems: 200,
        fields: [
          {
            key: 'width',
            label: 'Largeur',
            kind: 'quantity',
            unitKind: 'length',
            units: ['m', 'cm'],
          },
          {
            key: 'height',
            label: 'Hauteur',
            kind: 'quantity',
            unitKind: 'length',
            units: ['m', 'cm'],
          },
          { key: 'count', label: 'Nombre', kind: 'integer', min: 1 },
        ],
      },
    ],
    outputs: [
      { key: 'grossArea', label: 'Surface brute', unit: 'm2', precision: 2 },
      { key: 'openingsDeducted', label: 'Ouvertures déduites', unit: 'm2', precision: 2 },
      {
        key: 'area',
        label: 'Maçonnerie (surface nette)',
        unit: 'm2',
        precision: 2,
        family: 'MASONRY',
      },
      { key: 'mortarVolume', label: 'Mortier de pose (net)', unit: 'm3', precision: 3 },
      ...BLOCK_OUTPUTS,
      ...MATERIAL_OUTPUTS,
    ],
  },
  calculate(i, ctx) {
    const gross = i.length.si * i.height.si;
    ctx.trace.step({
      id: 'T1',
      label: 'Surface brute',
      formula: 'S_b = L \\, H',
      value: gross,
      unit: 'm2',
    });
    const threshold = ctx.params.scalar('btp.masonry.opening_min_area', 'm2');
    const deducted = (i.openings ?? [])
      .map((o) => ({ area: o.width.si * o.height.si, count: o.count }))
      .filter((o) => o.area > threshold)
      .reduce((s, o) => s + o.area * o.count, 0);
    ctx.trace.step({
      id: 'T2',
      label: 'Ouvertures déduites',
      formula: '\\sum_{s_k > s_0} s_k \\, n_k',
      substitutions: [{ symbol: 's_0', value: threshold, unit: 'm2' }],
      value: deducted,
      unit: 'm2',
      source: 'Référentiel « Usages courants — métré » (btp.masonry.opening_min_area)',
    });
    const net = gross - deducted;
    ctx.trace.step({
      id: 'T3',
      label: 'Surface nette',
      formula: 'S_n = S_b - S_o',
      value: net,
      unit: 'm2',
    });
    const mortarVolume = layingMortar(ctx, 'T4', net, THICKNESS[i.thickness]);
    const { blocks } = blockCount(ctx, 'T5', net);
    const { materials } = mortarMaterials(ctx, 'T6', 'Mortier de pose', 'MASONRY', mortarVolume);
    return ok({
      grossArea: gross,
      openingsDeducted: deducted,
      area: net,
      mortarVolume,
      ...byThickness(i.thickness, blocks),
      ...materialValues(materials, cementBags(ctx, materials.cement)),
    });
  },
  verify() {
    return [];
  },
};

// --- Blocs --------------------------------------------------------------------------------

const blocksInput = z.object({ area: area(), thickness: thicknessEnum });
const blocksOutput = z.object({ perM2: nonNegative, ...blockOutputs });

export const btpBlocks: EngineDefinition<
  z.output<typeof blocksInput>,
  z.output<typeof blocksOutput>
> = {
  id: 'btp.blocks',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Blocs (agglos) par surface',
  inputSchema: blocksInput,
  outputSchema: blocksOutput,
  parameters: [...BLOCK_PARAMETERS],
  formulas: [
    {
      id: 'blocks',
      label: 'Blocs par m²',
      latex: 'n = \\frac{1}{(L_b + j)(H_b + j)}',
      symbols: [
        { symbol: 'L_b', meaning: 'longueur du bloc', unit: 'm' },
        { symbol: 'H_b', meaning: 'hauteur du bloc', unit: 'm' },
        { symbol: 'j', meaning: 'épaisseur de joint', unit: 'm' },
      ],
      source: 'Géométrie du calepinage',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description: 'Nombre de blocs (agglos) pour une surface de mur, joints et pertes compris.',
    inputs: [
      {
        key: 'area',
        label: 'Surface nette de mur',
        kind: 'quantity',
        unitKind: 'area',
        units: ['m2'],
        help: 'Peut reprendre la surface nette d’un calcul de maçonnerie.',
      },
      { key: 'thickness', label: 'Épaisseur des blocs', kind: 'enum', options: THICKNESS_OPTIONS },
    ],
    outputs: [
      { key: 'perM2', label: 'Blocs par m² (sans pertes)', unit: '1', precision: 2 },
      ...BLOCK_OUTPUTS,
    ],
  },
  calculate(i, ctx) {
    const { blocks, perM2 } = blockCount(ctx, 'T1', i.area.si);
    return ok({ perM2, ...byThickness(i.thickness, blocks) });
  },
  verify() {
    return [];
  },
};

// --- Cloisons -----------------------------------------------------------------------------

const partitionsInput = z
  .object({
    type: z.enum(['BLOCKS', 'BOARDS']),
    length: length(),
    height: length(20),
    openingsArea: areaOrZero().optional(),
  })
  .superRefine((i, ctx) => {
    if ((i.openingsArea?.si ?? 0) > i.length.si * i.height.si) {
      ctx.addIssue({
        code: 'custom',
        path: ['openingsArea'],
        message: 'Les ouvertures dépassent la surface de la cloison.',
        params: { code: 'OPENINGS_EXCEED_WALL' },
      });
    }
  });

const partitionsOutput = z.object({
  area: nonNegative,
  blocks10: nonNegative,
  boards: nonNegative,
  rails: nonNegative,
  studs: nonNegative,
  mortarVolume: nonNegative,
  ...materialShape,
});

export const btpPartitions: EngineDefinition<
  z.output<typeof partitionsInput>,
  z.output<typeof partitionsOutput>
> = {
  id: 'btp.partitions',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Cloisons (blocs de 10 ou plaques)',
  inputSchema: partitionsInput,
  outputSchema: partitionsOutput,
  parameters: requirements(MORTAR_PARAMETERS, BLOCK_PARAMETERS, [
    {
      key: 'btp.partition.board_area',
      kind: 'SCALAR',
      unitKind: 'area',
      description: "Surface d'une plaque",
    },
    {
      key: 'btp.partition.stud_spacing',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Entraxe des montants',
    },
    {
      key: 'btp.waste.boards',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Taux de pertes sur plaques',
    },
  ]),
  formulas: [
    {
      id: 'boards',
      label: 'Cloison en plaques (deux parements)',
      latex:
        'N_p = \\frac{2 S}{s_p} (1 + p) ; \\; L_r = 2 L ; \\; L_m = (\\lfloor L / a \\rfloor + 1) H',
      symbols: [
        { symbol: 's_p', meaning: 'surface d’une plaque', unit: 'm2' },
        { symbol: 'a', meaning: 'entraxe des montants', unit: 'm' },
      ],
      source: 'Métré : ossature métallique, un parement de chaque côté',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description:
      'Surface nette de cloison ; blocs de 10 et mortier, ou plaques, rails et montants.',
    inputs: [
      {
        key: 'type',
        label: 'Type de cloison',
        kind: 'enum',
        options: [
          { value: 'BLOCKS', label: 'Blocs de 10 cm' },
          { value: 'BOARDS', label: 'Plaques sur ossature (deux parements)' },
        ],
      },
      {
        key: 'length',
        label: 'Longueur',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      {
        key: 'height',
        label: 'Hauteur',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      {
        key: 'openingsArea',
        label: 'Surface des ouvertures déduites',
        kind: 'quantity',
        unitKind: 'area',
        units: ['m2'],
        optional: true,
        help: 'Sans saisie : aucune ouverture.',
      },
    ],
    outputs: [
      {
        key: 'area',
        label: 'Cloisons (surface nette)',
        unit: 'm2',
        precision: 2,
        family: 'MASONRY',
      },
      {
        key: 'blocks10',
        label: 'Blocs de 10 (avec pertes)',
        unit: '1',
        precision: 0,
        family: 'MATERIAL',
        additive: true,
      },
      {
        key: 'boards',
        label: 'Plaques (avec pertes)',
        unit: '1',
        precision: 0,
        family: 'MATERIAL',
      },
      { key: 'rails', label: 'Rails', unit: 'm', precision: 2, family: 'MATERIAL' },
      { key: 'studs', label: 'Montants', unit: 'm', precision: 2, family: 'MATERIAL' },
      { key: 'mortarVolume', label: 'Mortier de pose (net)', unit: 'm3', precision: 3 },
      ...MATERIAL_OUTPUTS,
    ],
  },
  calculate(i, ctx) {
    const openings = i.openingsArea?.si ?? 0;
    if (i.openingsArea === undefined)
      ctx.assume.defaulted('openingsArea', 0, 'Aucune ouverture déduite.');
    const net = i.length.si * i.height.si - openings;
    ctx.trace.step({
      id: 'T1',
      label: 'Surface nette',
      formula: 'S = L \\, H - S_o',
      value: net,
      unit: 'm2',
    });
    if (i.type === 'BLOCKS') {
      const mortarVolume = layingMortar(ctx, 'T2', net, THICKNESS.T10);
      const { blocks } = blockCount(ctx, 'T3', net);
      const { materials } = mortarMaterials(ctx, 'T4', 'Mortier de pose', 'MASONRY', mortarVolume);
      return ok({
        area: net,
        blocks10: blocks,
        boards: 0,
        rails: 0,
        studs: 0,
        mortarVolume,
        ...materialValues(materials, cementBags(ctx, materials.cement)),
      });
    }
    const boardArea = ctx.params.scalar('btp.partition.board_area', 'm2');
    const waste = ctx.params.scalar('btp.waste.boards', '1');
    const boards = ((2 * net) / boardArea) * (1 + waste);
    ctx.trace.step({
      id: 'T2',
      label: 'Plaques',
      formula: 'N_p = \\frac{2 S}{s_p} (1 + p)',
      value: boards,
    });
    const rails = 2 * i.length.si;
    ctx.trace.step({
      id: 'T3',
      label: 'Rails (haut et bas)',
      formula: 'L_r = 2 L',
      value: rails,
      unit: 'm',
    });
    const spacing = ctx.params.scalar('btp.partition.stud_spacing', 'm');
    const studs = (Math.floor(i.length.si / spacing + 1e-9) + 1) * i.height.si;
    ctx.trace.step({
      id: 'T4',
      label: 'Montants',
      formula: 'L_m = (\\lfloor L / a \\rfloor + 1) H',
      substitutions: [{ symbol: 'a', value: spacing, unit: 'm' }],
      value: studs,
      unit: 'm',
    });
    return ok({
      area: net,
      blocks10: 0,
      boards,
      rails,
      studs,
      mortarVolume: 0,
      cement: 0,
      cementBags: 0,
      sand: 0,
      gravel: 0,
      water: 0,
    });
  },
  verify() {
    return [];
  },
};
