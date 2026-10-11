import { ok, quantity, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { DEMO_HYPOTHESIS } from './common';

/*
 * MOTEUR DE DÉMONSTRATION — sans valeur technique. Son entrée « volume » peut reprendre la
 * sortie d'un autre calcul (dépendance) : il éprouve le signalement d'obsolescence.
 */

const input = z.object({
  volume: quantity('volume', { min: 0, exclusiveMin: true, max: 1e5 }),
  density: quantity('density', { min: 0, exclusiveMin: true, max: 3e4 }),
});

const output = z.object({ mass: z.number().nonnegative() });

export const demoSlabMass: EngineDefinition<z.output<typeof input>, z.output<typeof output>> = {
  id: 'demo.slab-mass',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Démonstration — masse d’un volume de béton',
  inputSchema: input,
  outputSchema: output,
  parameters: [],
  formulas: [
    {
      id: 'mass',
      label: 'Masse',
      latex: 'M = V \\times \\rho',
      symbols: [
        { symbol: 'V', meaning: 'volume', unit: 'm3' },
        { symbol: '\\rho', meaning: 'masse volumique', unit: 'kg/m3' },
      ],
      source: 'Définition de la masse volumique',
    },
  ],
  hypotheses: [DEMO_HYPOTHESIS],
  presentation: {
    description: 'Calcul de démonstration : masse d’un volume de béton.',
    inputs: [
      { key: 'volume', label: 'Volume', kind: 'quantity', unitKind: 'volume', units: ['m3', 'L'] },
      {
        key: 'density',
        label: 'Masse volumique',
        kind: 'quantity',
        unitKind: 'density',
        units: ['kg/m3', 't/m3'],
        help: 'Saisie de l’utilisateur (aucune valeur par défaut).',
      },
    ],
    outputs: [{ key: 'mass', label: 'Masse', unit: 'kg', precision: 0 }],
  },
  calculate(i, ctx) {
    const mass = i.volume.si * i.density.si;
    ctx.trace.step({
      id: 'T1',
      label: 'Masse',
      formula: 'M = V \\times \\rho',
      substitutions: [
        { symbol: 'V', value: i.volume.si, unit: 'm3' },
        { symbol: '\\rho', value: i.density.si, unit: 'kg/m3' },
      ],
      value: mass,
      unit: 'kg',
    });
    return ok({ mass });
  },
  verify() {
    return [];
  },
};
