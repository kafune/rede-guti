-- Rótulo da liderança de origem da igreja (preserva o vínculo declarado no
-- cadastro/importação mesmo sem usuário correspondente).
ALTER TABLE "igrejas" ADD COLUMN "lideranca_label" TEXT;
