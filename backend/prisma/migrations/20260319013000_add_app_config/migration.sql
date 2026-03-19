CREATE TABLE "app_config" (
    "id" TEXT NOT NULL,
    "whatsapp_group_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "app_config" ("id", "whatsapp_group_link")
SELECT
    'default',
    "devzapp_link"
FROM "users"
WHERE "devzapp_link" IS NOT NULL
  AND btrim("devzapp_link") <> ''
ORDER BY
    CASE WHEN "role" = 'COORDENADOR' THEN 0 ELSE 1 END,
    "created_at" ASC
LIMIT 1;
