-- CreateEnum
CREATE TYPE "TakeoffNodeKind" AS ENUM ('LOT', 'LEVEL', 'ELEMENT');

-- CreateEnum
CREATE TYPE "BoqItemOrigin" AS ENUM ('CALCULATION', 'MANUAL');

-- CreateTable
CREATE TABLE "takeoff_nodes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "kind" "TakeoffNodeKind" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "takeoff_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takeoff_assignments" (
    "calculation_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "takeoff_assignments_pkey" PRIMARY KEY ("calculation_id")
);

-- CreateTable
CREATE TABLE "bills_of_quantities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "synced_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bills_of_quantities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boq_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "boq_id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "origin" "BoqItemOrigin" NOT NULL,
    "calculation_id" UUID,
    "output_key" TEXT,
    "source_revision_id" UUID,
    "work_key" TEXT,
    "designation" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "override_quantity" DECIMAL(18,4),
    "override_justification" TEXT,
    "unit_price" DECIMAL(18,4),
    "price_item_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_libraries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "valid_from" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_libraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "library_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "work_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "takeoff_nodes_id_project_id_key" ON "takeoff_nodes"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "takeoff_nodes_sibling_code_key" ON "takeoff_nodes"("project_id", "parent_id", "code") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "takeoff_assignments_node_id_idx" ON "takeoff_assignments"("node_id");

-- CreateIndex
CREATE INDEX "bills_of_quantities_project_id_idx" ON "bills_of_quantities"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "bills_of_quantities_id_project_id_key" ON "bills_of_quantities"("id", "project_id");

-- CreateIndex
CREATE INDEX "boq_items_boq_id_idx" ON "boq_items"("boq_id");

-- CreateIndex
CREATE INDEX "boq_items_node_id_idx" ON "boq_items"("node_id");

-- CreateIndex
CREATE UNIQUE INDEX "boq_items_boq_id_calculation_id_output_key_key" ON "boq_items"("boq_id", "calculation_id", "output_key");

-- CreateIndex
CREATE UNIQUE INDEX "price_libraries_organization_id_name_key" ON "price_libraries"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "price_libraries_id_organization_id_key" ON "price_libraries"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_items_library_id_code_key" ON "price_items"("library_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "price_items_library_id_work_key_key" ON "price_items"("library_id", "work_key");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_revisions_id_calculation_id_key" ON "calculation_revisions"("id", "calculation_id");

-- CreateIndex
CREATE UNIQUE INDEX "calculations_id_project_id_key" ON "calculations"("id", "project_id");

-- AddForeignKey
ALTER TABLE "takeoff_nodes" ADD CONSTRAINT "takeoff_nodes_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoff_nodes" ADD CONSTRAINT "takeoff_nodes_parent_id_project_id_fkey" FOREIGN KEY ("parent_id", "project_id") REFERENCES "takeoff_nodes"("id", "project_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoff_assignments" ADD CONSTRAINT "takeoff_assignments_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoff_assignments" ADD CONSTRAINT "takeoff_assignments_calculation_id_project_id_fkey" FOREIGN KEY ("calculation_id", "project_id") REFERENCES "calculations"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoff_assignments" ADD CONSTRAINT "takeoff_assignments_node_id_project_id_fkey" FOREIGN KEY ("node_id", "project_id") REFERENCES "takeoff_nodes"("id", "project_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeoff_assignments" ADD CONSTRAINT "takeoff_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_quantities" ADD CONSTRAINT "bills_of_quantities_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_quantities" ADD CONSTRAINT "bills_of_quantities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_boq_id_project_id_fkey" FOREIGN KEY ("boq_id", "project_id") REFERENCES "bills_of_quantities"("id", "project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_node_id_project_id_fkey" FOREIGN KEY ("node_id", "project_id") REFERENCES "takeoff_nodes"("id", "project_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_calculation_id_fkey" FOREIGN KEY ("calculation_id") REFERENCES "calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_source_revision_id_calculation_id_fkey" FOREIGN KEY ("source_revision_id", "calculation_id") REFERENCES "calculation_revisions"("id", "calculation_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boq_items" ADD CONSTRAINT "boq_items_price_item_id_fkey" FOREIGN KEY ("price_item_id") REFERENCES "price_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_libraries" ADD CONSTRAINT "price_libraries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_libraries" ADD CONSTRAINT "price_libraries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_items" ADD CONSTRAINT "price_items_library_id_organization_id_fkey" FOREIGN KEY ("library_id", "organization_id") REFERENCES "price_libraries"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================================================
-- Sécurité et cohérence (Phase 4) — écrit à la main, après le DDL généré par Prisma.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Contrôles de forme (mêmes règles que packages/domain/src/quantities).
-- -----------------------------------------------------------------------------
ALTER TABLE "takeoff_nodes"
  ADD CONSTRAINT "takeoff_nodes_code_check" CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$'),
  ADD CONSTRAINT "takeoff_nodes_title_check" CHECK (char_length(title) BETWEEN 2 AND 160),
  -- Un lot est à la racine ; un niveau ou un ouvrage a toujours un parent.
  ADD CONSTRAINT "takeoff_nodes_root_check" CHECK ((kind = 'LOT') = (parent_id IS NULL));

ALTER TABLE "bills_of_quantities"
  ADD CONSTRAINT "bills_of_quantities_title_check" CHECK (char_length(title) BETWEEN 2 AND 160),
  ADD CONSTRAINT "bills_of_quantities_currency_check" CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE "boq_items"
  ADD CONSTRAINT "boq_items_origin_check" CHECK (
    (origin = 'CALCULATION' AND calculation_id IS NOT NULL AND output_key IS NOT NULL
       AND source_revision_id IS NOT NULL)
    OR (origin = 'MANUAL' AND calculation_id IS NULL AND output_key IS NULL
       AND source_revision_id IS NULL AND override_quantity IS NULL)),
  -- Quantité retenue : toujours justifiée (principe P4).
  ADD CONSTRAINT "boq_items_override_check" CHECK (
    (override_quantity IS NULL AND override_justification IS NULL)
    OR (override_quantity IS NOT NULL AND override_justification IS NOT NULL
        AND char_length(trim(override_justification)) BETWEEN 3 AND 500)),
  ADD CONSTRAINT "boq_items_amounts_check" CHECK (
    quantity >= 0 AND (override_quantity IS NULL OR override_quantity >= 0)
    AND (unit_price IS NULL OR unit_price >= 0)),
  ADD CONSTRAINT "boq_items_designation_check" CHECK (char_length(designation) BETWEEN 2 AND 300),
  ADD CONSTRAINT "boq_items_unit_check" CHECK (unit IN ('m3', 'm2', 'm', 'kg', 't', 'L', 'u', 'ff', 'ens'));

ALTER TABLE "price_libraries"
  ADD CONSTRAINT "price_libraries_name_check" CHECK (char_length(name) BETWEEN 2 AND 120),
  ADD CONSTRAINT "price_libraries_currency_check" CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE "price_items"
  ADD CONSTRAINT "price_items_code_check" CHECK (char_length(code) BETWEEN 1 AND 40),
  ADD CONSTRAINT "price_items_designation_check" CHECK (char_length(designation) BETWEEN 2 AND 300),
  ADD CONSTRAINT "price_items_unit_check" CHECK (unit IN ('m3', 'm2', 'm', 'kg', 't', 'L', 'u', 'ff', 'ens')),
  ADD CONSTRAINT "price_items_price_check" CHECK (price >= 0);

-- -----------------------------------------------------------------------------
-- RLS : avant-métré et quantitatifs suivent l'accès au projet ; les bibliothèques de prix
-- appartiennent à l'organisation courante.
-- -----------------------------------------------------------------------------
ALTER TABLE "takeoff_nodes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY takeoff_nodes_access ON "takeoff_nodes" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "takeoff_assignments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY takeoff_assignments_access ON "takeoff_assignments" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id)
              AND assigned_by_id = app_current_user());

