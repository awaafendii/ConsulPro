/**
 * Moteur et paramètres DE TEST uniquement (jamais exposés à l'utilisateur).
 * Les valeurs sont arbitraires et sans portée normative.
 */
import { z } from 'zod';

import type { EngineDefinition } from '../engine';
import type { ResolvedParameter } from '../params/parameter';
import { ResolvedParameterSet } from '../params/resolved-parameter-set';
import { err, ok } from '../result/result';
import { checkLimit } from '../trace/recorders';
import { quantity } from '../units/quantity';

export const slabInput = z.object({
  length: quantity('length', { min: 0, exclusiveMin: true }),
  width: quantity('length', { min: 0, exclusiveMin: true }).optional(),
  thickness: quantity('length', { min: 0, exclusiveMin: true }),
  mode: z
    .enum([
      'NORMAL',
      'FAIL',
      'THROW',
      'THROW_STRING',
      'BAD_OUTPUT',
      'UNDECLARED',
      'MUTATE',
      'VERIFY_THROWS',
    ])
    .default('NORMAL'),
});

export const slabOutput = z.object({
  areaM2: z.number().nonnegative(),
  volumeM3: z.number().nonnegative(),
  volumeWithWasteM3: z.number().nonnegative(),
});

type SlabInput = z.output<typeof slabInput>;
type SlabOutput = z.output<typeof slabOutput>;

export const testSlabEngine: EngineDefinition<SlabInput, SlabOutput> = {
  id: 'test.slab-volume',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Moteur de test : volume de dalle',
  inputSchema: slabInput,
  outputSchema: slabOutput,
  parameters: [
    { key: 'test.waste', kind: 'SCALAR', unitKind: 'dimensionless', description: 'Taux de perte' },
    { key: 'test.max_area', kind: 'SCALAR', unitKind: 'area', description: 'Surface maximale' },
    {
      key: 'test.optional',
      kind: 'SCALAR',
      unitKind: 'length',
      optional: true,
      description: 'Optionnel',
    },
  ],
  formulas: [
    {
      id: 'area',
      label: 'Surface',
      latex: 'A = L \\times l',
      symbols: [{ symbol: 'L', meaning: 'longueur', unit: 'm' }],
      source: 'Géométrie',
    },
  ],
  hypotheses: [{ code: 'TEST.RECTANGULAR', text: 'Dalle rectangulaire d’épaisseur constante.' }],
  calculate(input, ctx) {
    if (input.mode === 'FAIL')
      return err({ code: 'NON_CONVERGENCE', message: 'Pas de convergence (test).' });
    if (input.mode === 'THROW') throw new Error('panne interne (test)');
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- cas testé volontairement
    if (input.mode === 'THROW_STRING') throw 'chaîne levée';
    if (input.mode === 'UNDECLARED') ctx.params.scalar('test.undeclared', '1');
    if (input.mode === 'MUTATE') (input as { mode: string }).mode = 'X';

    let widthM: number;
    if (input.width) {
      widthM = input.width.si;
    } else {
      widthM = 1;
      ctx.assume.defaulted(
        'width',
        { value: 1, unit: 'm' },
        'Largeur non renseignée : 1 m retenu.',
      );
    }
    const areaM2 = input.length.si * widthM;
    ctx.trace.step({
      id: 'T1',
      label: 'Surface',
      formula: 'A = L \\times l',
      value: areaM2,
      unit: 'm2',
    });
    const volumeM3 = areaM2 * input.thickness.si;
    const waste = ctx.params.scalar('test.waste', '1');
    if (ctx.params.has('test.optional')) ctx.params.scalar('test.optional', 'm');
    if (areaM2 > 1000) ctx.warn.warn('TEST.LARGE', 'Grande surface.', 'INFO');
    if (input.mode === 'BAD_OUTPUT')
      return ok({ areaM2: -1, volumeM3, volumeWithWasteM3: volumeM3 });
    return ok({ areaM2, volumeM3, volumeWithWasteM3: volumeM3 * (1 + waste) });
  },
  verify(input, output, ctx) {
    if (input.mode === 'VERIFY_THROWS') throw new Error('vérification en panne (test)');
    return [
      checkLimit({
        rule: 'test.max-area',
        label: 'Surface maximale',
        measured: output.areaM2,
        limit: ctx.params.scalar('test.max_area', 'm2'),
        comparison: '<=',
        severity: 'BLOCKING',
        unit: 'm2',
      }),
      checkLimit({
        rule: 'test.min-volume',
        label: 'Volume minimal conseillé',
        measured: output.volumeM3,
        limit: 0.5,
        comparison: '>=',
        severity: 'WARNING',
        unit: 'm3',
      }),
    ];
  },
};

export function param(
  overrides: Partial<ResolvedParameter> & Pick<ResolvedParameter, 'key'>,
): ResolvedParameter {
  return {
    kind: 'SCALAR',
    value: 0,
    unit: '1',
    source: { document: 'Référentiel de test', clause: '§1' },
    verification: 'VERIFIED',
    ...overrides,
  } as ResolvedParameter;
}

export function slabParams(extra: readonly ResolvedParameter[] = []): ResolvedParameterSet {
  const set = ResolvedParameterSet.create(
    [
      param({ key: 'test.waste', value: 5, unit: '%' }),
      param({ key: 'test.max_area', value: 500, unit: 'm2' }),
      ...extra,
    ],
    [{ standardVersionId: 'sv-test', code: 'TEST', version: '1' }],
  );
  if (!set.ok) throw new Error('fixtures invalides');
  return set.value;
}
