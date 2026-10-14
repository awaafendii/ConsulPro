-- CreateEnum
CREATE TYPE "BoqPresentation" AS ENUM ('DETAILED', 'AGGREGATED');

-- DropIndex
DROP INDEX "boq_items_boq_id_calculation_id_output_key_key";

-- AlterTable
ALTER TABLE "bills_of_quantities" ADD COLUMN     "presentation" "BoqPresentation" NOT NULL DEFAULT 'DETAILED';

-- AlterTable
ALTER TABLE "boq_items" ADD COLUMN     "group_designation" TEXT,
ADD COLUMN     "output_part" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "boq_items_boq_id_calculation_id_output_key_output_part_key" ON "boq_items"("boq_id", "calculation_id", "output_key", "output_part");


-- =============================================================================
-- Phase 6 (décision Q9) — écrit à la main, après le DDL généré par Prisma.
-- Une ligne calculée peut provenir d'une entrée de sortie ventilée (tubes par diamètre) ;
-- une ligne saisie n'a ni entrée ni groupe.
-- =============================================================================
ALTER TABLE "boq_items"
  ADD CONSTRAINT "boq_items_part_check" CHECK (
    (origin = 'MANUAL' AND output_part = '' AND group_designation IS NULL)
    OR (origin = 'CALCULATION'
        AND (output_part = '' OR output_part ~ '^[A-Z0-9][A-Z0-9_.-]{0,59}$')
        AND (group_designation IS NULL OR char_length(group_designation) BETWEEN 2 AND 300)
        AND ((output_part = '') = (group_designation IS NULL))));