ALTER TABLE "bills_of_quantities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY bills_of_quantities_access ON "bills_of_quantities" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "boq_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY boq_items_access ON "boq_items" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "price_libraries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_libraries_access ON "price_libraries" FOR ALL
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

ALTER TABLE "price_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_items_access ON "price_items" FOR ALL
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

-- -----------------------------------------------------------------------------
-- Cohérence de l'avant-métré : imbrication lot → niveau → ouvrage ; un nœud ne change ni
-- de nature ni de parent (on le recrée).
-- -----------------------------------------------------------------------------
CREATE FUNCTION guard_takeoff_node() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent_kind "TakeoffNodeKind";
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.kind, NEW.parent_id, NEW.project_id, NEW.organization_id)
       IS DISTINCT FROM (OLD.kind, OLD.parent_id, OLD.project_id, OLD.organization_id) THEN
    RAISE EXCEPTION 'Un nœud d''avant-métré ne change ni de nature ni de parent'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    SELECT kind INTO v_parent_kind FROM takeoff_nodes WHERE id = NEW.parent_id;
    IF NOT ((v_parent_kind = 'LOT' AND NEW.kind IN ('LEVEL', 'ELEMENT'))
            OR (v_parent_kind = 'LEVEL' AND NEW.kind = 'ELEMENT')) THEN
      RAISE EXCEPTION 'Imbrication invalide dans l''avant-métré' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER takeoff_nodes_guard BEFORE INSERT OR UPDATE ON "takeoff_nodes"
  FOR EACH ROW EXECUTE FUNCTION guard_takeoff_node();

-- Ligne de quantitatif : son calcul appartient au projet, son article de prix à l'organisation
-- (les clés étrangères ne voient pas la RLS : contrôle explicite).
CREATE FUNCTION guard_boq_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.calculation_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM calculations
        WHERE id = NEW.calculation_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'Calcul étranger au projet' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.price_item_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM price_items
        WHERE id = NEW.price_item_id AND organization_id = NEW.organization_id) THEN
    RAISE EXCEPTION 'Article de prix étranger à l''organisation' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER boq_items_guard BEFORE INSERT OR UPDATE ON "boq_items"
  FOR EACH ROW EXECUTE FUNCTION guard_boq_item();

-- -----------------------------------------------------------------------------
-- Projet archivé : avant-métré et quantitatifs en lecture seule.
-- -----------------------------------------------------------------------------
CREATE TRIGGER takeoff_nodes_not_archived BEFORE INSERT OR UPDATE OR DELETE ON "takeoff_nodes"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER takeoff_assignments_not_archived BEFORE INSERT OR UPDATE OR DELETE ON "takeoff_assignments"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER bills_of_quantities_not_archived BEFORE INSERT OR UPDATE OR DELETE ON "bills_of_quantities"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER boq_items_not_archived BEFORE INSERT OR UPDATE OR DELETE ON "boq_items"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
