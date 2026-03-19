-- Create the new role enum with the hierarchy required by the network.
CREATE TYPE "Role_new" AS ENUM ('COORDENADOR', 'LIDER_REGIONAL', 'LIDER_LOCAL');

-- Expand the tables before migrating existing data.
ALTER TABLE "users" ADD COLUMN "indicated_by_user_id" TEXT;
ALTER TABLE "indications" ADD COLUMN "indicated_by_user_id" TEXT;

-- Replace legacy ADMIN/VIEWER roles with the new hierarchy.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
ALTER COLUMN "role" TYPE "Role_new"
USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'COORDENADOR'
    WHEN 'VIEWER' THEN 'LIDER_LOCAL'
    ELSE 'LIDER_LOCAL'
  END
)::"Role_new";

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'LIDER_LOCAL';

-- Backfill direct indication ownership for existing supporter records.
UPDATE "indications"
SET "indicated_by_user_id" = "created_by_id"
WHERE "indicated_by_user_id" IS NULL;

UPDATE "indications" AS indication
SET "indicated_by" = COALESCE(
  NULLIF(TRIM(creator."name"), ''),
  creator."email",
  indication."indicated_by"
)
FROM "users" AS creator
WHERE creator."id" = indication."created_by_id";

-- Indexes for hierarchy and permission filters.
CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_indicated_by_user_id_idx" ON "users"("indicated_by_user_id");
CREATE INDEX "indications_created_by_id_idx" ON "indications"("created_by_id");
CREATE INDEX "indications_indicated_by_user_id_idx" ON "indications"("indicated_by_user_id");

-- Foreign keys that preserve the tree if an upper node is removed manually.
ALTER TABLE "users"
ADD CONSTRAINT "users_indicated_by_user_id_fkey"
FOREIGN KEY ("indicated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "indications"
ADD CONSTRAINT "indications_indicated_by_user_id_fkey"
FOREIGN KEY ("indicated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
