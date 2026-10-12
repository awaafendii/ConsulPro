import { ok, type EngineDefinition, type InputPresentation } from '@consulpro/calc-core';
import { z } from 'zod';

import {
  count,
  length,
  LENGTH_UNITS,
  scheduleRequired,
  SMALL_LENGTH_UNITS,
  STEEL_PRESENTATION,
  steelFields,
  yesNo,
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
  type SteelElement,
} from '../common/quantities';

/*
 * Éléments en béton armé coulés en place : semelles, longrines, poteaux, poutres.
 * Quantités nettes (béton, coffrage, aciers) pour le quantitatif ; matériaux commandés
 * (avec pertes) pour la décomposition.
 */

const LEAN_PARAMETERS = [
  {
    key: 'btp.lean_concrete.thickness',
    kind: 'SCALAR',
    unitKind: 'length',
    description: 'Épaisseur du béton de propreté',
  },
  {
    key: 'btp.lean_concrete.overhang',
    kind: 'SCALAR',
    unitKind: 'length',
    description: 'Débord du béton de propreté (par côté)',
  },
] as const;

const elementOutput = z.object({
  concrete: nonNegative,
  leanConcrete: nonNegative,
  formwork: nonNegative,
  steel: nonNegative,
  steelOrdered: nonNegative,
  ...materialShape,
});
type ElementOutput = z.output<typeof elementOutput>;

const ELEMENT_OUTPUTS = [
  { key: 'concrete', label: 'Béton armé', unit: 'm3', precision: 3, family: 'CONCRETE' },
  { key: 'leanConcrete', label: 'Béton de propreté', unit: 'm3', precision: 3, family: 'CONCRETE' },
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
  ...MATERIAL_OUTPUTS,
] as const;

const LEAN_PRESENTATION: InputPresentation = {
  key: 'leanConcrete',
  label: 'Béton de propreté',
  kind: 'enum',
  optional: true,
  options: [
    { value: 'YES', label: 'Oui' },
    { value: 'NO', label: 'Non' },
  ],
  help: 'Sans choix : béton de propreté compté (hypothèse tracée).',
};

interface Geometry {
  readonly concrete: number;
  readonly formwork: number;
  /** Surface d'appui pour le béton de propreté (débords compris). */
  readonly leanArea: number;
}

type CalcInput = {
  steelMode?: 'RATIO' | 'SCHEDULE' | undefined;
  schedule?: z.output<typeof steelFields.schedule>;
  leanConcrete?: 'YES' | 'NO' | undefined;
};

/** Fin de calcul commune : béton de propreté, aciers, matériaux. */
function finish(
  ctx: Parameters<EngineDefinition<unknown, unknown>['calculate']>[1],
  input: CalcInput,
  element: SteelElement,
  geometry: Geometry,
  withLean: boolean,
): ElementOutput {
  let leanConcrete = 0;
  if (withLean) {
    const lean = input.leanConcrete ?? 'YES';
    if (input.leanConcrete === undefined) {
      ctx.assume.defaulted('leanConcrete', 'YES', 'Béton de propreté compté sous l’élément.');
    }
    if (lean === 'YES') {
      const thickness = ctx.params.scalar('btp.lean_concrete.thickness', 'm');
      leanConcrete = geometry.leanArea * thickness;
      ctx.trace.step({
        id: 'T3',
        label: 'Béton de propreté',
        formula: 'V_p = S_p \\times e_p',
        substitutions: [
          { symbol: 'S_p', value: geometry.leanArea, unit: 'm2' },
          { symbol: 'e_p', value: thickness, unit: 'm' },
        ],
        value: leanConcrete,
        unit: 'm3',
      });
    }
  }
  const bars = steel(ctx, 'T4', input, element, geometry.concrete);
  let materials = concreteMaterials(ctx, 'T5', 'Béton armé', 'ARME', geometry.concrete);
  materials = concreteMaterials(
    ctx,
    'T6',
    'Béton de propreté',
    'PROPRETE',
    leanConcrete,
    materials,
  );
  return {
    concrete: geometry.concrete,
    leanConcrete,
    formwork: geometry.formwork,
    steel: bars.net,
    steelOrdered: bars.ordered,
    ...materialValues(materials, cementBags(ctx, materials.cement)),
  };
}

