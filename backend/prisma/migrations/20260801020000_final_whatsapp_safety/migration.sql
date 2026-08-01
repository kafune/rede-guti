ALTER TYPE "WhatsAppCampaignStatus" ADD VALUE 'CANCELING' BEFORE 'CANCELED';

ALTER TABLE "whatsapp_campaigns"
  ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "retry_of_campaign_id" TEXT;

ALTER TABLE "whatsapp_recipients"
  ADD COLUMN "processed_webhook_event_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "whatsapp_campaigns"
  ADD CONSTRAINT "whatsapp_campaigns_tenant_id_idempotency_key_key"
    UNIQUE ("tenant_id", "idempotency_key"),
  ADD CONSTRAINT "whatsapp_campaigns_tenant_id_retry_of_campaign_id_key"
    UNIQUE ("tenant_id", "retry_of_campaign_id"),
  ADD CONSTRAINT "whatsapp_campaigns_retry_of_campaign_id_fkey"
    FOREIGN KEY ("retry_of_campaign_id") REFERENCES "whatsapp_campaigns"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
