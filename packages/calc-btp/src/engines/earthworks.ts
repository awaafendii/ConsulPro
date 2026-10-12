import { ok, type EngineDefinition } from '@consulpro/calc-core';
import { z } from 'zod';

import { count, length, LENGTH_UNITS, volume } from '../common/inputs';
import { BTP_HYPOTHESIS, nonNegative } from '../common/outputs';
import { tableValue } from '../common/quantities';

const SOILS = ['TOPSOIL', 'ORDINARY', 'CLAY', 'SAND', 'GRAVEL', 'ROCK'] as const;

const input = z
  .object({
    excavation: z.enum(['MASS', 'TRENCH', 'PIT']),
    length: length(),
    width: length(),
    depth: length(30),
    count: count().optional(),
    soil: z.enum(SOILS),
    buriedVolume: volume().optional(),
  })
  .superRefine((i, ctx) => {
    const excavation = i.length.si * i.width.si * i.depth.si * (i.count ?? 1);
    if ((i.buriedVolume?.si ?? 0) > excavation) {
      ctx.addIssue({
        code: 'custom',
        path: ['buriedVolume'],
        message: 'Le volume des ouvrages enterrés dépasse le volume des fouilles.',
        params: { code: 'BURIED_EXCEEDS_EXCAVATION' },
      });
    }
  });

const output = z.object({
  excavation: nonNegative,
  backfill: nonNegative,
  spoilBulked: nonNegative,
  excavationBulked: nonNegative,
});

export const btpEarthworks: EngineDefinition<z.output<typeof input>, z.output<typeof output>> = {
  id: 'btp.earthworks',
  version: '1.0.0',
  discipline: 'BTP',
  title: 'Terrassement (fouilles et remblais)',
  inputSchema: input,
  outputSchema: output,
  parameters: [
    {
      key: 'btp.earthworks.bulking',
      kind: 'TABLE',
      unitKind: 'dimensionless',
      description: 'Coefficient de foisonnement',
    },
  ],
  formulas: [
    {
      id: 'earthworks',
      label: 'Fouilles, remblais et évacuation',
      latex:
        'V_d = L \\, l \\, p \\, n ; \\; V_r = V_d - V_o ; \\; V_e = V_o \\, k_f ; \\; V_{df} = V_d \\, k_f',
      symbols: [
        { symbol: 'V_d', meaning: 'déblais en place', unit: 'm3' },
        { symbol: 'V_o', meaning: 'volume des ouvrages enterrés', unit: 'm3' },
        { symbol: 'V_r', meaning: 'remblai en place', unit: 'm3' },
        { symbol: 'k_f', meaning: 'coefficient de foisonnement' },
      ],
      source: 'Métré : les terres non remises en remblai sont évacuées foisonnées',
    },
  ],
  hypotheses: [
    BTP_HYPOTHESIS,
    {
      code: 'BTP.EARTHWORKS_BACKFILL',
      text: 'Les terres extraites sont remises en remblai autour des ouvrages ; seul le volume des ouvrages est évacué.',
    },
  ],
  presentation: {
    description:
      'Fouilles en pleine masse, en rigole ou en puits ; remblai ; volume foisonné des terres à évacuer.',
    inputs: [
      {
        key: 'excavation',
        label: 'Type de fouille',
        kind: 'enum',
        options: [
          { value: 'MASS', label: 'En pleine masse' },
          { value: 'TRENCH', label: 'En rigole (tranchée)' },
          { value: 'PIT', label: 'En puits' },
        ],
      },
      {
        key: 'length',
        label: 'Longueur (longueur totale pour une rigole)',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      { key: 'width', label: 'Largeur', kind: 'quantity', unitKind: 'length', units: LENGTH_UNITS },
      {
        key: 'depth',
        label: 'Profondeur',
        kind: 'quantity',
        unitKind: 'length',
        units: LENGTH_UNITS,
      },
      {
        key: 'count',
        label: 'Nombre de fouilles identiques',
        kind: 'integer',
        min: 1,
        optional: true,
        help: 'Sans saisie : 1.',
      },
      {
        key: 'soil',
        label: 'Nature du sol',
        kind: 'enum',
        options: [
          { value: 'TOPSOIL', label: 'Terre végétale' },
          { value: 'ORDINARY', label: 'Terre ordinaire' },
          { value: 'CLAY', label: 'Argile' },
          { value: 'SAND', label: 'Sable' },
          { value: 'GRAVEL', label: 'Graveleux' },
          { value: 'ROCK', label: 'Rocher' },
        ],
      },
      {
        key: 'buriedVolume',
        label: 'Volume des ouvrages enterrés',
        kind: 'quantity',
        unitKind: 'volume',
        units: ['m3'],
        optional: true,
        help: 'Peut reprendre le béton d’un calcul de semelles. Sans saisie : 0.',
      },
    ],
    outputs: [
      {
        key: 'excavation',
        label: 'Déblais (en place)',
        unit: 'm3',
        precision: 3,
        family: 'EARTHWORKS',
      },
      {
        key: 'backfill',
        label: 'Remblai (en place)',
        unit: 'm3',
        precision: 3,
        family: 'EARTHWORKS',
      },
      {
        key: 'spoilBulked',
        label: 'Terres à évacuer (foisonnées)',
        unit: 'm3',
        precision: 3,
        family: 'EARTHWORKS',
      },
      { key: 'excavationBulked', label: 'Déblais foisonnés (total)', unit: 'm3', precision: 3 },
    ],
  },
  calculate(i, ctx) {
    const n = i.count ?? 1;
    if (i.count === undefined) ctx.assume.defaulted('count', 1, 'Une seule fouille.');
    const excavation = i.length.si * i.width.si * i.depth.si * n;
    ctx.trace.step({
      id: 'T1',
      label: 'Déblais en place',
      formula: 'V_d = L \\, l \\, p \\, n',
      substitutions: [
        { symbol: 'L', value: i.length.si, unit: 'm' },
        { symbol: 'l', value: i.width.si, unit: 'm' },
        { symbol: 'p', value: i.depth.si, unit: 'm' },
        { symbol: 'n', value: n },
      ],
      value: excavation,
      unit: 'm3',
    });
    const buried = i.buriedVolume?.si ?? 0;
    if (i.buriedVolume === undefined) {
      ctx.assume.defaulted('buriedVolume', 0, 'Aucun ouvrage enterré déduit du remblai.');
    }
    const backfill = excavation - buried;
    ctx.trace.step({
      id: 'T2',
      label: 'Remblai en place',
      formula: 'V_r = V_d - V_o',
      value: backfill,
      unit: 'm3',
    });
    const k = tableValue(ctx, 'btp.earthworks.bulking', { soil: i.soil }, '1');
    const spoilBulked = buried * k;
    ctx.trace.step({
      id: 'T3',
      label: 'Terres à évacuer (foisonnées)',
      formula: 'V_e = V_o \\, k_f',
      substitutions: [
        { symbol: 'V_o', value: buried, unit: 'm3' },
        { symbol: 'k_f', value: k },
      ],
      value: spoilBulked,
      unit: 'm3',
      source: 'Référentiel « Usages courants — métré » (btp.earthworks.bulking)',
    });
    const excavationBulked = excavation * k;
    ctx.trace.step({
      id: 'T4',
      label: 'Déblais foisonnés',
      formula: 'V_{df} = V_d \\, k_f',
      value: excavationBulked,
      unit: 'm3',
    });
    return ok({ excavation, backfill, spoilBulked, excavationBulked });
  },
  verify() {
    return [];
  },
};
