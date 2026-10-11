-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('OK', 'OK_WITH_WARNINGS', 'NON_COMPLIANT', 'INVALID', 'ERROR');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('COMPUTED', 'VALIDATED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('VALIDATION', 'VERIFICATION');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "studies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "study_id" UUID NOT NULL,
    "engine_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "current_revision_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "calculation_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "engine_id" TEXT NOT NULL,
    "engine_version" TEXT NOT NULL,
    "standards" JSONB NOT NULL,
    "parameter_snapshot" JSONB NOT NULL,
    "parameter_snapshot_hash" TEXT NOT NULL,
    "raw_inputs" JSONB NOT NULL,
    "inputs" JSONB,
    "outputs" JSONB,
    "checks" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "hypotheses" JSONB NOT NULL,
    "trace" JSONB NOT NULL,
    "errors" JSONB NOT NULL,
    "failure" JSONB,
    "presentation" JSONB NOT NULL,
    "result_status" "ResultStatus" NOT NULL,
    "workflow_status" "WorkflowStatus" NOT NULL DEFAULT 'COMPUTED',
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "type" "ReviewType" NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "comment" TEXT,
    "reviewer_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculation_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calculation_dependencies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "input" TEXT NOT NULL,
    "source_calculation_id" UUID NOT NULL,
    "source_revision_id" UUID NOT NULL,
    "output" TEXT NOT NULL,

    CONSTRAINT "calculation_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datasets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "title" TEXT NOT NULL,
    "current_revision_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dataset_revisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "dataset_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "row_count" INTEGER NOT NULL,
    "note" TEXT,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dataset_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failed_verification_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),

    CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "studies_project_id_idx" ON "studies"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "calculations_current_revision_id_key" ON "calculations"("current_revision_id");

-- CreateIndex
CREATE INDEX "calculations_study_id_idx" ON "calculations"("study_id");

-- CreateIndex
CREATE INDEX "calculations_project_id_idx" ON "calculations"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_revisions_calculation_id_number_key" ON "calculation_revisions"("calculation_id", "number");

-- CreateIndex
CREATE INDEX "calculation_reviews_revision_id_idx" ON "calculation_reviews"("revision_id");

-- CreateIndex
CREATE INDEX "calculation_dependencies_source_calculation_id_idx" ON "calculation_dependencies"("source_calculation_id");

-- CreateIndex
CREATE UNIQUE INDEX "calculation_dependencies_revision_id_input_key" ON "calculation_dependencies"("revision_id", "input");

-- CreateIndex
CREATE UNIQUE INDEX "datasets_current_revision_id_key" ON "datasets"("current_revision_id");

-- CreateIndex
CREATE INDEX "datasets_project_id_idx" ON "datasets"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "dataset_revisions_dataset_id_number_key" ON "dataset_revisions"("dataset_id", "number");

-- CreateIndex
CREATE INDEX "notifications_user_id_id_idx" ON "notifications"("user_id", "id" DESC);

-- CreateIndex
CREATE INDEX "two_factors_user_id_idx" ON "two_factors"("user_id");

-- CreateIndex
CREATE INDEX "two_factors_secret_idx" ON "two_factors"("secret");

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_study_id_fkey" FOREIGN KEY ("study_id") REFERENCES "studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculations" ADD CONSTRAINT "calculations_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "calculation_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_revisions" ADD CONSTRAINT "calculation_revisions_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_revisions" ADD CONSTRAINT "calculation_revisions_calculation_id_fkey" FOREIGN KEY ("calculation_id") REFERENCES "calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_revisions" ADD CONSTRAINT "calculation_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_reviews" ADD CONSTRAINT "calculation_reviews_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_reviews" ADD CONSTRAINT "calculation_reviews_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "calculation_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_reviews" ADD CONSTRAINT "calculation_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_dependencies" ADD CONSTRAINT "calculation_dependencies_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_dependencies" ADD CONSTRAINT "calculation_dependencies_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "calculation_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_dependencies" ADD CONSTRAINT "calculation_dependencies_source_calculation_id_fkey" FOREIGN KEY ("source_calculation_id") REFERENCES "calculations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calculation_dependencies" ADD CONSTRAINT "calculation_dependencies_source_revision_id_fkey" FOREIGN KEY ("source_revision_id") REFERENCES "calculation_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_current_revision_id_fkey" FOREIGN KEY ("current_revision_id") REFERENCES "dataset_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_revisions" ADD CONSTRAINT "dataset_revisions_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_revisions" ADD CONSTRAINT "dataset_revisions_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dataset_revisions" ADD CONSTRAINT "dataset_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================================================
-- Sécurité (Phase 3, lots C et D) — écrit à la main, après le DDL généré par Prisma.
-- =============================================================================

