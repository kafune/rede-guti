-- Adds the coordinator announcement ("mural") shown on every leader dashboard.
ALTER TABLE "app_config" ADD COLUMN "announcement" TEXT;
