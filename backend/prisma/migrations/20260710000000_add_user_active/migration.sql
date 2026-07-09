-- Ativação de usuários: contas inativas não fazem login nem usam a API.
-- Chave geral em app_config para bloquear temporariamente todas as lideranças.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "app_config" ADD COLUMN "lider_access_blocked" BOOLEAN NOT NULL DEFAULT false;
