-- CreateTable
CREATE TABLE "metas_cidade" (
    "id" TEXT NOT NULL,
    "municipality_id" TEXT NOT NULL,
    "regiao" TEXT,
    "eleitores" INTEGER NOT NULL DEFAULT 0,
    "votos_validos" INTEGER NOT NULL DEFAULT 0,
    "meta" INTEGER NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "metas_cidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metas_cidade_municipality_id_key" ON "metas_cidade"("municipality_id");

-- AddForeignKey
ALTER TABLE "metas_cidade" ADD CONSTRAINT "metas_cidade_municipality_id_fkey"
    FOREIGN KEY ("municipality_id") REFERENCES "municipalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
