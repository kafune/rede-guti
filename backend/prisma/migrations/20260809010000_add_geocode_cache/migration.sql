-- Cache de geocodificação (evita reconsultar o mesmo endereço no provedor).

CREATE TABLE "geocode_cache" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "address_key" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "provider" TEXT,
    "confidence" TEXT,
    "formatted_address" TEXT,
    "found" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "geocode_cache_tenant_id_address_key_key" ON "geocode_cache"("tenant_id", "address_key");
CREATE INDEX "geocode_cache_tenant_id_idx" ON "geocode_cache"("tenant_id");

ALTER TABLE "geocode_cache" ADD CONSTRAINT "geocode_cache_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