-- Recherche globale insensible aux accents (extension de confiance depuis PostgreSQL 13).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE FUNCTION app_search_text(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(p, '')))
$$;
GRANT EXECUTE ON FUNCTION app_search_text(text) TO consulpro_app;

-- -----------------------------------------------------------------------------
-- Privilèges : une révision, un avis, une dépendance et une révision de données ne se
-- modifient ni ne se suppriment. Études, calculs et jeux de données ne se suppriment pas
-- (leurs révisions immuables disparaîtraient avec eux).
-- -----------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON "calculation_revisions" FROM consulpro_app;
REVOKE UPDATE, DELETE ON "calculation_reviews" FROM consulpro_app;
REVOKE UPDATE, DELETE ON "calculation_dependencies" FROM consulpro_app;
REVOKE UPDATE, DELETE ON "dataset_revisions" FROM consulpro_app;
REVOKE DELETE ON "studies", "calculations", "datasets", "notifications" FROM consulpro_app;

-- -----------------------------------------------------------------------------
-- RLS : mêmes règles d'accès que le projet ; l'auteur d'une écriture est l'utilisateur
-- courant (on ne signe pas au nom d'un autre — condition du contrôle « quatre yeux »).
-- -----------------------------------------------------------------------------
ALTER TABLE "studies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY studies_access ON "studies" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "calculations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY calculations_access ON "calculations" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "calculation_revisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY calculation_revisions_read ON "calculation_revisions" FOR SELECT
  USING (organization_id = app_current_org() AND app_can_access_project(project_id));
CREATE POLICY calculation_revisions_insert ON "calculation_revisions" FOR INSERT
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id)
              AND author_id = app_current_user());

ALTER TABLE "calculation_reviews" ENABLE ROW LEVEL SECURITY;
CREATE POLICY calculation_reviews_read ON "calculation_reviews" FOR SELECT
  USING (organization_id = app_current_org() AND app_can_access_project(project_id));
CREATE POLICY calculation_reviews_insert ON "calculation_reviews" FOR INSERT
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id)
              AND reviewer_id = app_current_user());

ALTER TABLE "calculation_dependencies" ENABLE ROW LEVEL SECURITY;
CREATE POLICY calculation_dependencies_read ON "calculation_dependencies" FOR SELECT
  USING (organization_id = app_current_org() AND app_can_access_project(project_id));
CREATE POLICY calculation_dependencies_insert ON "calculation_dependencies" FOR INSERT
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "datasets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY datasets_access ON "datasets" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "dataset_revisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY dataset_revisions_read ON "dataset_revisions" FOR SELECT
  USING (organization_id = app_current_org() AND app_can_access_project(project_id));
CREATE POLICY dataset_revisions_insert ON "dataset_revisions" FOR INSERT
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id)
              AND author_id = app_current_user());

-- Notifications : chacun ne voit et ne marque comme lues que les siennes ; on n'en adresse
-- qu'aux membres de l'organisation courante.
CREATE FUNCTION app_is_org_member(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m
                  WHERE m.organization_id = app_current_org() AND m.user_id = p_user_id)
$$;
GRANT EXECUTE ON FUNCTION app_is_org_member(uuid) TO consulpro_app;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_read ON "notifications" FOR SELECT
  USING (user_id = app_current_user());
CREATE POLICY notifications_update ON "notifications" FOR UPDATE
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());
CREATE POLICY notifications_insert ON "notifications" FOR INSERT
  WITH CHECK (organization_id = app_current_org() AND app_is_org_member(user_id));

-- Une notification ne change que par son marquage « lu ».
CREATE FUNCTION guard_notification_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.user_id, NEW.organization_id, NEW.type, NEW.title, NEW.body, NEW.link, NEW.created_at)
     IS DISTINCT FROM
     (OLD.user_id, OLD.organization_id, OLD.type, OLD.title, OLD.body, OLD.link, OLD.created_at) THEN
    RAISE EXCEPTION 'Notification : seul le marquage « lu » est modifiable'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER notifications_guard BEFORE UPDATE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION guard_notification_update();

-- -----------------------------------------------------------------------------
-- Révisions immuables (ADR-0005). Une révision naît « calculée » ; seul son statut de
-- contrôle change ensuite, et uniquement par le trigger des avis ci-dessous.
-- -----------------------------------------------------------------------------
CREATE FUNCTION guard_calculation_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.workflow_status <> 'COMPUTED' THEN
      RAISE EXCEPTION 'Une révision naît au statut COMPUTED' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF current_setting('app.review_transition', true) IS DISTINCT FROM 'on'
     OR (to_jsonb(NEW) - 'workflow_status') IS DISTINCT FROM (to_jsonb(OLD) - 'workflow_status') THEN
    RAISE EXCEPTION 'Révision de calcul immuable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER calculation_revisions_guard BEFORE INSERT OR UPDATE ON "calculation_revisions"
  FOR EACH ROW EXECUTE FUNCTION guard_calculation_revision();

