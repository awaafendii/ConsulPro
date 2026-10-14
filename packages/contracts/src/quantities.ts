import { z } from 'zod';

import { resultStatusSchema } from './calculation';

/*
 * Avant-métré, quantitatifs et bibliothèques de prix (Phase 4). Quantités, prix et montants
 * circulent en chaînes décimales exactes (« 1250.5 ») : jamais de flottant pour l'argent.
 * Les listes fermées doivent rester identiques à celles du domaine (vérifié par test).
 */

export const takeoffNodeKindSchema = z.enum(['LOT', 'LEVEL', 'ELEMENT']);
export type TakeoffNodeKindDto = z.infer<typeof takeoffNodeKindSchema>;

export const boqUnitSchema = z.enum(['m3', 'm2', 'm', 'kg', 't', 'L', 'u', 'ff', 'ens']);
export type BoqUnitDto = z.infer<typeof boqUnitSchema>;

export const currencySchema = z.enum(['XOF', 'XAF', 'GNF', 'CDF', 'MAD', 'EUR', 'USD']);
export type CurrencyDto = z.infer<typeof currencySchema>;

const workflowStatusSchema = z.enum(['COMPUTED', 'VALIDATED', 'VERIFIED', 'REJECTED']);

/** Décimale positive saisie : 14 chiffres et 4 décimales au plus, point décimal. */
export const decimalTextSchema = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,4})?$/, 'Nombre positif, 4 décimales au plus (ex. 1250.5).');

const title = z.string().trim().min(2).max(160);

// --- Avant-métré ----------------------------------------------------------------------------

export const takeoffNodeBodySchema = z.object({
  parentId: z.uuid().nullable(),
  kind: takeoffNodeKindSchema,
  code: z.string().trim().min(1).max(20),
  title,
});

export const updateTakeoffNodeBodySchema = z
  .object({ code: z.string().trim().min(1).max(20).optional(), title: title.optional() })
  .refine((b) => b.code !== undefined || b.title !== undefined, {
    message: 'Indiquez au moins un champ à modifier.',
  });

export const takeoffAssignmentBodySchema = z.object({ nodeId: z.uuid().nullable() });

export const takeoffNodeSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  kind: takeoffNodeKindSchema,
  code: z.string(),
  title: z.string(),
  depth: z.number().int().nonnegative(),
  version: z.number().int().positive(),
});
export type TakeoffNodeDto = z.infer<typeof takeoffNodeSchema>;

export const takeoffCalculationSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  engineId: z.string(),
  studyId: z.uuid(),
  studyTitle: z.string(),
  nodeId: z.uuid().nullable(),
  current: z
    .object({
      number: z.number().int().positive(),
      resultStatus: resultStatusSchema,
      workflowStatus: workflowStatusSchema,
      createdAt: z.iso.datetime(),
    })
    .nullable(),
  obsolete: z.boolean(),
});
export type TakeoffCalculationDto = z.infer<typeof takeoffCalculationSchema>;

export const takeoffSchema = z.object({
  nodes: z.array(takeoffNodeSchema),
  calculations: z.array(takeoffCalculationSchema),
});
export type TakeoffDto = z.infer<typeof takeoffSchema>;

// --- Quantitatifs ---------------------------------------------------------------------------

export const subtotalSchema = z.object({
  /** Somme des montants des lignes chiffrées (chaîne décimale exacte). */
  amount: z.string(),
  lines: z.number().int().nonnegative(),
  unpriced: z.number().int().nonnegative(),
});
export type SubtotalDto = z.infer<typeof subtotalSchema>;

export const boqBodySchema = z.object({ title, currency: currencySchema.optional() });

/** Présentation du DQE (décision Q9) : entrées ventilées détaillées ou agrégées par groupe. */
export const boqPresentationSchema = z.enum(['DETAILED', 'AGGREGATED']);
export type BoqPresentationDto = z.infer<typeof boqPresentationSchema>;

export const updateBoqBodySchema = z
  .object({
    title: title.optional(),
    currency: currencySchema.optional(),
    presentation: boqPresentationSchema.optional(),
  })
  .refine(
    (b) => b.title !== undefined || b.currency !== undefined || b.presentation !== undefined,
    { message: 'Indiquez au moins un champ à modifier.' },
  );

