import {
  isUnitSymbol,
  validateTable,
  type TableValue,
  type UnitSymbol,
} from '@consulpro/calc-core';
import { z } from 'zod';

/*
 * Format d'un référentiel versionné (docs/architecture/11-referentiels.md).
 * Les fichiers de `seeds/` sont validés avec ce schéma avant tout chargement :
 * pas de paramètre sans source (principe P10), pas d'unité inconnue, tables cohérentes.
 */

const unit = z.string().refine((symbol): symbol is UnitSymbol => isUnitSymbol(symbol), {
  message: 'Unité inconnue du registre de calc-core',
});

export const sourceSchema = z.object({
  document: z.string().trim().min(1, 'Source documentaire obligatoire (principe P10)'),
  clause: z.string().optional(),
  table: z.string().optional(),
  note: z.string().optional(),
});

const numericAxis = z.object({
  name: z.string().min(1),
  kind: z.literal('NUMERIC'),
  unit,
  values: z.array(z.number()).min(1),
  lookup: z.enum(['EXACT', 'NEXT_UPPER', 'NEXT_LOWER', 'LINEAR']),
});
const categoryAxis = z.object({
  name: z.string().min(1),
  kind: z.literal('CATEGORY'),
  values: z.array(z.string()).min(1),
});

export const tableSchema = z
  .object({
    axes: z.array(z.union([numericAxis, categoryAxis])).min(1),
    unit,
    cells: z.array(z.number().nullable()),
  })
  .superRefine((table, ctx) => {
    const checked = validateTable(table);
    if (!checked.ok) ctx.addIssue({ code: 'custom', message: checked.error.message });
  }) as z.ZodType<TableValue>;

export const parameterValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('SCALAR'), value: z.number(), unit }),
  z
    .object({ kind: z.literal('ENUM'), value: z.string(), allowed: z.array(z.string()).min(1) })
    .refine((v) => v.allowed.includes(v.value), { message: 'Valeur hors des valeurs admises' }),
  z.object({ kind: z.literal('TABLE'), table: tableSchema }),
]);

export const parameterKeySchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    'Clé : minuscules, chiffres, points, tirets et soulignés',
  );

export const parameterDefinitionSchema = z.intersection(
  parameterValueSchema,
  z.object({
    key: parameterKeySchema,
    label: z.string().trim().min(1),
    source: sourceSchema,
    verification: z.enum(['VERIFIED', 'TO_VERIFY']),
  }),
);

export const ruleDefinitionSchema = z.object({
  code: parameterKeySchema,
  description: z.string().trim().min(1),
  severity: z.enum(['BLOCKING', 'WARNING', 'INFO']),
  clause: z.string().optional(),
  parameterKeys: z.array(parameterKeySchema),
  implementation: z.string().min(1),
});

export const disciplineSchema = z.enum(['BTP', 'ELEC', 'PLUMBING', 'TOPO']);

export const standardFileSchema = z
  .object({
    standard: z.object({
      code: z.string().regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'Code en majuscules (ex. NFC15-100)'),
      title: z.string().trim().min(1),
      publisher: z.string().optional(),
      discipline: disciplineSchema.nullable(),
      nature: z.enum(['NORM', 'GUIDE', 'PRACTICE', 'CUSTOM']),
    }),
    version: z.object({ label: z.string().trim().min(1), sourceNotes: z.string().optional() }),
    parameters: z.array(parameterDefinitionSchema),
    rules: z.array(ruleDefinitionSchema),
  })
  .superRefine((file, ctx) => {
    const keys = file.parameters.map((p) => p.key);
    const duplicate = keys.find((k, i) => keys.indexOf(k) !== i);
    if (duplicate)
      ctx.addIssue({
        code: 'custom',
        path: ['parameters'],
        message: `Paramètre en double : ${duplicate}`,
      });
    const codes = file.rules.map((r) => r.code);
    const duplicateRule = codes.find((c, i) => codes.indexOf(c) !== i);
    if (duplicateRule)
      ctx.addIssue({
        code: 'custom',
        path: ['rules'],
        message: `Règle en double : ${duplicateRule}`,
      });
    for (const rule of file.rules) {
      for (const key of rule.parameterKeys) {
        if (!keys.includes(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['rules'],
            message: `Règle ${rule.code} : paramètre inconnu ${key}`,
          });
        }
      }
    }
  });

export type StandardFile = z.infer<typeof standardFileSchema>;
export type ParameterDefinition = z.infer<typeof parameterDefinitionSchema>;
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;
export type ParameterValueDefinition = z.infer<typeof parameterValueSchema>;
