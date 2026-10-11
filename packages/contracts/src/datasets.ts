import { z } from 'zod';

import { disciplineSchema } from './projects';

/* Données de projet : jeux de données typés et versionnés (Phase 3). */

export const datasetKindSchema = z.object({
  id: z.string(),
  discipline: disciplineSchema,
  label: z.string(),
  maxRows: z.number().int(),
  columns: z.array(
    z.discriminatedUnion('type', [
      z.object({
        type: z.literal('text'),
        key: z.string(),
        label: z.string(),
        required: z.boolean(),
        maxLength: z.number().int(),
      }),
      z.object({
        type: z.literal('quantity'),
        key: z.string(),
        label: z.string(),
        required: z.boolean(),
        unitKind: z.string(),
        units: z.array(z.object({ symbol: z.string(), display: z.string() })),
        positive: z.boolean(),
      }),
    ]),
  ),
});
export type DatasetKindDto = z.infer<typeof datasetKindSchema>;
export const datasetKindListSchema = z.object({ items: z.array(datasetKindSchema) });

export const datasetBodySchema = z.object({
  kind: z.string().min(1).max(40),
  title: z.string().trim().min(2).max(160),
});

export const datasetSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  discipline: disciplineSchema,
  title: z.string(),
  current: z
    .object({
      number: z.number().int().positive(),
      rowCount: z.number().int().nonnegative(),
      authorName: z.string(),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type DatasetDto = z.infer<typeof datasetSchema>;
export const datasetListSchema = z.object({ items: z.array(datasetSchema) });

const cell = z.union([
  z.string().max(2000),
  z.object({ value: z.number(), unit: z.string().max(20) }),
  z.null(),
]);

export const datasetRevisionBodySchema = z.object({
  rows: z.array(z.record(z.string().max(80), cell)).max(5000),
  note: z.string().trim().max(500).optional(),
});

export const datasetRevisionSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  rows: z.array(z.record(z.string(), cell)),
  note: z.string().nullable(),
  authorName: z.string(),
  createdAt: z.iso.datetime(),
});
export type DatasetRevisionDto = z.infer<typeof datasetRevisionSchema>;
