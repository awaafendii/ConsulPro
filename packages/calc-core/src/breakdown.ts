import { z } from 'zod';

/*
 * Sortie ventilée (décision Q9) : une sortie de moteur peut se décomposer en entrées, par
 * exemple le linéaire de tubes par matériau et diamètre. Chaque entrée devient une ligne de
 * quantitatif ; `group` permet une présentation agrégée (par matériau).
 */

const code = z.string().regex(/^[A-Z0-9][A-Z0-9_.-]{0,59}$/);

export const breakdownEntrySchema = z
  .object({
    /** Identifiant stable de l'entrée (ex. `PVC_PN16-32`), partie de la clé d'ouvrage. */
    key: code,
    label: z.string().min(1).max(160),
    group: code,
    groupLabel: z.string().min(1).max(160),
    value: z.number().nonnegative(),
  })
  .strict();

export type BreakdownEntry = z.infer<typeof breakdownEntrySchema>;

export const breakdownSchema = z
  .array(breakdownEntrySchema)
  .max(500)
  .refine((entries) => new Set(entries.map((e) => e.key)).size === entries.length, {
    message: 'Entrées de ventilation en double.',
  });

export const isBreakdown = (value: unknown): value is BreakdownEntry[] =>
  breakdownSchema.safeParse(value).success;