const PARAMETERS = requirements(CONCRETE_PARAMETERS, STEEL_PARAMETERS);
const PARAMETERS_WITH_LEAN = requirements(PARAMETERS, LEAN_PARAMETERS);

// --- Semelles -----------------------------------------------------------------------------

const footingInput = z
  .object({
    type: z.enum(['ISOLATED', 'STRIP']),
    length: length(),
    width: length(20),
    height: length(5),
    count: count().optional(),
    leanConcrete: yesNo.optional(),
    ...steelFields,
  })
  .superRefine(scheduleRequired);

export const btpFootings: EngineDefinition<z.output<typeof footingInput>, ElementOutput> = {
  id: 'btp.footings',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Semelles isolées ou filantes',
  inputSchema: footingInput,
  outputSchema: elementOutput,
  parameters: PARAMETERS_WITH_LEAN,
  formulas: [
    {
      id: 'footing',
      label: 'Semelle',
      latex: 'V = A \\times B \\times H \\times n ; \\; S_c = 2(A + B) H n',
      symbols: [
        { symbol: 'A', meaning: 'longueur (côté ou longueur totale)', unit: 'm' },
        { symbol: 'B', meaning: 'largeur', unit: 'm' },
        { symbol: 'H', meaning: 'hauteur', unit: 'm' },
        { symbol: 'n', meaning: 'nombre de semelles identiques' },
      ],
      source: 'Métré : volume d’un parallélépipède, coffrage des faces latérales',
    },
  ],
  hypotheses: [
    BTP_HYPOTHESIS,
    {
      code: 'BTP.FORMWORK_SIDES',
      text: 'Coffrage : faces latérales seulement (le fond repose sur le béton de propreté).',
    },
  ],
  presentation: {
    description:
      'Béton, béton de propreté, coffrage et aciers de semelles isolées (par type) ou filantes.',
    inputs: [
      {
        key: 'type',
        label: 'Type de semelle',
        kind: 'enum',
        options: [
          { value: 'ISOLATED', label: 'Isolée' },
          { value: 'STRIP', label: 'Filante' },
        ],
      },
      {
        key: 'length',
        label: 'Longueur (côté, ou longueur totale si filante)',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      { key: 'width', label: 'Largeur', kind: 'quantity', unitKind: 'length', units: LENGTH_UNITS },
      {
        key: 'height',
        label: 'Hauteur',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'count',
        label: 'Nombre de semelles identiques',
        kind: 'integer',
        min: 1,
        optional: true,
        help: 'Sans saisie : 1.',
      },
      LEAN_PRESENTATION,
      ...STEEL_PRESENTATION,
    ],
    outputs: ELEMENT_OUTPUTS,
  },
  calculate(i, ctx) {
    const n = i.count ?? 1;
    if (i.count === undefined) ctx.assume.defaulted('count', 1, 'Une seule semelle de ce type.');
    const [a, b, h] = [i.length.si, i.width.si, i.height.si];
    const concrete = a * b * h * n;
    ctx.trace.step({
      id: 'T1',
      label: 'Béton des semelles',
      formula: 'V = A \\times B \\times H \\times n',
      substitutions: [
        { symbol: 'A', value: a, unit: 'm' },
        { symbol: 'B', value: b, unit: 'm' },
        { symbol: 'H', value: h, unit: 'm' },
        { symbol: 'n', value: n },
      ],
      value: concrete,
      unit: 'm3',
    });
    const formwork = 2 * (a + b) * h * n;
    ctx.trace.step({
      id: 'T2',
      label: 'Coffrage des faces latérales',
      formula: 'S_c = 2(A + B) H n',
      value: formwork,
      unit: 'm2',
    });
    const d = ctx.params.scalar('btp.lean_concrete.overhang', 'm');
    return ok(
      finish(
        ctx,
        i,
        'FOOTING',
        { concrete, formwork, leanArea: (a + 2 * d) * (b + 2 * d) * n },
        true,
      ),
    );
  },
  verify() {
    return [];
  },
};

// --- Longrines ----------------------------------------------------------------------------

const groundBeamInput = z
  .object({
    length: length(),
    width: length(5),
    height: length(5),
    formworkBottom: yesNo.optional(),
    leanConcrete: yesNo.optional(),
    ...steelFields,
  })
  .superRefine(scheduleRequired);

export const btpGroundBeams: EngineDefinition<z.output<typeof groundBeamInput>, ElementOutput> = {
  id: 'btp.ground-beams',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Longrines',
  inputSchema: groundBeamInput,
  outputSchema: elementOutput,
  parameters: PARAMETERS_WITH_LEAN,
  formulas: [
    {
      id: 'ground-beam',
      label: 'Longrine',
      latex: 'V = L \\times b \\times h ; \\; S_c = 2 h L \\; (+ \\, b L)',
      symbols: [
        { symbol: 'L', meaning: 'longueur totale', unit: 'm' },
        { symbol: 'b', meaning: 'largeur', unit: 'm' },
        { symbol: 'h', meaning: 'hauteur', unit: 'm' },
      ],
      source: 'Métré : volume, joues (et fond si coffré)',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description:
      'Béton, béton de propreté, coffrage (joues, fond éventuel) et aciers de longrines.',
    inputs: [
      {
        key: 'length',
        label: 'Longueur totale',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      {
        key: 'width',
        label: 'Largeur',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'height',
        label: 'Hauteur',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'formworkBottom',
        label: 'Fond coffré',
        kind: 'enum',
        optional: true,
        options: [
          { value: 'NO', label: 'Non (coulée sur béton de propreté)' },
          { value: 'YES', label: 'Oui' },
        ],
        help: 'Sans choix : fond non coffré.',
      },
      LEAN_PRESENTATION,
      ...STEEL_PRESENTATION,
    ],
    outputs: ELEMENT_OUTPUTS,
  },
  calculate(i, ctx) {
    const [l, b, h] = [i.length.si, i.width.si, i.height.si];
    const concrete = l * b * h;
    ctx.trace.step({
      id: 'T1',
      label: 'Béton des longrines',
      formula: 'V = L \\times b \\times h',
      value: concrete,
      unit: 'm3',
    });
    if (i.formworkBottom === undefined) {
      ctx.assume.defaulted('formworkBottom', 'NO', 'Fond des longrines non coffré.');
    }
    const formwork = 2 * h * l + (i.formworkBottom === 'YES' ? b * l : 0);
    ctx.trace.step({
      id: 'T2',
      label: 'Coffrage',
      formula: 'S_c = 2 h L \\; (+ \\, b L)',
      value: formwork,
      unit: 'm2',
    });
    const d = ctx.params.scalar('btp.lean_concrete.overhang', 'm');
    return ok(
      finish(ctx, i, 'GROUND_BEAM', { concrete, formwork, leanArea: l * (b + 2 * d) }, true),
    );
  },
  verify() {
    return [];
  },
};

// --- Poteaux ------------------------------------------------------------------------------

const columnInput = z
  .object({
    sectionA: length(5),
    sectionB: length(5),
    height: length(50),
    count: count().optional(),
    ...steelFields,
  })
  .superRefine(scheduleRequired);

export const btpColumns: EngineDefinition<z.output<typeof columnInput>, ElementOutput> = {
  id: 'btp.columns',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Poteaux',
  inputSchema: columnInput,
  outputSchema: elementOutput,
  parameters: PARAMETERS,
  formulas: [
    {
      id: 'column',
      label: 'Poteau rectangulaire',
      latex: 'V = a \\, b \\, h \\, n ; \\; S_c = 2(a + b) h n',
      symbols: [
        { symbol: 'a', meaning: 'côté 1', unit: 'm' },
        { symbol: 'b', meaning: 'côté 2', unit: 'm' },
        { symbol: 'h', meaning: 'hauteur', unit: 'm' },
      ],
      source: 'Métré : volume et coffrage périphérique',
    },
  ],
  hypotheses: [BTP_HYPOTHESIS],
  presentation: {
    description: 'Béton, coffrage et aciers de poteaux rectangulaires identiques.',
    inputs: [
      {
        key: 'sectionA',
        label: 'Côté a de la section',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'sectionB',
        label: 'Côté b de la section',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'height',
        label: 'Hauteur',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      {
        key: 'count',
        label: 'Nombre de poteaux',
        kind: 'integer',
        min: 1,
        optional: true,
        help: 'Sans saisie : 1.',
      },
      ...STEEL_PRESENTATION,
    ],
    outputs: ELEMENT_OUTPUTS,
  },
  calculate(i, ctx) {
    const n = i.count ?? 1;
    if (i.count === undefined) ctx.assume.defaulted('count', 1, 'Un seul poteau.');
    const [a, b, h] = [i.sectionA.si, i.sectionB.si, i.height.si];
    const concrete = a * b * h * n;
    ctx.trace.step({
      id: 'T1',
      label: 'Béton des poteaux',
      formula: 'V = a \\, b \\, h \\, n',
      value: concrete,
      unit: 'm3',
    });
    const formwork = 2 * (a + b) * h * n;
    ctx.trace.step({
      id: 'T2',
      label: 'Coffrage',
      formula: 'S_c = 2(a + b) h n',
      value: formwork,
      unit: 'm2',
    });
    return ok(finish(ctx, i, 'COLUMN', { concrete, formwork, leanArea: 0 }, false));
  },
  verify() {
    return [];
  },
};

// --- Poutres ------------------------------------------------------------------------------

const beamInput = z
  .object({
    length: length(),
    width: length(5),
    dropHeight: length(5),
    count: count().optional(),
    ...steelFields,
  })
  .superRefine(scheduleRequired);

export const btpBeams: EngineDefinition<z.output<typeof beamInput>, ElementOutput> = {
  id: 'btp.beams',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Poutres',
  inputSchema: beamInput,
  outputSchema: elementOutput,
  parameters: PARAMETERS,
  formulas: [
    {
      id: 'beam',
      label: 'Poutre (retombée sous dalle)',
      latex: 'V = b \\, h_r \\, L \\, n ; \\; S_c = (b + 2 h_r) L n',
      symbols: [
        { symbol: 'b', meaning: 'largeur', unit: 'm' },
        { symbol: 'h_r', meaning: 'retombée sous la dalle', unit: 'm' },
        { symbol: 'L', meaning: 'longueur', unit: 'm' },
      ],
      source: 'Métré : la partie dans l’épaisseur de la dalle est comptée avec la dalle',
    },
  ],
  hypotheses: [
    BTP_HYPOTHESIS,
    {
      code: 'BTP.BEAM_DROP',
      text: 'Seule la retombée sous la dalle est comptée (la partie dans la dalle l’est avec la dalle).',
    },
  ],
  presentation: {
    description: 'Béton, coffrage (fond et joues) et aciers de la retombée de poutres.',
    inputs: [
      {
        key: 'length',
        label: 'Longueur (par poutre)',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      {
        key: 'width',
        label: 'Largeur',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'dropHeight',
        label: 'Retombée sous la dalle',
        kind: 'quantity',
        unitKind: 'length',
        units: SMALL_LENGTH_UNITS,
      },
      {
        key: 'count',
        label: 'Nombre de poutres identiques',
        kind: 'integer',
        min: 1,
        optional: true,
        help: 'Sans saisie : 1.',
      },
      ...STEEL_PRESENTATION,
    ],
    outputs: ELEMENT_OUTPUTS,
  },
  calculate(i, ctx) {
    const n = i.count ?? 1;
    if (i.count === undefined) ctx.assume.defaulted('count', 1, 'Une seule poutre.');
    const [l, b, hr] = [i.length.si, i.width.si, i.dropHeight.si];
    const concrete = b * hr * l * n;
    ctx.trace.step({
      id: 'T1',
      label: 'Béton des poutres',
      formula: 'V = b \\, h_r \\, L \\, n',
      value: concrete,
      unit: 'm3',
    });
    const formwork = (b + 2 * hr) * l * n;
    ctx.trace.step({
      id: 'T2',
      label: 'Coffrage (fond et joues)',
      formula: 'S_c = (b + 2 h_r) L n',
      value: formwork,
      unit: 'm2',
    });
    return ok(finish(ctx, i, 'BEAM', { concrete, formwork, leanArea: 0 }, false));
  },
  verify() {
    return [];
  },
};