export const boqSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  currency: currencySchema,
  presentation: boqPresentationSchema,
  version: z.number().int().positive(),
  createdByName: z.string(),
  syncedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  total: subtotalSchema,
  /** Écart avec l'avant-métré et les révisions courantes. */
  pending: z.object({
    add: z.number().int().nonnegative(),
    update: z.number().int().nonnegative(),
    remove: z.number().int().nonnegative(),
  }),
});
export type BoqSummaryDto = z.infer<typeof boqSummarySchema>;
export const boqListSchema = z.object({ items: z.array(boqSummarySchema) });

export const boqItemSchema = z.object({
  id: z.uuid(),
  nodeId: z.uuid(),
  origin: z.enum(['CALCULATION', 'MANUAL']),
  calculationId: z.uuid().nullable(),
  outputKey: z.string().nullable(),
  /** Entrée d'une sortie ventilée (ex. un diamètre de tube) ; vide sinon. */
  outputPart: z.string(),
  groupDesignation: z.string().nullable(),
  sourceRevisionId: z.uuid().nullable(),
  workKey: z.string().nullable(),
  designation: z.string(),
  unit: boqUnitSchema,
  quantity: z.string(),
  overrideQuantity: z.string().nullable(),
  overrideJustification: z.string().nullable(),
  /** Quantité retenue (justifiée si elle diffère de la quantité calculée). */
  effectiveQuantity: z.string(),
  unitPrice: z.string().nullable(),
  priceItemId: z.uuid().nullable(),
  amount: z.string().nullable(),
  version: z.number().int().positive(),
  source: z
    .object({
      calculationTitle: z.string(),
      revisionNumber: z.number().int().positive(),
      resultStatus: resultStatusSchema,
      workflowStatus: workflowStatusSchema,
      superseded: z.boolean(),
      engineVerified: z.boolean(),
    })
    .nullable(),
});
export type BoqItemDto = z.infer<typeof boqItemSchema>;

export const boqNodeSchema = takeoffNodeSchema.extend({ subtotal: subtotalSchema });
export type BoqNodeDto = z.infer<typeof boqNodeSchema>;

/** Regroupement des entrées ventilées d'un même groupe (présentation agrégée). */
export const boqGroupSchema = z.object({
  key: z.string(),
  nodeId: z.uuid(),
  designation: z.string(),
  unit: boqUnitSchema,
  quantity: z.string(),
  amount: z.string().nullable(),
  lines: z.number().int().positive(),
  unpriced: z.number().int().nonnegative(),
  itemIds: z.array(z.uuid()).min(1),
});
export type BoqGroupDto = z.infer<typeof boqGroupSchema>;

export const boqSchema = boqSummarySchema.extend({
  nodes: z.array(boqNodeSchema),
  items: z.array(boqItemSchema),
  groups: z.array(boqGroupSchema),
});
export type BoqDto = z.infer<typeof boqSchema>;

export const boqSyncResultSchema = z.object({
  boq: boqSchema,
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
});
export type BoqSyncResultDto = z.infer<typeof boqSyncResultSchema>;

export const boqItemBodySchema = z.object({
  nodeId: z.uuid(),
  designation: z.string().trim().min(2).max(300),
  unit: boqUnitSchema,
  quantity: decimalTextSchema,
  unitPrice: decimalTextSchema.nullable().optional(),
});

export const updateBoqItemBodySchema = z
  .object({
    designation: z.string().trim().min(2).max(300).optional(),
    unit: boqUnitSchema.optional(),
    quantity: decimalTextSchema.optional(),
    unitPrice: decimalTextSchema.nullable().optional(),
    override: z
      .object({ quantity: decimalTextSchema, justification: z.string().trim().min(3).max(500) })
      .nullable()
      .optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Indiquez au moins un champ à modifier.',
  });

export const applyPricesBodySchema = z.object({
  libraryId: z.uuid(),
  overwrite: z.boolean().default(false),
});

export const applyPricesResultSchema = z.object({
  boq: boqSchema,
  applied: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  kept: z.number().int().nonnegative(),
});
export type ApplyPricesResultDto = z.infer<typeof applyPricesResultSchema>;

