-- CreateTable
CREATE TABLE "atividades" (
    "id" TEXT NOT NULL,
    "lider_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "data_hora" TIMESTAMP(3) NOT NULL,
    "local" TEXT,
    "qtd_envolvidos" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atividades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atividades_lider_id_idx" ON "atividades"("lider_id");

-- CreateIndex
CREATE INDEX "atividades_data_hora_idx" ON "atividades"("data_hora");

-- AddForeignKey
ALTER TABLE "atividades" ADD CONSTRAINT "atividades_lider_id_fkey" FOREIGN KEY ("lider_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
