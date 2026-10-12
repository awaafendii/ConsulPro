import { ok, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { area, count, length, LENGTH_UNITS } from '../common/inputs';
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
  MORTAR_PARAMETERS,
  mortarMaterials,
  noMaterials,
  tableValue,
} from '../common/quantities';

/* Finitions : enduits, carrelage, peinture. */

// --- Enduits ------------------------------------------------------------------------------

const rendersInput = z.object({ area: area(), side: z.enum(['INTERIOR', 'EXTERIOR']) });
const rendersOutput = z.object({ area: nonNegative, mortarVolume: nonNegative, ...materialShape });

export const btpRenders: EngineDefinition<
  z.output<typeof rendersInput>,
  z.output<typeof rendersOutput>
> = {
  id: 'btp.renders',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Enduits au mortier de ciment',
  inputSchema: rendersInput,
  outputSchema: rendersOutput,
  parameters: requirements(MORTAR_PARAMETERS, [
    {
      key: 'btp.render.thickness',
      kind: 'TABLE',
      unitKind: 'length',
      description: "Épaisseur d'enduit",
    },
  ]),
  formulas: [
    {
      id: 'render',
      label: "Mortier d'enduit",
      latex: 'V = S \\, e',
      symbols: [
        { symbol: 'S', meaning: 'surface enduite', unit: 'm2' },
        { symbol: 'e', meaning: 'épaisseur', unit: 'm' },
      ],
      source: 'Métré : volume de mortier',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description: "Surface d'enduit, volume de mortier, ciment, sable et eau.",
    inputs: [
      { key: 'area', label: 'Surface enduite', kind: 'quantity', unitKind: 'area', units: ['m2'] },
      {
        key: 'side',
        label: 'Emplacement',
        kind: 'enum',
        options: [
          { value: 'INTERIOR', label: 'Intérieur' },
          { value: 'EXTERIOR', label: 'Extérieur' },
        ],
      },
    ],
    outputs: [
      { key: 'area', label: 'Enduit (surface)', unit: 'm2', precision: 2, family: 'RENDER' },
      { key: 'mortarVolume', label: 'Mortier (net)', unit: 'm3', precision: 3 },
      ...MATERIAL_OUTPUTS,
    ],
  },
  calculate(i, ctx) {
    const e = tableValue(ctx, 'btp.render.thickness', { side: i.side }, 'm');
    const mortarVolume = i.area.si * e;
    ctx.trace.step({
      id: 'T1',
      label: "Mortier d'enduit",
      formula: 'V = S \\, e',
      substitutions: [
        { symbol: 'S', value: i.area.si, unit: 'm2' },
        { symbol: 'e', value: e, unit: 'm' },
      ],
      value: mortarVolume,
      unit: 'm3',
      source: 'Référentiel « Usages courants — métré » (btp.render.thickness)',
    });
    const { materials } = mortarMaterials(ctx, 'T2', "Mortier d'enduit", 'RENDER', mortarVolume);
    return ok({
      area: i.area.si,
      mortarVolume,
      ...materialValues(materials, cementBags(ctx, materials.cement)),
    });
  },
  verify() {
    return [];
  },
};

// --- Carrelage ----------------------------------------------------------------------------

const tilingInput = z.object({
  area: area(),
  tileLength: length(2),
  tileWidth: length(2),
  laying: z.enum(['ADHESIVE', 'MORTAR_BED']),
  skirtingLength: length(10_000).optional(),
});
const tilingOutput = z.object({
  area: nonNegative,
  skirting: nonNegative,
  tilesArea: nonNegative,
  tiles: nonNegative,
  adhesive: nonNegative,
  grout: nonNegative,
  mortarVolume: nonNegative,
  ...materialShape,
});

export const btpTiling: EngineDefinition<
  z.output<typeof tilingInput>,
  z.output<typeof tilingOutput>
> = {
  id: 'btp.tiling',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Carrelage',
  inputSchema: tilingInput,
  outputSchema: tilingOutput,
  parameters: requirements(MORTAR_PARAMETERS, [
    {
      key: 'btp.waste.tiling',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Taux de pertes de coupe',
    },
    {
      key: 'btp.tiling.adhesive',
      kind: 'SCALAR',
      unitKind: 'surfaceDensity',
      description: 'Consommation de mortier-colle',
    },
    {
      key: 'btp.tiling.grout',
      kind: 'SCALAR',
      unitKind: 'surfaceDensity',
      description: 'Consommation de produit de joint',
    },
    {
      key: 'btp.tiling.bed_thickness',
      kind: 'SCALAR',
      unitKind: 'length',
      description: 'Épaisseur du mortier de pose',
    },
  ]),
  formulas: [
    {
      id: 'tiles',
      label: 'Carreaux',
      latex: 'S_c = S (1 + p) ; \\; N = \\frac{S_c}{a \\, b}',
      symbols: [
        { symbol: 'p', meaning: 'pertes de coupe' },
        { symbol: 'a', meaning: 'longueur du carreau', unit: 'm' },
        { symbol: 'b', meaning: 'largeur du carreau', unit: 'm' },
      ],
      source: 'Métré : surface posée majorée des coupes',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description:
      'Surface posée, carreaux (pertes de coupe), mortier-colle ou mortier de pose, joints, plinthes.',
    inputs: [
      {
        key: 'area',
        label: 'Surface à carreler',
        kind: 'quantity',
        unitKind: 'area',
        units: ['m2'],
      },
      {
        key: 'tileLength',
        label: 'Longueur du carreau',
        kind: 'quantity',
        unitKind: 'length',
        units: ['cm', 'm'],
      },
      {
        key: 'tileWidth',
        label: 'Largeur du carreau',
        kind: 'quantity',
        unitKind: 'length',
        units: ['cm', 'm'],
      },
      {
        key: 'laying',
        label: 'Mode de pose',
        kind: 'enum',
        options: [
          { value: 'ADHESIVE', label: 'Collée (mortier-colle)' },
          { value: 'MORTAR_BED', label: 'Scellée (mortier de pose)' },
        ],
      },
      {
        key: 'skirtingLength',
        label: 'Longueur de plinthes',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
        optional: true,
        help: 'Sans saisie : pas de plinthes.',
      },
    ],
    outputs: [
      {
        key: 'area',
        label: 'Carrelage (surface posée)',
        unit: 'm2',
        precision: 2,
        family: 'FINISHES',
      },
      { key: 'skirting', label: 'Plinthes', unit: 'm', precision: 2, family: 'FINISHES' },
      {
        key: 'tilesArea',
        label: 'Carreaux à commander (surface)',
        unit: 'm2',
        precision: 2,
        family: 'MATERIAL',
      },
      { key: 'tiles', label: 'Carreaux (nombre)', unit: '1', precision: 0, family: 'MATERIAL' },
      {
        key: 'adhesive',
        label: 'Mortier-colle',
        unit: 'kg',
        precision: 0,
        family: 'MATERIAL',
        additive: true,
      },
      {
        key: 'grout',
        label: 'Produit de jointoiement',
        unit: 'kg',
        precision: 1,
        family: 'MATERIAL',
        additive: true,
      },
      { key: 'mortarVolume', label: 'Mortier de pose (net)', unit: 'm3', precision: 3 },
      ...MATERIAL_OUTPUTS,
    ],
  },
  calculate(i, ctx) {
    const s = i.area.si;
    const waste = ctx.params.scalar('btp.waste.tiling', '1');
    const tilesArea = s * (1 + waste);
    ctx.trace.step({
      id: 'T1',
      label: 'Carreaux à commander (surface)',
      formula: 'S_c = S (1 + p)',
      value: tilesArea,
      unit: 'm2',
    });
    const tiles = tilesArea / (i.tileLength.si * i.tileWidth.si);
    ctx.trace.step({
      id: 'T2',
      label: 'Nombre de carreaux',
      formula: 'N = \\frac{S_c}{a \\, b}',
      value: tiles,
    });
    const grout = s * ctx.params.scalar('btp.tiling.grout', 'kg/m2');
    ctx.trace.step({
      id: 'T3',
      label: 'Produit de jointoiement',
      formula: 'J = S \\, c_j',
      value: grout,
      unit: 'kg',
    });
    const skirting = i.skirtingLength?.si ?? 0;
    if (i.skirtingLength === undefined)
      ctx.assume.defaulted('skirtingLength', 0, 'Pas de plinthes.');
    let adhesive = 0;
    let mortarVolume = 0;
    let materials = noMaterials();
    if (i.laying === 'ADHESIVE') {
      adhesive = s * ctx.params.scalar('btp.tiling.adhesive', 'kg/m2');
      ctx.trace.step({
        id: 'T4',
        label: 'Mortier-colle',
        formula: 'C = S \\, c_c',
        value: adhesive,
        unit: 'kg',
      });
    } else {
      mortarVolume = s * ctx.params.scalar('btp.tiling.bed_thickness', 'm');
      ctx.trace.step({
        id: 'T4',
        label: 'Mortier de pose',
        formula: 'V = S \\, e_p',
        value: mortarVolume,
        unit: 'm3',
      });
      materials = mortarMaterials(ctx, 'T5', 'Mortier de pose', 'BEDDING', mortarVolume).materials;
    }
    return ok({
      area: s,
      skirting,
      tilesArea,
      tiles,
      adhesive,
      grout,
      mortarVolume,
      ...materialValues(materials, i.laying === 'ADHESIVE' ? 0 : cementBags(ctx, materials.cement)),
    });
  },
  verify() {
    return [];
  },
};

// --- Peinture -----------------------------------------------------------------------------

const paintingInput = z.object({
  area: area(),
  coats: count(10).optional(),
  primer: z.enum(['YES', 'NO']).optional(),
});
const paintingOutput = z.object({ area: nonNegative, paint: nonNegative, primer: nonNegative });

export const btpPainting: EngineDefinition<
  z.output<typeof paintingInput>,
  z.output<typeof paintingOutput>
> = {
  id: 'btp.painting',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Peinture',
  inputSchema: paintingInput,
  outputSchema: paintingOutput,
  parameters: [
    {
      key: 'btp.paint.spread_rate',
      kind: 'SCALAR',
      unitKind: 'spreadRate',
      description: 'Rendement de la peinture',
    },
    {
      key: 'btp.paint.primer_rate',
      kind: 'SCALAR',
      unitKind: 'spreadRate',
      description: "Rendement de l'impression",
    },
    {
      key: 'btp.waste.paint',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Taux de pertes sur peinture',
    },
  ],
  formulas: [
    {
      id: 'paint',
      label: 'Peinture',
      latex: 'Q = \\frac{S \\, c}{r} (1 + p) ; \\; Q_i = \\frac{S}{r_i} (1 + p)',
      symbols: [
        { symbol: 'c', meaning: 'nombre de couches' },
        { symbol: 'r', meaning: 'rendement (m²/L)' },
      ],
      source: 'Métré : surface × couches / rendement',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description: "Surface peinte, litres de peinture (couches, rendement, pertes) et d'impression.",
    inputs: [
      {
        key: 'area',
        label: 'Surface à peindre',
        kind: 'quantity',
        unitKind: 'area',
        units: ['m2'],
      },
      {
        key: 'coats',
        label: 'Nombre de couches',
        kind: 'integer',
        min: 1,
        optional: true,
        help: 'Sans saisie : 2.',
      },
      {
        key: 'primer',
        label: "Couche d'impression",
        kind: 'enum',
        optional: true,
        options: [
          { value: 'YES', label: 'Oui' },
          { value: 'NO', label: 'Non' },
        ],
        help: 'Sans choix : impression comptée.',
      },
    ],
    outputs: [
      { key: 'area', label: 'Peinture (surface)', unit: 'm2', precision: 2, family: 'PAINTING' },
      { key: 'paint', label: 'Peinture', unit: 'L', precision: 1, family: 'MATERIAL' },
      { key: 'primer', label: 'Impression', unit: 'L', precision: 1, family: 'MATERIAL' },
    ],
  },
  calculate(i, ctx) {
    const coats = i.coats ?? 2;
    if (i.coats === undefined) ctx.assume.defaulted('coats', 2, 'Deux couches de finition.');
    const primer = i.primer ?? 'YES';
    if (i.primer === undefined)
      ctx.assume.defaulted('primer', 'YES', "Couche d'impression comptée.");
    const s = i.area.si;
    const waste = ctx.params.scalar('btp.waste.paint', '1');
    const rate = ctx.params.scalar('btp.paint.spread_rate', 'm2/L');
    const paint = ((s * coats) / rate) * (1 + waste);
    ctx.trace.step({
      id: 'T1',
      label: 'Peinture de finition',
      formula: 'Q = \\frac{S \\, c}{r} (1 + p)',
      substitutions: [
        { symbol: 'S', value: s, unit: 'm2' },
        { symbol: 'c', value: coats },
        { symbol: 'r', value: rate, unit: 'm2/L' },
        { symbol: 'p', value: waste },
      ],
      value: paint,
      unit: 'L',
    });
    let primerLiters = 0;
    if (primer === 'YES') {
      primerLiters = (s / ctx.params.scalar('btp.paint.primer_rate', 'm2/L')) * (1 + waste);
      ctx.trace.step({
        id: 'T2',
        label: 'Impression',
        formula: 'Q_i = \\frac{S}{r_i} (1 + p)',
        value: primerLiters,
        unit: 'L',
      });
    }
    return ok({ area: s, paint, primer: primerLiters });
  },
  verify() {
    return [];
  },
};
