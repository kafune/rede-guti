-- Autocadastro individual das pessoas da equipe (motorista + apoiadores) com
-- dados pessoais, aceite do trabalho e fotos de documentos anexadas. A pessoa
-- preenche por um link público (sem login). Identidade por "slot" estável
-- (MOTORISTA sem slot; apoiador por ordem), não pelo id do membro — que é
-- recriado a cada edição da equipe.

-- CreateTable
CREATE TABLE "membro_cadastros" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "equipe_id" TEXT NOT NULL,
    "pessoa_tipo" TEXT NOT NULL,
    "slot" INTEGER,
    "membro_id" TEXT,
    "nome_completo" TEXT NOT NULL,
    "cpf" TEXT,
    "rg" TEXT,
    "data_nascimento" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "cep" TEXT,
    "endereco" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "observacoes" TEXT,
    "consentimento" BOOLEAN NOT NULL DEFAULT false,
    "consentimento_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membro_cadastros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membro_cadastro_documentos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cadastro_id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'Documento',
    "imagem_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membro_cadastro_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "membro_cadastros_equipe_id_idx" ON "membro_cadastros"("equipe_id");
CREATE INDEX "membro_cadastros_tenant_id_idx" ON "membro_cadastros"("tenant_id");
CREATE INDEX "membro_cadastros_membro_id_idx" ON "membro_cadastros"("membro_id");
CREATE INDEX "membro_cadastro_documentos_cadastro_id_idx" ON "membro_cadastro_documentos"("cadastro_id");
CREATE INDEX "membro_cadastro_documentos_tenant_id_idx" ON "membro_cadastro_documentos"("tenant_id");

-- AddForeignKey
ALTER TABLE "membro_cadastros"
    ADD CONSTRAINT "membro_cadastros_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membro_cadastros"
    ADD CONSTRAINT "membro_cadastros_equipe_id_fkey"
    FOREIGN KEY ("equipe_id") REFERENCES "equipes"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "membro_cadastro_documentos"
    ADD CONSTRAINT "membro_cadastro_documentos_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "membro_cadastro_documentos"
    ADD CONSTRAINT "membro_cadastro_documentos_cadastro_id_fkey"
    FOREIGN KEY ("cadastro_id") REFERENCES "membro_cadastros"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
