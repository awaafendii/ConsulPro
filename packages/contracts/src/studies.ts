import { z } from 'zod';

import { calculationViewSchema, resultStatusSchema } from './calculation';
import { disciplineSchema } from './projects';

/* Études, calculs, révisions et contrôle (Phase 3). */

export const workflowStatusSchema = z.enum(['COMPUTED', 'VALIDATED', 'VERIFIED', 'REJECTED']);
export type WorkflowStatusDto = z.infer<typeof workflowStatusSchema>;

const title = z.string().trim().min(2).max(160);

export const studyBodySchema = z.object({
  discipline: disciplineSchema,
  title,
  description: z.string().trim().max(2000).optional(),
});
export const updateStudyBodySchema = studyBodySchema.omit({ discipline: true });

export const studySchema = z.object({
  id: z.uuid(),
  discipline: disciplineSchema,
  title: z.string(),
  description: z.string().nullable(),
  calculationCount: z.number().int().nonnegative(),
  createdByName: z.string(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type StudyDto = z.infer<typeof studySchema>;
export const studyListSchema = z.object({ items: z.array(studySchema) });

const unitOptionSchema = z.object({ symbol: z.string(), display: z.string() });

/** Champ d'une ligne de liste (ouverture, barre…). */
export const listFieldSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('quantity'),
    key: z.string(),
    label: z.string(),
    unitKind: z.string(),
    units: z.array(unitOptionSchema),
  }),
  z.object({ kind: z.literal('integer'), key: z.string(), label: z.string(), min: z.number() }),
]);
export type ListFieldDto = z.infer<typeof listFieldSchema>;

/** Moteur proposé pour un métier, avec de quoi construire le formulaire de saisie. */
export const engineSchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
  discipline: disciplineSchema,
  description: z.string(),
  inputs: z.array(
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('quantity'),
        key: z.string(),
        label: z.string(),
        unitKind: z.string(),
        units: z.array(unitOptionSchema),
        optional: z.boolean(),
        help: z.string().optional(),
      }),
      z.object({
        kind: z.literal('integer'),
        key: z.string(),
        label: z.string(),
        min: z.number(),
        optional: z.boolean(),
        help: z.string().optional(),
      }),
      z.object({
        kind: z.literal('list'),
        key: z.string(),
        label: z.string(),
        fields: z.array(listFieldSchema),
        maxItems: z.number().int(),
        optional: z.boolean(),
        help: z.string().optional(),
      }),
      z.object({
        kind: z.literal('enum'),
        key: z.string(),
        label: z.string(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
        optional: z.boolean(),
        help: z.string().optional(),
      }),
    ]),
  ),
  outputs: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      unit: z.string(),
      unitKind: z.string(),
      precision: z.number().int(),
      family: z.string().optional(),
    }),
  ),
  /** Cas de référence contre-vérifiés par un ingénieur du métier / total. */
  referenceCases: z.object({ total: z.number().int(), checked: z.number().int() }),
  parameters: z.array(z.object({ key: z.string(), description: z.string() })),
  hypotheses: z.array(z.object({ code: z.string(), text: z.string() })),
});
export type EngineDto = z.infer<typeof engineSchema>;
export const engineListSchema = z.object({ items: z.array(engineSchema) });

export const revisionSummarySchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  resultStatus: resultStatusSchema,
  workflowStatus: workflowStatusSchema,
  authorName: z.string(),
  createdAt: z.iso.datetime(),
});
export type RevisionSummaryDto = z.infer<typeof revisionSummarySchema>;

export const calculationSchema = z.object({
  id: z.uuid(),
  studyId: z.uuid(),
  title: z.string(),
  engineId: z.string(),
  engineTitle: z.string(),
  /** Moteur indisponible sur ce serveur (ex. moteur de démonstration désactivé). */
  engineAvailable: z.boolean(),
  current: revisionSummarySchema.nullable(),
  /** Une révision dont ce calcul reprend un résultat a été remplacée. */
  obsolete: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type CalculationDto = z.infer<typeof calculationSchema>;
export const calculationListSchema = z.object({ items: z.array(calculationSchema) });

export const calculationBodySchema = z.object({ title, engineId: z.string().min(1).max(80) });

/** Valeur d'entrée : grandeur, option, ou reprise de la sortie d'un autre calcul du projet. */
const quantityValue = z.object({ value: z.number(), unit: z.string().min(1).max(20) });

export const inputValueSchema = z.union([
  quantityValue,
  z.string().max(200),
  z.number(),
  z.object({ fromCalculation: z.uuid(), output: z.string().min(1).max(80) }),
  z.array(z.record(z.string().max(80), z.union([quantityValue, z.number()]))).max(200),
]);
export type InputValueDto = z.infer<typeof inputValueSchema>;

export const runBodySchema = z.object({
  inputs: z.record(z.string().max(80), inputValueSchema),
});

export const reviewSchema = z.object({
  id: z.uuid(),
  type: z.enum(['VALIDATION', 'VERIFICATION']),
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().nullable(),
  reviewerName: z.string(),
  createdAt: z.iso.datetime(),
});

export const dependencySchema = z.object({
  sourceCalculationId: z.uuid(),
  sourceCalculationTitle: z.string(),
  sourceRevisionNumber: z.number().int(),
  output: z.string(),
  input: z.string(),
  obsolete: z.boolean(),
});

export const revisionSchema = revisionSummarySchema.extend({
  calculationId: z.uuid(),
  isCurrent: z.boolean(),
  parameterSnapshotHash: z.string(),
  /** Saisie d'origine (reprise pour une nouvelle révision). */
  rawInputs: z.record(z.string(), z.unknown()),
  view: calculationViewSchema,
  reviews: z.array(reviewSchema),
  dependencies: z.array(dependencySchema),
  /** Actions possibles pour l'utilisateur courant (le serveur revérifie). */
  can: z.object({ validate: z.boolean(), verify: z.boolean() }),
});
export type RevisionDto = z.infer<typeof revisionSchema>;
export const revisionListSchema = z.object({ items: z.array(revisionSummarySchema) });

export const validateBodySchema = z.object({ comment: z.string().trim().max(2000).optional() });
export const verifyBodySchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().max(2000).optional(),
});

export const comparisonSchema = z.object({
  before: revisionSummarySchema,
  after: revisionSummarySchema,
  differences: z.array(
    z.object({
      section: z.enum(['status', 'inputs', 'parameters', 'outputs', 'checks']),
      path: z.string(),
      before: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      after: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    }),
  ),
});
export type ComparisonDto = z.infer<typeof comparisonSchema>;

/** Sorties réutilisables des autres calculs du projet (liaison d'entrées). */
export const linkableOutputsSchema = z.object({
  items: z.array(
    z.object({
      calculationId: z.uuid(),
      calculationTitle: z.string(),
      revisionNumber: z.number().int(),
      output: z.string(),
      label: z.string(),
      value: z.number(),
      unit: z.string(),
      unitKind: z.string(),
    }),
  ),
});
