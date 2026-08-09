-- Módulo Territorial: Igrejas (cadastro rico) × Zona Eleitoral × Equipes × Visitas
-- Estende "churches" com campos territoriais (todos opcionais/backfill seguro) e
-- cria as tabelas do fluxo operacional de visitas com check-in geolocalizado.

-- AlterTable: campos territoriais na igreja
ALTER TABLE "churches"
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "denomination" TEXT,
  ADD COLUMN "pastor_name" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "street" TEXT,
  ADD COLUMN "number" TEXT,
  ADD COLUMN "complement" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "postal_code" TEXT,
  ADD COLUMN "formatted_address" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "geocoding_provider" TEXT,
  ADD COLUMN "geocoding_confidence" TEXT,
  ADD COLUMN "electoral_zone_id" TEXT,
  ADD COLUMN "zone_classification_method" TEXT,
  ADD COLUMN "zone_confidence_score" DOUBLE PRECISION,
  ADD COLUMN "zone_source" TEXT,
  ADD COLUMN "zone_requires_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "zone_validated_by_id" TEXT,
  ADD COLUMN "zone_validated_at" TIMESTAMP(3),
  ADD COLUMN "current_team_id" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ativa',
  ADD COLUMN "priority" TEXT,
  ADD COLUMN "verification_status" TEXT NOT NULL DEFAULT 'nao_verificada',
  ADD COLUMN "notes" TEXT;

CREATE INDEX "churches_electoral_zone_id_idx" ON "churches"("electoral_zone_id");
CREATE INDEX "churches_current_team_id_idx" ON "churches"("current_team_id");
CREATE INDEX "churches_district_idx" ON "churches"("district");

-- CreateTable: electoral_zones
CREATE TABLE "electoral_zones" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT,
    "color" TEXT,
    "eleitores" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "electoral_zones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "electoral_zones_tenant_id_number_key" ON "electoral_zones"("tenant_id", "number");
CREATE INDEX "electoral_zones_tenant_id_idx" ON "electoral_zones"("tenant_id");

-- CreateTable: bairro_zonas
CREATE TABLE "bairro_zonas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "bairro_normalized" TEXT NOT NULL,
    "bairro_label" TEXT NOT NULL,
    "zone_number" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'Mapa Político de Guarulhos',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bairro_zonas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bairro_zonas_tenant_id_bairro_normalized_zone_number_key" ON "bairro_zonas"("tenant_id", "bairro_normalized", "zone_number");
CREATE INDEX "bairro_zonas_tenant_id_bairro_normalized_idx" ON "bairro_zonas"("tenant_id", "bairro_normalized");

-- CreateTable: teams
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "electoral_zone_id" TEXT,
    "leader_user_id" TEXT,
    "driver_user_id" TEXT,
    "vehicle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "teams_tenant_id_idx" ON "teams"("tenant_id");
CREATE INDEX "teams_electoral_zone_id_idx" ON "teams"("electoral_zone_id");

-- CreateTable: team_members
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");
CREATE INDEX "team_members_tenant_id_idx" ON "team_members"("tenant_id");

-- CreateTable: team_church_assignments
CREATE TABLE "team_church_assignments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "assigned_by_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_church_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "team_church_assignments_tenant_id_idx" ON "team_church_assignments"("tenant_id");
CREATE INDEX "team_church_assignments_church_id_idx" ON "team_church_assignments"("church_id");
CREATE INDEX "team_church_assignments_team_id_idx" ON "team_church_assignments"("team_id");

-- CreateTable: visits
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "church_id" TEXT NOT NULL,
    "team_id" TEXT,
    "driver_user_id" TEXT,
    "visit_number" INTEGER NOT NULL,
    "scheduled_date" TIMESTAMP(3),
    "scheduled_start_time" TEXT,
    "scheduled_end_time" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aguardando_agendamento',
    "public_token" TEXT NOT NULL,
    "token_revoked" BOOLEAN NOT NULL DEFAULT false,
    "checkin_at" TIMESTAMP(3),
    "checkin_latitude" DOUBLE PRECISION,
    "checkin_longitude" DOUBLE PRECISION,
    "checkin_accuracy" DOUBLE PRECISION,
    "checkin_device_timestamp" TIMESTAMP(3),
    "distance_from_church" DOUBLE PRECISION,
    "geofence_status" TEXT,
    "justification" TEXT,
    "checkout_at" TIMESTAMP(3),
    "outcome" TEXT,
    "outcome_happened" TEXT,
    "responsible_contacted" TEXT,
    "next_action" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "notes" TEXT,
    "photo_url" TEXT,
    "photo_hash" TEXT,
    "photo_uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "visits_public_token_key" ON "visits"("public_token");
CREATE UNIQUE INDEX "visits_church_id_visit_number_key" ON "visits"("church_id", "visit_number");
CREATE INDEX "visits_tenant_id_idx" ON "visits"("tenant_id");
CREATE INDEX "visits_church_id_idx" ON "visits"("church_id");
CREATE INDEX "visits_team_id_idx" ON "visits"("team_id");
CREATE INDEX "visits_status_idx" ON "visits"("status");
CREATE INDEX "visits_scheduled_date_idx" ON "visits"("scheduled_date");

-- CreateTable: visit_checkins (append-only)
CREATE TABLE "visit_checkins" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "device_timestamp" TIMESTAMP(3),
    "server_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "distance_from_church" DOUBLE PRECISION,
    "geofence_status" TEXT,
    "within_geofence" BOOLEAN,
    "justification" TEXT,
    "photo_url" TEXT,
    "photo_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "visit_checkins_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "visit_checkins_tenant_id_idx" ON "visit_checkins"("tenant_id");
CREATE INDEX "visit_checkins_visit_id_idx" ON "visit_checkins"("visit_id");

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateTable: territory_settings
CREATE TABLE "territory_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "checkin_radius_meters" INTEGER NOT NULL DEFAULT 100,
    "checkin_warn_meters" INTEGER NOT NULL DEFAULT 200,
    "require_photo" BOOLEAN NOT NULL DEFAULT true,
    "visits_per_church" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "territory_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "territory_settings_tenant_id_key" ON "territory_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "churches" ADD CONSTRAINT "churches_electoral_zone_id_fkey" FOREIGN KEY ("electoral_zone_id") REFERENCES "electoral_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "churches" ADD CONSTRAINT "churches_current_team_id_fkey" FOREIGN KEY ("current_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "electoral_zones" ADD CONSTRAINT "electoral_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bairro_zonas" ADD CONSTRAINT "bairro_zonas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teams" ADD CONSTRAINT "teams_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_electoral_zone_id_fkey" FOREIGN KEY ("electoral_zone_id") REFERENCES "electoral_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_leader_user_id_fkey" FOREIGN KEY ("leader_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "teams_driver_user_id_fkey" FOREIGN KEY ("driver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_church_assignments" ADD CONSTRAINT "team_church_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "team_church_assignments" ADD CONSTRAINT "team_church_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_church_assignments" ADD CONSTRAINT "team_church_assignments_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "visits" ADD CONSTRAINT "visits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_church_id_fkey" FOREIGN KEY ("church_id") REFERENCES "churches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "visits" ADD CONSTRAINT "visits_driver_user_id_fkey" FOREIGN KEY ("driver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visit_checkins" ADD CONSTRAINT "visit_checkins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "visit_checkins" ADD CONSTRAINT "visit_checkins_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "territory_settings" ADD CONSTRAINT "territory_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
