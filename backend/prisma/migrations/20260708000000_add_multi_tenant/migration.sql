-- Fase B multi-tenant.
-- Cria a tabela tenants e adiciona tenant_id NOT NULL (com FK) a todas as
-- tabelas de dados. Os dados pré-existentes são adotados pelo tenant 'default'
-- (id fixo, criado aqui), de modo que instâncias em produção migram sem nenhuma
-- variável de ambiente nova: TENANT_SLUG default é 'default'.
--
-- Uniques que passam a valer por tenant:
--   users.email                     → (tenant_id, email)
--   churches.name                   → (tenant_id, name)
--   municipalities (name, state)    → (tenant_id, name, state_code)
--   app_config passa a ter uma linha por tenant (tenant_id UNIQUE).

-- CreateTable: tenants
CREATE TABLE "tenants" (
    "id"         TEXT         NOT NULL,
    "slug"       TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- Tenant padrão que adota todos os dados existentes.
INSERT INTO "tenants" ("id", "slug", "name") VALUES ('default', 'default', 'Default');

-- users -----------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN "tenant_id" TEXT;
UPDATE "users" SET "tenant_id" = 'default';
ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "users"
    ADD CONSTRAINT "users_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "users_email_key";
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- churches --------------------------------------------------------------------
ALTER TABLE "churches" ADD COLUMN "tenant_id" TEXT;
UPDATE "churches" SET "tenant_id" = 'default';
ALTER TABLE "churches" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "churches"
    ADD CONSTRAINT "churches_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "churches_name_key";
CREATE UNIQUE INDEX "churches_tenant_id_name_key" ON "churches"("tenant_id", "name");
CREATE INDEX "churches_tenant_id_idx" ON "churches"("tenant_id");

-- municipalities ---------------------------------------------------------------
ALTER TABLE "municipalities" ADD COLUMN "tenant_id" TEXT;
UPDATE "municipalities" SET "tenant_id" = 'default';
ALTER TABLE "municipalities" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "municipalities"
    ADD CONSTRAINT "municipalities_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "municipalities_name_state_code_key";
CREATE UNIQUE INDEX "municipalities_tenant_id_name_state_code_key"
    ON "municipalities"("tenant_id", "name", "state_code");
CREATE INDEX "municipalities_tenant_id_idx" ON "municipalities"("tenant_id");

-- indications -------------------------------------------------------------------
ALTER TABLE "indications" ADD COLUMN "tenant_id" TEXT;
UPDATE "indications" SET "tenant_id" = 'default';
ALTER TABLE "indications" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "indications"
    ADD CONSTRAINT "indications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "indications_tenant_id_idx" ON "indications"("tenant_id");

-- eventos -----------------------------------------------------------------------
ALTER TABLE "eventos" ADD COLUMN "tenant_id" TEXT;
UPDATE "eventos" SET "tenant_id" = 'default';
ALTER TABLE "eventos" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "eventos"
    ADD CONSTRAINT "eventos_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "eventos_tenant_id_idx" ON "eventos"("tenant_id");

-- evento_indicados ----------------------------------------------------------------
ALTER TABLE "evento_indicados" ADD COLUMN "tenant_id" TEXT;
UPDATE "evento_indicados" SET "tenant_id" = 'default';
ALTER TABLE "evento_indicados" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "evento_indicados"
    ADD CONSTRAINT "evento_indicados_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "evento_indicados_tenant_id_idx" ON "evento_indicados"("tenant_id");

-- atividades ----------------------------------------------------------------------
ALTER TABLE "atividades" ADD COLUMN "tenant_id" TEXT;
UPDATE "atividades" SET "tenant_id" = 'default';
ALTER TABLE "atividades" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "atividades"
    ADD CONSTRAINT "atividades_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "atividades_tenant_id_idx" ON "atividades"("tenant_id");

-- metas_cidade ----------------------------------------------------------------------
ALTER TABLE "metas_cidade" ADD COLUMN "tenant_id" TEXT;
UPDATE "metas_cidade" SET "tenant_id" = 'default';
ALTER TABLE "metas_cidade" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "metas_cidade"
    ADD CONSTRAINT "metas_cidade_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "metas_cidade_tenant_id_idx" ON "metas_cidade"("tenant_id");

-- app_config: deixa de ser singleton; uma linha por tenant ---------------------------
ALTER TABLE "app_config" ADD COLUMN "tenant_id" TEXT;
UPDATE "app_config" SET "tenant_id" = 'default';
ALTER TABLE "app_config" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "app_config"
    ADD CONSTRAINT "app_config_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "app_config_tenant_id_key" ON "app_config"("tenant_id");

-- leader_stats / leader_points_ledger: a coluna nullable já existia (reservada) ------
UPDATE "leader_stats" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "leader_stats" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "leader_stats"
    ADD CONSTRAINT "leader_stats_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "leader_points_ledger" SET "tenant_id" = 'default' WHERE "tenant_id" IS NULL;
ALTER TABLE "leader_points_ledger" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "leader_points_ledger"
    ADD CONSTRAINT "leader_points_ledger_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
