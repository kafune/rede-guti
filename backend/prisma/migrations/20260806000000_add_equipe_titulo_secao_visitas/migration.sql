-- Equipes: título de eleitor + seção para o motorista e cada apoiador, origem do
-- cadastro (MANUAL/AUTOCADASTRO) e prestação de contas via tabela de visitas.

-- AlterTable: dados eleitorais do motorista + origem do cadastro
ALTER TABLE "equipes"
    ADD COLUMN "motorista_titulo_eleitor" TEXT,
    ADD COLUMN "motorista_secao" TEXT,
    ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable: dados eleitorais de cada apoiador
ALTER TABLE "equipe_membros"
    ADD COLUMN "titulo_eleitor" TEXT,
    ADD COLUMN "secao" TEXT;

-- CreateTable: visitas (prestação de contas em campo)
CREATE TABLE "equipe_visitas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "equipe_id" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "data_hora" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "foto_url" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "registrado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipe_visitas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipe_visitas_equipe_id_idx" ON "equipe_visitas"("equipe_id");
CREATE INDEX "equipe_visitas_tenant_id_idx" ON "equipe_visitas"("tenant_id");

-- AddForeignKey
ALTER TABLE "equipe_visitas"
    ADD CONSTRAINT "equipe_visitas_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipe_visitas"
    ADD CONSTRAINT "equipe_visitas_equipe_id_fkey"
    FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
