import { z } from 'zod';

import { disciplineSchema } from './projects';

export const standardVersionStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'DEPRECATED']);

export const standardSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
  publisher: z.string().nullable(),
  discipline: disciplineSchema.nullable(),
  nature: z.enum(['NORM', 'GUIDE', 'PRACTICE', 'CUSTOM']),
  scope: z.enum(['SYSTEM', 'ORGANIZATION']),
  versions: z.array(
    z.object({
      id: z.uuid(),
      label: z.string(),
      status: standardVersionStatusSchema,
      publishedAt: z.iso.datetime().nullable(),
      parameterCount: z.number().int(),
      toVerifyCount: z.number().int(),
    }),
  ),
});
export type StandardSummaryDto = z.infer<typeof standardSummarySchema>;

export const standardListSchema = z.object({ items: z.array(standardSummarySchema) });

/** Valeur d'un paramètre (même forme que ParameterValue de calc-core). */
export const parameterValueDtoSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SCALAR'), value: z.number(), unit: z.string() }),
  z.object({ kind: z.literal('ENUM'), value: z.string(), allowed: z.array(z.string()) }),
  z.object({ kind: z.literal('TABLE'), table: z.record(z.string(), z.unknown()) }),
]);
export type ParameterValueDto = z.infer<typeof parameterValueDtoSchema>;

const sourceDtoSchema = z.object({
  document: z.string(),
  clause: z.string().optional(),
  table: z.string().optional(),
  note: z.string().optional(),
});

/** Libellés d'affichage des unités employées (symbole → affichage, ex. m2 → m²). */
const unitsSchema = z.record(z.string(), z.string());

export const standardVersionDetailSchema = z.object({
  id: z.uuid(),
  units: unitsSchema,
  standard: standardSummarySchema.omit({ versions: true }),
  label: z.string(),
  status: standardVersionStatusSchema,
  sourceNotes: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  parameters: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: parameterValueDtoSchema,
      source: sourceDtoSchema,
      verification: z.enum(['VERIFIED', 'TO_VERIFY']),
    }),
  ),
  rules: z.array(
    z.object({
      code: z.string(),
      description: z.string(),
      severity: z.enum(['BLOCKING', 'WARNING', 'INFO']),
      clause: z.string().nullable(),
      parameterKeys: z.array(z.string()),
    }),
  ),
});
export type StandardVersionDetailDto = z.infer<typeof standardVersionDetailSchema>;

export const overrideBodySchema = z.object({
  standardVersionId: z.uuid(),
  key: z.string().min(1).max(200),
  value: parameterValueDtoSchema,
  justification: z.string().trim().min(3).max(1000),
});
export const updateOverrideBodySchema = overrideBodySchema.pick({
  value: true,
  justification: true,
});

export const overrideSchema = z.object({
  id: z.uuid(),
  scope: z.enum(['ORGANIZATION', 'PROJECT']),
  projectId: z.uuid().nullable(),
  standardVersionId: z.uuid(),
  standardCode: z.string(),
  standardVersionLabel: z.string(),
  key: z.string(),
  label: z.string(),
  value: parameterValueDtoSchema,
  referenceValue: parameterValueDtoSchema,
  justification: z.string(),
  createdByName: z.string(),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export type OverrideDto = z.infer<typeof overrideSchema>;

export const overrideListSchema = z.object({ items: z.array(overrideSchema), units: unitsSchema });

export const projectStandardsSchema = z.object({
  items: z.array(
    z.object({
      discipline: disciplineSchema,
      versions: z.array(
        z.object({ id: z.uuid(), code: z.string(), label: z.string(), title: z.string() }),
      ),
    }),
  ),
});
/** Remplace la sélection d'un métier (le métier est dans le chemin). */
export const setProjectStandardsBodySchema = z.object({
  standardVersionIds: z.array(z.uuid()).max(20),
});

/** Paramètre d'une version retenue par un projet, avec sa valeur effective et son origine. */
export const effectiveParameterSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: parameterValueDtoSchema,
  referenceValue: parameterValueDtoSchema,
  source: sourceDtoSchema,
  verification: z.enum(['VERIFIED', 'TO_VERIFY']),
  origin: z.enum(['STANDARD', 'ORGANIZATION', 'PROJECT']),
  justification: z.string().nullable(),
});
export type EffectiveParameterDto = z.infer<typeof effectiveParameterSchema>;

export const effectiveParameterListSchema = z.object({
  items: z.array(effectiveParameterSchema),
  units: unitsSchema,
});
