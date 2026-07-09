-- Equipes de campanha (porta de igreja): 1 motorista com carro próprio + até 4
-- apoiadores. valor/valor_observacoes são restritos ao COORDENADOR (strip na API).

-- CreateEnum
CREATE TYPE "EquipeStatus" AS ENUM ('ATIVA', 'INATIVA');

-- CreateTable
CREATE TABLE "equipes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lider_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "motorista_nome" TEXT NOT NULL,
    "motorista_cnh" TEXT NOT NULL,
    "motorista_telefone" TEXT NOT NULL,
    "carro_placa" TEXT NOT NULL,
    "carro_modelo" TEXT NOT NULL,
    "carro_cor" TEXT NOT NULL,
    "status" "EquipeStatus" NOT NULL DEFAULT 'ATIVA',
    "valor" DECIMAL(12,2),
    "valor_observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipe_membros" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "equipe_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipe_membros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipes_lider_id_idx" ON "equipes"("lider_id");
CREATE INDEX "equipes_tenant_id_idx" ON "equipes"("tenant_id");
CREATE INDEX "equipe_membros_equipe_id_idx" ON "equipe_membros"("equipe_id");
CREATE INDEX "equipe_membros_tenant_id_idx" ON "equipe_membros"("tenant_id");

-- AddForeignKey
ALTER TABLE "equipes"
    ADD CONSTRAINT "equipes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipes"
    ADD CONSTRAINT "equipes_lider_id_fkey"
    FOREIGN KEY ("lider_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipe_membros"
    ADD CONSTRAINT "equipe_membros_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "equipe_membros"
    ADD CONSTRAINT "equipe_membros_equipe_id_fkey"
    FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
