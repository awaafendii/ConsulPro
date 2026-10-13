-- CreateTable
CREATE TABLE "calculation_dataset_links" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "input" TEXT NOT NULL,
    "dataset_id" UUID NOT NULL,
    "dataset_revision_id" UUID NOT NULL,

    CONSTRAINT "calculation_dataset_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calculation_dataset_links_dataset_id_idx" ON "calculation_dataset_links"("dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_dataset_links_revision_id_input_key" ON "calculation_dataset_links"("revision_id", "input");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_revisions_id_dataset_id_key" ON "dataset_revisions"("id", "dataset_id");

-- AddForeignKey
ALTER TABLE "calculation_dataset_links" ADD CONSTRAINT "calculation_dataset_links_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_dataset_links" ADD CONSTRAINT "calculation_dataset_links_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "calculation_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_dataset_links" ADD CONSTRAINT "calculation_dataset_links_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_dataset_links" ADD CONSTRAINT "calculation_dataset_links_dataset_revision_id_dataset_id_fkey" FOREIGN KEY ("dataset_revision_id", "dataset_id") REFERENCES "dataset_revisions"("id", "dataset_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================================================
-- Sécurité (Phase 5) — écrit à la main, après le DDL généré par Prisma.
-- Un lien calcul → jeu de données est une trace : insertion seule, jamais modifiée.
-- =============================================================================
REVOKE UPDATE, DELETE ON "calculation_dataset_links" FROM consulpro_app;
CREATE TRIGGER calculation_dataset_links_immutable BEFORE UPDATE ON "calculation_dataset_links"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

ALTER TABLE "calculation_dataset_links" ENABLE ROW LEVEL SECURITY;
CREATE POLICY calculation_dataset_links_read ON "calculation_dataset_links" FOR SELECT
  USING (organization_id = app_current_org() AND app_can_access_project(project_id));
CREATE POLICY calculation_dataset_links_insert ON "calculation_dataset_links" FOR INSERT
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

-- La révision de calcul et le jeu de données appartiennent au projet du lien.
CREATE FUNCTION guard_calculation_dataset_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM calculation_revisions
                  WHERE id = NEW.revision_id AND project_id = NEW.project_id)
     OR NOT EXISTS (SELECT 1 FROM datasets
                     WHERE id = NEW.dataset_id AND project_id = NEW.project_id) THEN
    RAISE EXCEPTION 'Lien étranger au projet' USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER calculation_dataset_links_guard BEFORE INSERT ON "calculation_dataset_links"
  FOR EACH ROW EXECUTE FUNCTION guard_calculation_dataset_link();

CREATE TRIGGER calculation_dataset_links_not_archived BEFORE INSERT ON "calculation_dataset_links"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
