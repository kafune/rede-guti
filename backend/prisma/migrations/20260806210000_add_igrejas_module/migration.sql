-- Módulo de cadastro de igrejas (independente do catálogo simples `churches`).
-- Registro rico + vínculo igreja<->equipe para o autocadastro por link.

-- CreateTable: igrejas
CREATE TABLE "igrejas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "denominacao" TEXT NOT NULL DEFAULT '',
    "pastor" TEXT NOT NULL DEFAULT '',
    "endereco" TEXT NOT NULL DEFAULT '',
    "bairro" TEXT NOT NULL DEFAULT '',
    "cidade" TEXT NOT NULL DEFAULT 'Guarulhos',
    "estado" TEXT NOT NULL DEFAULT 'SP',
    "telefone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "observacoes" TEXT NOT NULL DEFAULT '',
    "membros_estimados" INTEGER,
    "zona_eleitoral" INTEGER,
    "origem" TEXT NOT NULL DEFAULT 'admin',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "igrejas_pkey" PRIMARY KEY ("id")
);

-- CreateTable: equipe_igrejas (team_church_assignments)
CREATE TABLE "equipe_igrejas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "equipe_id" TEXT NOT NULL,
    "igreja_id" TEXT NOT NULL,
    "data_agendada" DATE,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipe_igrejas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "igrejas_tenant_id_idx" ON "igrejas"("tenant_id");
CREATE INDEX "igrejas_created_by_idx" ON "igrejas"("created_by");
CREATE INDEX "equipe_igrejas_equipe_id_idx" ON "equipe_igrejas"("equipe_id");
CREATE INDEX "equipe_igrejas_igreja_id_idx" ON "equipe_igrejas"("igreja_id");
CREATE INDEX "equipe_igrejas_tenant_id_idx" ON "equipe_igrejas"("tenant_id");

-- AddForeignKey
ALTER TABLE "igrejas"
    ADD CONSTRAINT "igrejas_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "igrejas"
    ADD CONSTRAINT "igrejas_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "equipe_igrejas"
    ADD CONSTRAINT "equipe_igrejas_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipe_igrejas"
    ADD CONSTRAINT "equipe_igrejas_equipe_id_fkey"
    FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "equipe_igrejas"
    ADD CONSTRAINT "equipe_igrejas_igreja_id_fkey"
    FOREIGN KEY ("igreja_id") REFERENCES "igrejas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