export const materialRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string(),
  unitDisplay: z.string(),
  precision: z.number().int(),
  additive: z.boolean(),
  /** Quantité physique (double précision), à arrondir seulement à l'affichage. */
  total: z.number(),
  contributions: z.array(
    z.object({
      calculationId: z.uuid(),
      calculationTitle: z.string(),
      revisionId: z.uuid(),
      value: z.number(),
    }),
  ),
});
export type MaterialRowDto = z.infer<typeof materialRowSchema>;
export const materialListSchema = z.object({ items: z.array(materialRowSchema) });

// --- Bibliothèques de prix ------------------------------------------------------------------

const libraryName = z.string().trim().min(2).max(120);

export const priceLibraryBodySchema = z.object({
  name: libraryName,
  currency: currencySchema,
  validFrom: z.iso.date().nullable().optional(),
});

export const updatePriceLibraryBodySchema = z
  .object({
    name: libraryName.optional(),
    currency: currencySchema.optional(),
    validFrom: z.iso.date().nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Indiquez au moins un champ à modifier.',
  });

export const priceLibrarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  currency: currencySchema,
  validFrom: z.iso.date().nullable(),
  itemCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export type PriceLibraryDto = z.infer<typeof priceLibrarySchema>;
export const priceLibraryListSchema = z.object({ items: z.array(priceLibrarySchema) });

export const priceItemBodySchema = z.object({
  code: z.string().trim().min(1).max(40),
  designation: z.string().trim().min(2).max(300),
  unit: boqUnitSchema,
  price: decimalTextSchema,
  workKey: z.string().max(120).nullable().optional(),
});

export const updatePriceItemBodySchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    designation: z.string().trim().min(2).max(300).optional(),
    unit: boqUnitSchema.optional(),
    price: decimalTextSchema.optional(),
    workKey: z.string().max(120).nullable().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Indiquez au moins un champ à modifier.',
  });

export const priceItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  designation: z.string(),
  unit: boqUnitSchema,
  price: z.string(),
  workKey: z.string().nullable(),
  version: z.number().int().positive(),
});
export type PriceItemDto = z.infer<typeof priceItemSchema>;

/** Ouvrage chiffrable (sortie d'un moteur qui alimente le DQE). */
export const workItemSchema = z.object({
  workKey: z.string(),
  engineId: z.string(),
  engineTitle: z.string(),
  outputLabel: z.string(),
  unit: boqUnitSchema,
});
export type WorkItemDto = z.infer<typeof workItemSchema>;

export const priceLibraryDetailSchema = priceLibrarySchema.extend({
  items: z.array(priceItemSchema),
  works: z.array(workItemSchema),
});
export type PriceLibraryDetailDto = z.infer<typeof priceLibraryDetailSchema>;

// --- Tableau de bord BTP --------------------------------------------------------------------

export const btpDashboardSchema = z.object({
  projects: z.array(
    z.object({
      project: z.object({ id: z.uuid(), code: z.string(), name: z.string() }),
      calculations: z.object({
        total: z.number().int(),
        assigned: z.number().int(),
        notComputed: z.number().int(),
        computed: z.number().int(),
        validated: z.number().int(),
        verified: z.number().int(),
        rejected: z.number().int(),
        withWarnings: z.number().int(),
        nonCompliant: z.number().int(),
        withoutResult: z.number().int(),
        obsolete: z.number().int(),
      }),
      takeoff: z.object({ lots: z.number().int(), nodes: z.number().int() }),
      boqs: z.array(
        z.object({
          id: z.uuid(),
          title: z.string(),
          currency: currencySchema,
          total: subtotalSchema,
          lots: z.array(
            z.object({
              id: z.uuid(),
              code: z.string(),
              title: z.string(),
              subtotal: subtotalSchema,
            }),
          ),
          outdated: z.boolean(),
        }),
      ),
    }),
  ),
  truncated: z.boolean(),
  engines: z.object({
    total: z.number().int(),
    verified: z.number().int(),
    cases: z.number().int(),
    checkedCases: z.number().int(),
  }),
});
export type BtpDashboardDto = z.infer<typeof btpDashboardSchema>;
