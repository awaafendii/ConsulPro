import { checkLimit, ok, quantity, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { DEMO_HYPOTHESIS } from './common';

/*
 * MOTEUR DE DÉMONSTRATION — sans valeur technique.
 * Il éprouve le socle de calcul (référentiels, révisions, contrôle) avant le premier moteur
 * métier (Phase 4). Il n'est enregistré qu'en développement et en test
 * (CONSULPRO_DEMO_ENGINES=true) et ne lit que le référentiel fictif DEMO.
 */

const positiveLength = (max: number) => quantity('length', { min: 0, exclusiveMin: true, max });

const input = z.object({
  length: positiveLength(1000),
  width: positiveLength(1000),
  thickness: positiveLength(5),
});

const output = z.object({
  area: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  volumeWithWaste: z.number().nonnegative(),
});

export const demoSlabVolume: EngineDefinition<z.output<typeof input>, z.output<typeof output>> = {
  id: 'demo.slab-volume',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Démonstration — volume de béton d’une dalle',
  inputSchema: input,
  outputSchema: output,
  parameters: [
    {
      key: 'demo.waste_rate',
      kind: 'SCALAR',
      unitKind: 'dimensionless',
      description: 'Taux de pertes (démonstration)',
    },
    {
      key: 'demo.max_area',
      kind: 'SCALAR',
      unitKind: 'area',
      description: 'Surface maximale (démonstration)',
    },
  ],
  formulas: [
    {
      id: 'area',
      label: 'Surface',
      latex: 'A = L \\times l',
      symbols: [
        { symbol: 'L', meaning: 'longueur', unit: 'm' },
        { symbol: 'l', meaning: 'largeur', unit: 'm' },
      ],
      source: 'Géométrie',
    },
    {
      id: 'volume',
      label: 'Volume avec pertes',
      latex: 'V_p = A \\times e \\times (1 + p)',
      symbols: [
        { symbol: 'e', meaning: 'épaisseur', unit: 'm' },
        { symbol: 'p', meaning: 'taux de pertes' },
      ],
      source: 'Démonstration ConsulPro',
    },
  ],
  hypotheses: [
    DEMO_HYPOTHESIS,
    { code: 'DEMO.RECTANGULAR', text: 'Dalle rectangulaire d’épaisseur constante.' },
  ],
  presentation: {
    description:
      'Calcul de démonstration : surface, volume et volume avec pertes d’une dalle rectangulaire.',
    inputs: [
      {
        key: 'length',
        label: 'Longueur',
        kind: 'quantity',
        unitKind: 'length',
        units: ['m', 'cm'],
      },
      { key: 'width', label: 'Largeur', kind: 'quantity', unitKind: 'length', units: ['m', 'cm'] },
      {
        key: 'thickness',
        label: 'Épaisseur',
        kind: 'quantity',
        unitKind: 'length',
        units: ['cm', 'm', 'mm'],
      },
    ],
    outputs: [
      { key: 'area', label: 'Surface', unit: 'm2', precision: 2 },
      { key: 'volume', label: 'Volume', unit: 'm3', precision: 3 },
      { key: 'volumeWithWaste', label: 'Volume avec pertes', unit: 'm3', precision: 3 },
    ],
  },
  calculate(i, ctx) {
    const area = i.length.si * i.width.si;
    ctx.trace.step({
      id: 'T1',
      label: 'Surface',
      formula: 'A = L \\times l',
      substitutions: [
        { symbol: 'L', value: i.length.si, unit: 'm' },
        { symbol: 'l', value: i.width.si, unit: 'm' },
      ],
      value: area,
      unit: 'm2',
    });
    const volume = area * i.thickness.si;
    ctx.trace.step({
      id: 'T2',
      label: 'Volume',
      formula: 'V = A \\times e',
      substitutions: [
        { symbol: 'A', value: area, unit: 'm2' },
        { symbol: 'e', value: i.thickness.si, unit: 'm' },
      ],
      value: volume,
      unit: 'm3',
    });
    const waste = ctx.params.scalar('demo.waste_rate', '1');
    const volumeWithWaste = volume * (1 + waste);
    ctx.trace.step({
      id: 'T3',
      label: 'Volume avec pertes',
      formula: 'V_p = V \\times (1 + p)',
      substitutions: [
        { symbol: 'V', value: volume, unit: 'm3' },
        { symbol: 'p', value: waste },
      ],
      value: volumeWithWaste,
      unit: 'm3',
      source: 'Paramètre demo.waste_rate',
    });
    return ok({ area, volume, volumeWithWaste });
  },
  verify(_input, out, ctx) {
    return [
      checkLimit({
        rule: 'demo.max-area',
        label: 'Surface au plus égale à la surface maximale de démonstration',
        measured: out.area,
        limit: ctx.params.scalar('demo.max_area', 'm2'),
        comparison: '<=',
        severity: 'BLOCKING',
        unit: 'm2',
      }),
    ];
  },
};
