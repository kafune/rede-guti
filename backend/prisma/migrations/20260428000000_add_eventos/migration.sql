CREATE TYPE "EventoIndicadoStatus" AS ENUM ('INDICADO', 'APROVADO', 'RECUSADO', 'PRESENTE');

CREATE TABLE "eventos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "hora" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "limite_por_lider" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "encerrado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evento_indicados" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "lider_id" TEXT NOT NULL,
    "status" "EventoIndicadoStatus" NOT NULL DEFAULT 'INDICADO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evento_indicados_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evento_indicados_evento_id_telefone_key" ON "evento_indicados"("evento_id", "telefone");
CREATE INDEX "evento_indicados_evento_id_idx" ON "evento_indicados"("evento_id");
CREATE INDEX "evento_indicados_lider_id_idx" ON "evento_indicados"("lider_id");

ALTER TABLE "evento_indicados" ADD CONSTRAINT "evento_indicados_evento_id_fkey"
    FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "evento_indicados" ADD CONSTRAINT "evento_indicados_lider_id_fkey"
    FOREIGN KEY ("lider_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
