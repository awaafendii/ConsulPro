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
      z.object({
        type: z.literal('choice'),
        key: z.string(),
        label: z.string(),
        required: z.boolean(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
      }),
      z.object({
        type: z.literal('number'),
        key: z.string(),
        label: z.string(),
        required: z.boolean(),
        integer: z.boolean(),
        min: z.number(),
        exclusiveMin: z.boolean(),
        max: z.number(),
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
  z.number(),
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

/* Import de données (Phase 7) : un fichier CSV/TSV/XLSX (ou un collage) est lu, rapproché,
   coercé et validé côté serveur. La prévisualisation ne modifie rien ; la validation reste
   celle du type (jusqu'à `maxRows`, soit 50 000 pour la topographie). */

export const importDelimiterSchema = z.enum([',', ';', '\t']);
export type ImportDelimiter = z.infer<typeof importDelimiterSchema>;

/** Rattachement d'une colonne du type à une colonne source (par indice), ou absente (`null`). */
export const importColumnMappingSchema = z.object({
  key: z.string().max(80),
  sourceIndex: z.number().int().min(0).nullable(),
});

const importBaseBody = z.object({
  // Octets source encodés en base64 (CSV, TSV, XLSX ou collage) ; ~15 Mo décodés au plus.
  content: z.string().min(1).max(20_000_000),
  delimiter: importDelimiterSchema.optional(),
  mapping: z.array(importColumnMappingSchema).max(200).optional(),
  units: z.record(z.string().max(80), z.string().max(20)).optional(),
});

export const datasetImportPreviewBodySchema = importBaseBody;
export const datasetImportCommitBodySchema = importBaseBody.extend({
  note: z.string().trim().max(500).optional(),
});

export const datasetImportPreviewSchema = z.object({
  format: z.enum(['xlsx', 'delimited']),
  headers: z.array(z.string()),
  mapping: z.array(importColumnMappingSchema),
  rowCount: z.number().int().nonnegative(),
  sample: z.array(z.record(z.string(), cell)),
  errors: z.array(
    z.object({
      row: z.number().int().nonnegative(),
      column: z.string(),
      message: z.string(),
    }),
  ),
  valid: z.boolean(),
});
export type DatasetImportPreviewDto = z.infer<typeof datasetImportPreviewSchema>;