-- Contrôle à deux niveaux : l'auteur valide sa révision courante, puis une autre personne
-- la vérifie ou la rejette (motif obligatoire). Mêmes règles que packages/domain.
CREATE FUNCTION apply_calculation_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_revision calculation_revisions%ROWTYPE;
  v_current uuid;
  v_next "WorkflowStatus";
BEGIN
  SELECT * INTO v_revision FROM calculation_revisions WHERE id = NEW.revision_id FOR UPDATE;
  IF NOT FOUND OR v_revision.organization_id <> NEW.organization_id
     OR v_revision.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'Révision introuvable' USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT current_revision_id INTO v_current FROM calculations WHERE id = v_revision.calculation_id;
  IF v_current IS DISTINCT FROM NEW.revision_id THEN
    RAISE EXCEPTION 'Seule la révision courante se contrôle' USING ERRCODE = 'check_violation';
  END IF;
  IF v_revision.result_status IN ('INVALID', 'ERROR') THEN
    RAISE EXCEPTION 'Révision sans résultat : contrôle impossible' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.type = 'VALIDATION' THEN
    IF NEW.reviewer_id <> v_revision.author_id THEN
      RAISE EXCEPTION 'Seul l''auteur valide son calcul' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.decision <> 'APPROVED' OR v_revision.workflow_status <> 'COMPUTED' THEN
      RAISE EXCEPTION 'Validation impossible dans cet état' USING ERRCODE = 'check_violation';
    END IF;
    v_next := 'VALIDATED';
  ELSE
    IF NEW.reviewer_id = v_revision.author_id THEN
      RAISE EXCEPTION 'Le vérificateur ne peut pas être l''auteur du calcul'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_revision.workflow_status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'Seule une révision validée se vérifie' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decision = 'REJECTED' AND length(trim(coalesce(NEW.comment, ''))) < 3 THEN
      RAISE EXCEPTION 'Motif de rejet obligatoire' USING ERRCODE = 'check_violation';
    END IF;
    v_next := CASE NEW.decision WHEN 'APPROVED' THEN 'VERIFIED' ELSE 'REJECTED' END;
  END IF;

  PERFORM set_config('app.review_transition', 'on', true);
  UPDATE calculation_revisions SET workflow_status = v_next WHERE id = NEW.revision_id;
  PERFORM set_config('app.review_transition', '', true);
  RETURN NEW;
END
$$;
CREATE TRIGGER calculation_reviews_apply BEFORE INSERT ON "calculation_reviews"
  FOR EACH ROW EXECUTE FUNCTION apply_calculation_review();
CREATE TRIGGER calculation_reviews_immutable BEFORE UPDATE ON "calculation_reviews"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER calculation_dependencies_immutable BEFORE UPDATE ON "calculation_dependencies"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER dataset_revisions_immutable BEFORE UPDATE ON "dataset_revisions"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- La révision courante d'un calcul (ou d'un jeu de données) est l'une de SES révisions.
CREATE FUNCTION guard_current_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.current_revision_id IS NOT NULL THEN
    IF TG_TABLE_NAME = 'calculations' AND NOT EXISTS (
         SELECT 1 FROM calculation_revisions
          WHERE id = NEW.current_revision_id AND calculation_id = NEW.id) THEN
      RAISE EXCEPTION 'Révision courante étrangère au calcul' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_TABLE_NAME = 'datasets' AND NOT EXISTS (
         SELECT 1 FROM dataset_revisions
          WHERE id = NEW.current_revision_id AND dataset_id = NEW.id) THEN
      RAISE EXCEPTION 'Révision courante étrangère au jeu de données' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER calculations_current_revision BEFORE UPDATE ON "calculations"
  FOR EACH ROW EXECUTE FUNCTION guard_current_revision();
CREATE TRIGGER datasets_current_revision BEFORE UPDATE ON "datasets"
  FOR EACH ROW EXECUTE FUNCTION guard_current_revision();

-- Projet archivé : lecture seule pour ses études, calculs, contrôles et données.
CREATE TRIGGER studies_not_archived BEFORE INSERT OR UPDATE ON "studies"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER calculations_not_archived BEFORE INSERT OR UPDATE ON "calculations"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER calculation_revisions_not_archived BEFORE INSERT ON "calculation_revisions"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER calculation_reviews_not_archived BEFORE INSERT ON "calculation_reviews"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER calculation_dependencies_not_archived BEFORE INSERT ON "calculation_dependencies"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER datasets_not_archived BEFORE INSERT OR UPDATE ON "datasets"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER dataset_revisions_not_archived BEFORE INSERT ON "dataset_revisions"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
