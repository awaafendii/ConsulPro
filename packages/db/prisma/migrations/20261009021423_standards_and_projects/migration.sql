-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('NONE', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "Discipline" AS ENUM ('BTP', 'ELEC', 'PLUMBING', 'TOPO');

-- CreateEnum
CREATE TYPE "StandardNature" AS ENUM ('NORM', 'GUIDE', 'PRACTICE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StandardVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'TO_VERIFY');

-- CreateEnum
CREATE TYPE "ParameterKind" AS ENUM ('SCALAR', 'ENUM', 'TABLE');

-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('BLOCKING', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('ENGINEER', 'TECHNICIAN', 'COLLABORATOR', 'VIEWER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platform_role" "PlatformRole" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "time_zone" TEXT;

-- CreateTable
CREATE TABLE "standards" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "discipline" "Discipline",
    "nature" "StandardNature" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_versions" (
    "id" UUID NOT NULL,
    "standard_id" UUID NOT NULL,
    "organization_id" UUID,
    "label" TEXT NOT NULL,
    "status" "StandardVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "source_notes" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "published_by_id" UUID,
    "deprecated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "standard_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parameters" (
    "id" UUID NOT NULL,
    "standard_version_id" UUID NOT NULL,
    "organization_id" UUID,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ParameterKind" NOT NULL,
    "value" JSONB NOT NULL,
    "unit" TEXT,
    "source" JSONB NOT NULL,
    "verification" "VerificationStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL,
    "standard_version_id" UUID NOT NULL,
    "organization_id" UUID,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "RuleSeverity" NOT NULL,
    "clause" TEXT,
    "parameter_keys" TEXT[],
    "implementation" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parameter_overrides" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID,
    "standard_version_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "justification" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "parameter_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "client" TEXT,
    "location" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE,
    "end_date" DATE,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_disciplines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_standard_versions" (
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "discipline" "Discipline" NOT NULL,
    "standard_version_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_standard_versions_pkey" PRIMARY KEY ("project_id","discipline","standard_version_id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "type" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "standards_organization_id_code_key" ON "standards"("organization_id", "code");

-- CreateIndex
CREATE INDEX "standard_versions_organization_id_status_idx" ON "standard_versions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "standard_versions_standard_id_label_key" ON "standard_versions"("standard_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "parameters_standard_version_id_key_key" ON "parameters"("standard_version_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "rules_standard_version_id_code_key" ON "rules"("standard_version_id", "code");

-- CreateIndex
CREATE INDEX "parameter_overrides_organization_id_project_id_idx" ON "parameter_overrides"("organization_id", "project_id");

-- Une seule surcharge par paramètre et par niveau (organisation : project_id NULL ; projet).
-- NULLS NOT DISTINCT (ajouté à la main, Prisma ne l'exprime pas) : deux surcharges
-- d'organisation du même paramètre sont des doublons.
CREATE UNIQUE INDEX "parameter_overrides_scope_key" ON "parameter_overrides"("organization_id", "project_id", "standard_version_id", "key") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "projects_organization_id_status_idx" ON "projects"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organization_id_code_key" ON "projects"("organization_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_organization_id_key" ON "projects"("id", "organization_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_disciplines_project_id_discipline_key" ON "project_disciplines"("project_id", "discipline");

-- CreateIndex
CREATE INDEX "activity_events_project_id_id_idx" ON "activity_events"("project_id", "id" DESC);

-- AddForeignKey
ALTER TABLE "standards" ADD CONSTRAINT "standards_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_versions" ADD CONSTRAINT "standard_versions_standard_id_fkey" FOREIGN KEY ("standard_id") REFERENCES "standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_versions" ADD CONSTRAINT "standard_versions_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parameters" ADD CONSTRAINT "parameters_standard_version_id_fkey" FOREIGN KEY ("standard_version_id") REFERENCES "standard_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_standard_version_id_fkey" FOREIGN KEY ("standard_version_id") REFERENCES "standard_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parameter_overrides" ADD CONSTRAINT "parameter_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parameter_overrides" ADD CONSTRAINT "parameter_overrides_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parameter_overrides" ADD CONSTRAINT "parameter_overrides_standard_version_id_fkey" FOREIGN KEY ("standard_version_id") REFERENCES "standard_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parameter_overrides" ADD CONSTRAINT "parameter_overrides_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_disciplines" ADD CONSTRAINT "project_disciplines_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_standard_versions" ADD CONSTRAINT "project_standard_versions_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_standard_versions" ADD CONSTRAINT "project_standard_versions_standard_version_id_fkey" FOREIGN KEY ("standard_version_id") REFERENCES "standard_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_project_id_organization_id_fkey" FOREIGN KEY ("project_id", "organization_id") REFERENCES "projects"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- Sécurité (ajout manuel) — référentiels, projets
-- docs/architecture/11-referentiels.md, 12-securite-rbac.md §2.2, ADR-0005, ADR-0006
-- =============================================================================

-- Droits du rôle applicatif (les privilèges par défaut couvrent déjà ces tables ;
-- on les explicite et on restreint les tables en ajout seul).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "standards", "standard_versions", "parameters", "rules", "parameter_overrides",
  "projects", "project_members", "project_disciplines", "project_standard_versions"
TO consulpro_app;
REVOKE UPDATE, DELETE ON "activity_events" FROM consulpro_app;
GRANT SELECT, INSERT ON "activity_events" TO consulpro_app;

-- Rôle plateforme : jamais attribué ni modifié par l'application. Un REVOKE de colonne
-- serait sans effet (consulpro_app détient UPDATE sur toute la table) : un trigger s'en charge.
-- Seule une connexion d'administration (CLI `platform:grant-admin`) peut l'attribuer.
CREATE FUNCTION guard_platform_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'consulpro_app' AND (
       (TG_OP = 'INSERT' AND NEW.platform_role <> 'NONE')
    OR (TG_OP = 'UPDATE' AND NEW.platform_role IS DISTINCT FROM OLD.platform_role)) THEN
    RAISE EXCEPTION 'Le rôle plateforme ne s''attribue pas depuis l''application'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER users_platform_role_guard BEFORE INSERT OR UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION guard_platform_role();

-- -----------------------------------------------------------------------------
-- Fonctions d'accès (SECURITY DEFINER : elles lisent les adhésions sans RLS,
-- ce qui évite toute récursion entre les politiques de projects et project_members).
-- -----------------------------------------------------------------------------
CREATE FUNCTION app_is_org_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
     WHERE m.organization_id = app_current_org()
       AND m.user_id = app_current_user()
       AND m.role IN ('OWNER', 'ADMIN'))
$$;

CREATE FUNCTION app_can_access_project(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_is_org_manager() OR EXISTS (
    SELECT 1 FROM project_members pm
     WHERE pm.project_id = p_project_id
       AND pm.organization_id = app_current_org()
       AND pm.user_id = app_current_user())
$$;

-- Amorçage : le créateur d'un projet encore sans membre peut s'y ajouter.
CREATE FUNCTION app_can_bootstrap_project(p_project_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
     WHERE p.id = p_project_id
       AND p.organization_id = app_current_org()
       AND p.created_by_id = app_current_user()
       AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id))
$$;

GRANT EXECUTE ON FUNCTION app_is_org_manager(), app_can_access_project(uuid),
  app_can_bootstrap_project(uuid) TO consulpro_app;

-- -----------------------------------------------------------------------------
-- RLS — référentiels : système (organisation NULL) lisible par tous ; écritures
-- de l'application limitées aux référentiels de l'organisation courante.
-- -----------------------------------------------------------------------------
ALTER TABLE "standards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY standards_read ON "standards" FOR SELECT
  USING (organization_id IS NULL OR organization_id = app_current_org());
CREATE POLICY standards_write ON "standards" FOR ALL
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

ALTER TABLE "standard_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY standard_versions_read ON "standard_versions" FOR SELECT
  USING (organization_id IS NULL OR organization_id = app_current_org());
CREATE POLICY standard_versions_write ON "standard_versions" FOR ALL
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

ALTER TABLE "parameters" ENABLE ROW LEVEL SECURITY;
CREATE POLICY parameters_read ON "parameters" FOR SELECT
  USING (organization_id IS NULL OR organization_id = app_current_org());
CREATE POLICY parameters_write ON "parameters" FOR ALL
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

ALTER TABLE "rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rules_read ON "rules" FOR SELECT
  USING (organization_id IS NULL OR organization_id = app_current_org());
CREATE POLICY rules_write ON "rules" FOR ALL
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());

ALTER TABLE "parameter_overrides" ENABLE ROW LEVEL SECURITY;
CREATE POLICY parameter_overrides_access ON "parameter_overrides" FOR ALL
  USING (organization_id = app_current_org() AND (project_id IS NULL OR app_can_access_project(project_id)))
  WITH CHECK (organization_id = app_current_org() AND (project_id IS NULL OR app_can_access_project(project_id)));

-- -----------------------------------------------------------------------------
-- RLS — projets : propriétaires/administrateurs de l'organisation et membres du projet.
-- -----------------------------------------------------------------------------
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_access ON "projects" FOR SELECT
  USING (organization_id = app_current_org() AND app_can_access_project(id));
CREATE POLICY projects_insert ON "projects" FOR INSERT
  WITH CHECK (organization_id = app_current_org() AND created_by_id = app_current_user());
CREATE POLICY projects_update ON "projects" FOR UPDATE
  USING (organization_id = app_current_org() AND app_can_access_project(id))
  WITH CHECK (organization_id = app_current_org());
-- Aucun DELETE pour l'application : un projet s'archive.

ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_members_read ON "project_members" FOR SELECT
  USING (organization_id = app_current_org() AND app_can_access_project(project_id));
-- Amorçage : le créateur ne peut ajouter que lui-même comme premier membre.
CREATE POLICY project_members_insert ON "project_members" FOR INSERT
  WITH CHECK (organization_id = app_current_org()
              AND (app_can_access_project(project_id)
                   OR (app_can_bootstrap_project(project_id) AND user_id = app_current_user())));
CREATE POLICY project_members_change ON "project_members" FOR UPDATE
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org());
CREATE POLICY project_members_delete ON "project_members" FOR DELETE
  USING (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "project_disciplines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_disciplines_access ON "project_disciplines" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "project_standard_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_standard_versions_access ON "project_standard_versions" FOR ALL
  USING (organization_id = app_current_org() AND app_can_access_project(project_id))
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

ALTER TABLE "activity_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_events_read ON "activity_events" FOR SELECT
  USING (organization_id = app_current_org() AND app_can_access_project(project_id));
CREATE POLICY activity_events_insert ON "activity_events" FOR INSERT
  WITH CHECK (organization_id = app_current_org() AND app_can_access_project(project_id));

-- -----------------------------------------------------------------------------
-- Immuabilité des référentiels publiés (ADR-0005).
-- -----------------------------------------------------------------------------
CREATE FUNCTION forbid_change_unless_draft() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status "StandardVersionStatus";
BEGIN
  SELECT status INTO v_status FROM standard_versions
   WHERE id = COALESCE(NEW.standard_version_id, OLD.standard_version_id);
  IF v_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Référentiel %: version non modifiable (%)', TG_TABLE_NAME, v_status
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
CREATE TRIGGER parameters_draft_only BEFORE INSERT OR UPDATE OR DELETE ON "parameters"
  FOR EACH ROW EXECUTE FUNCTION forbid_change_unless_draft();
CREATE TRIGGER rules_draft_only BEFORE INSERT OR UPDATE OR DELETE ON "rules"
  FOR EACH ROW EXECUTE FUNCTION forbid_change_unless_draft();

-- Une version publiée ne change plus, sauf sa dépréciation ; une version publiée
-- ou dépréciée ne se supprime pas.
CREATE FUNCTION guard_standard_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Version publiée : suppression interdite' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'DRAFT' THEN
    IF NEW.status = 'PUBLISHED' AND (NEW.published_at IS NULL OR NEW.published_by_id IS NULL) THEN
      RAISE EXCEPTION 'Publication sans date ni auteur' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'DEPRECATED' THEN
      RAISE EXCEPTION 'Une version brouillon ne peut pas être dépréciée' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'DEPRECATED'
     AND NEW.label = OLD.label AND NEW.standard_id = OLD.standard_id
     AND NEW.source_notes IS NOT DISTINCT FROM OLD.source_notes
     AND NEW.published_at = OLD.published_at AND NEW.published_by_id = OLD.published_by_id
     AND NEW.deprecated_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Version % : modification interdite', OLD.status USING ERRCODE = 'insufficient_privilege';
END
$$;
CREATE TRIGGER standard_versions_guard BEFORE UPDATE OR DELETE ON "standard_versions"
  FOR EACH ROW EXECUTE FUNCTION guard_standard_version();

-- Publication / dépréciation d'un référentiel SYSTÈME : réservées au rôle PLATFORM_ADMIN,
-- dont l'identité est celle du contexte de transaction posé par l'application.
CREATE FUNCTION publish_system_standard_version(p_version_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = app_current_user() AND platform_role = 'PLATFORM_ADMIN') THEN
    RAISE EXCEPTION 'Réservé aux administrateurs de la plateforme' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE standard_versions
     SET status = 'PUBLISHED', published_at = now(), published_by_id = app_current_user(), updated_at = now()
   WHERE id = p_version_id AND organization_id IS NULL AND status = 'DRAFT';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version système brouillon introuvable' USING ERRCODE = 'no_data_found';
  END IF;
END
$$;

CREATE FUNCTION deprecate_system_standard_version(p_version_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = app_current_user() AND platform_role = 'PLATFORM_ADMIN') THEN
    RAISE EXCEPTION 'Réservé aux administrateurs de la plateforme' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE standard_versions
     SET status = 'DEPRECATED', deprecated_at = now(), updated_at = now()
   WHERE id = p_version_id AND organization_id IS NULL AND status = 'PUBLISHED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version système publiée introuvable' USING ERRCODE = 'no_data_found';
  END IF;
END
$$;
GRANT EXECUTE ON FUNCTION publish_system_standard_version(uuid), deprecate_system_standard_version(uuid)
  TO consulpro_app;

-- -----------------------------------------------------------------------------
-- Projet archivé : lecture seule (défense en profondeur ; le domaine refuse aussi).
-- -----------------------------------------------------------------------------
CREATE FUNCTION forbid_if_project_archived() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_project uuid := COALESCE(NEW.project_id, OLD.project_id);
BEGIN
  -- Seule exception : le retrait en cascade d'une personne qui quitte l'organisation.
  IF TG_TABLE_NAME = 'project_members' AND TG_OP = 'DELETE'
     AND current_setting('app.membership_cascade', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF v_project IS NOT NULL AND EXISTS (SELECT 1 FROM projects WHERE id = v_project AND status = 'ARCHIVED') THEN
    RAISE EXCEPTION 'Projet archivé : lecture seule' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$;
CREATE TRIGGER project_members_not_archived BEFORE INSERT OR UPDATE OR DELETE ON "project_members"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER project_disciplines_not_archived BEFORE INSERT OR UPDATE OR DELETE ON "project_disciplines"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER project_standard_versions_not_archived BEFORE INSERT OR UPDATE OR DELETE ON "project_standard_versions"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();
CREATE TRIGGER parameter_overrides_not_archived BEFORE INSERT OR UPDATE OR DELETE ON "parameter_overrides"
  FOR EACH ROW EXECUTE FUNCTION forbid_if_project_archived();

-- Un projet archivé ne change plus, sauf son désarchivage.
CREATE FUNCTION guard_archived_project() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'ARCHIVED' AND NEW.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'Projet archivé : lecture seule' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER projects_archived_guard BEFORE UPDATE ON "projects"
  FOR EACH ROW EXECUTE FUNCTION guard_archived_project();

-- Fil d'activité : pas de modification (les suppressions ne viennent que des cascades).
CREATE TRIGGER activity_events_immutable BEFORE UPDATE ON "activity_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- -----------------------------------------------------------------------------
-- Quitter une organisation retire de tous ses projets, y compris archivés : sans cela,
-- une nouvelle adhésion restaurerait d'anciens accès aux projets.
-- -----------------------------------------------------------------------------
CREATE FUNCTION remove_project_memberships() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.membership_cascade', 'on', true);
  DELETE FROM project_members
   WHERE organization_id = OLD.organization_id AND user_id = OLD.user_id;
  PERFORM set_config('app.membership_cascade', '', true);
  RETURN OLD;
END
$$;
CREATE TRIGGER memberships_remove_project_memberships AFTER DELETE ON "memberships"
  FOR EACH ROW EXECUTE FUNCTION remove_project_memberships();
