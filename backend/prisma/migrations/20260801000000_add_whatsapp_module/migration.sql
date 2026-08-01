-- CreateEnum
CREATE TYPE "WhatsAppCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELED', 'FAILED');
CREATE TYPE "WhatsAppRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'PLAYED', 'FAILED', 'CANCELED');
CREATE TYPE "WhatsAppRecipientOrigin" AS ENUM ('INDICATION', 'EVENT_GUEST', 'TEAM_DRIVER', 'TEAM_MEMBER', 'MANUAL');
CREATE TYPE "WhatsAppCampaignCategory" AS ENUM ('MARKETING', 'UTILITY');
CREATE TYPE "WhatsAppInteractionStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "whatsapp_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "instance_id" TEXT,
    "instance_name" TEXT,
    "instance_token_encrypted" TEXT,
    "phone" TEXT,
    "status" TEXT,
    "webhook_configured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_campaigns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WhatsAppCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "category" "WhatsAppCampaignCategory" NOT NULL,
    "audience_filter" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "remote_folder_id" TEXT,
    "remote_folder_status" TEXT,
    "remote_folder_created_at" TIMESTAMP(3),
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "valid_recipients" INTEGER NOT NULL DEFAULT 0,
    "excluded_recipients" INTEGER NOT NULL DEFAULT 0,
    "queued_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "delivered_count" INTEGER NOT NULL DEFAULT 0,
    "read_count" INTEGER NOT NULL DEFAULT 0,
    "played_count" INTEGER NOT NULL DEFAULT 0,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "opt_out_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "queued_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_recipients" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "origin" "WhatsAppRecipientOrigin" NOT NULL,
    "source_id" TEXT,
    "source_name" TEXT,
    "person_name" TEXT NOT NULL,
    "phone_original" TEXT NOT NULL,
    "phone_normalized" TEXT,
    "personalized_content" JSONB NOT NULL,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "exclusion_reason" TEXT,
    "status" "WhatsAppRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "external_message_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "external_chat_id" TEXT,
    "error" TEXT,
    "queued_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "played_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "WhatsAppCampaignCategory" NOT NULL,
    "content" JSONB NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_media" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "public_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_suppressions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "source" TEXT,
    "created_by_id" TEXT,
    "first_opt_out_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_opt_out_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reauthorized_at" TIMESTAMP(3),
    "reauthorized_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_interactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "recipient_id" TEXT,
    "external_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" "WhatsAppInteractionStatus" NOT NULL DEFAULT 'RECEIVED',
    "phone_normalized" TEXT,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_tenant_id_key" ON "whatsapp_configs"("tenant_id");
CREATE INDEX "whatsapp_campaigns_tenant_id_status_idx" ON "whatsapp_campaigns"("tenant_id", "status");
CREATE INDEX "whatsapp_campaigns_created_by_id_idx" ON "whatsapp_campaigns"("created_by_id");
CREATE INDEX "whatsapp_campaigns_scheduled_at_idx" ON "whatsapp_campaigns"("scheduled_at");
CREATE INDEX "whatsapp_recipients_tenant_id_phone_normalized_idx" ON "whatsapp_recipients"("tenant_id", "phone_normalized");
CREATE INDEX "whatsapp_recipients_campaign_id_status_idx" ON "whatsapp_recipients"("campaign_id", "status");
CREATE UNIQUE INDEX "whatsapp_templates_tenant_id_name_key" ON "whatsapp_templates"("tenant_id", "name");
CREATE INDEX "whatsapp_templates_created_by_id_idx" ON "whatsapp_templates"("created_by_id");
CREATE UNIQUE INDEX "whatsapp_media_public_token_key" ON "whatsapp_media"("public_token");
CREATE INDEX "whatsapp_media_tenant_id_created_at_idx" ON "whatsapp_media"("tenant_id", "created_at");
CREATE INDEX "whatsapp_media_uploaded_by_id_idx" ON "whatsapp_media"("uploaded_by_id");
CREATE UNIQUE INDEX "whatsapp_suppressions_tenant_id_phone_normalized_key" ON "whatsapp_suppressions"("tenant_id", "phone_normalized");
CREATE INDEX "whatsapp_suppressions_tenant_id_active_idx" ON "whatsapp_suppressions"("tenant_id", "active");
CREATE INDEX "whatsapp_suppressions_created_by_id_idx" ON "whatsapp_suppressions"("created_by_id");
CREATE INDEX "whatsapp_suppressions_reauthorized_by_id_idx" ON "whatsapp_suppressions"("reauthorized_by_id");
CREATE UNIQUE INDEX "whatsapp_interactions_tenant_id_external_id_key" ON "whatsapp_interactions"("tenant_id", "external_id");
CREATE INDEX "whatsapp_interactions_campaign_id_idx" ON "whatsapp_interactions"("campaign_id");
CREATE INDEX "whatsapp_interactions_recipient_id_idx" ON "whatsapp_interactions"("recipient_id");
CREATE INDEX "whatsapp_interactions_tenant_id_occurred_at_idx" ON "whatsapp_interactions"("tenant_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_recipients" ADD CONSTRAINT "whatsapp_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_recipients" ADD CONSTRAINT "whatsapp_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_media" ADD CONSTRAINT "whatsapp_media_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_media" ADD CONSTRAINT "whatsapp_media_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_suppressions" ADD CONSTRAINT "whatsapp_suppressions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_suppressions" ADD CONSTRAINT "whatsapp_suppressions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_suppressions" ADD CONSTRAINT "whatsapp_suppressions_reauthorized_by_id_fkey" FOREIGN KEY ("reauthorized_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_interactions" ADD CONSTRAINT "whatsapp_interactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "whatsapp_interactions" ADD CONSTRAINT "whatsapp_interactions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "whatsapp_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_interactions" ADD CONSTRAINT "whatsapp_interactions_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "whatsapp_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
