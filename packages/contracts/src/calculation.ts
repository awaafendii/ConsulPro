import { z } from 'zod';

/*
 * Vue d'un résultat de calcul, telle que l'API la renvoie à l'interface
 * (docs/architecture/10-moteur-de-calcul.md §5). Elle est construite côté serveur
 * à partir du `CalculationResult` du moteur et des métadonnées de présentation
 * (libellés, précisions) : l'interface n'exécute aucune formule (principe P5).
 */

export const resultStatusSchema = z.enum([
  'OK',
  'OK_WITH_WARNINGS',
  'NON_COMPLIANT',
  'INVALID',
  'ERROR',
]);
export type ResultStatusDto = z.infer<typeof resultStatusSchema>;

const scalar = z.union([z.number(), z.string(), z.boolean(), z.null()]);

export const calculationViewSchema = z.object({
  engine: z.object({
    id: z.string(),
    version: z.string(),
    title: z.string(),
    /** Faux tant que les cas de référence du moteur ne sont pas contre-vérifiés. */
    verified: z.boolean().optional(),
  }),
  status: resultStatusSchema,
  /** Aperçu calculé dans le navigateur, sans valeur officielle (non enregistré). */
  preview: z.boolean(),
  standards: z.array(z.object({ code: z.string(), version: z.string() })),
  /** Symbole d'unité → affichage (ex. `mm2` → `mm²`). */
  units: z.record(z.string(), z.string()),
  inputs: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: scalar,
      unit: z.string().optional(),
      /** Valeur appliquée par défaut (une hypothèse correspondante existe). */
      defaulted: z.boolean(),
    }),
  ),
  hypotheses: z.array(
    z.object({ code: z.string(), text: z.string(), origin: z.enum(['ENGINE', 'DEFAULT_VALUE']) }),
  ),
  parameters: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      kind: z.enum(['SCALAR', 'ENUM', 'TABLE']),
      /** Nombre (SCALAR), valeur (ENUM) ou description de la table (TABLE). */
      value: z.union([z.number(), z.string()]),
      unit: z.string().optional(),
      source: z.object({
        document: z.string(),
        clause: z.string().optional(),
        table: z.string().optional(),
        note: z.string().optional(),
      }),
      verification: z.enum(['VERIFIED', 'TO_VERIFY']),
      used: z.boolean(),
      override: z
        .object({
          referenceValue: z.union([z.number(), z.string()]),
          justification: z.string(),
          scope: z.enum(['ORGANIZATION', 'PROJECT']),
        })
        .optional(),
    }),
  ),
  outputs: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      value: z.number(),
      unit: z.string().optional(),
      /** Nombre de décimales affichées (aucun arrondi n'est fait sur la valeur stockée). */
      precision: z.number().int().min(0).max(12),
    }),
  ),
  checks: z.array(
    z.object({
      rule: z.string(),
      label: z.string(),
      status: z.enum(['PASS', 'FAIL', 'NOT_APPLICABLE']),
      severity: z.enum(['BLOCKING', 'WARNING', 'INFO']),
      measured: z.number().optional(),
      limit: z.number().optional(),
      comparison: z.enum(['<=', '<', '>=', '>']).optional(),
      unit: z.string().optional(),
      clause: z.string().optional(),
    }),
  ),
  warnings: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(['INFO', 'WARNING']),
      text: z.string(),
      origin: z.enum(['ENGINE', 'PARAMETER_TO_VERIFY', 'PARAMETER_OVERRIDDEN']),
    }),
  ),
  trace: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      formula: z.string().optional(),
      substitutions: z
        .array(
          z.object({
            symbol: z.string(),
            value: z.union([z.number(), z.string()]),
            unit: z.string().optional(),
          }),
        )
        .optional(),
      value: z.union([z.number(), z.string()]).optional(),
      unit: z.string().optional(),
      source: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  errors: z.array(z.object({ path: z.string(), code: z.string(), message: z.string() })),
  failure: z.object({ code: z.string(), message: z.string() }).nullable(),
});

export type CalculationView = z.infer<typeof calculationViewSchema>;
