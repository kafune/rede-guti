import { createHash } from 'node:crypto';
import { prisma } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';
import { advanceRecipientStatus } from '../domain/metrics.js';
import { normalizeBrazilianPhone } from '../domain/phone.js';
import type { WhatsAppRecipientStatus } from '../types.js';
import { refreshCampaignMetrics } from './campaign-service.js';

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const nonEmptyString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function firstString(...values: unknown[]) {
  for (const value of values) {
    const found = nonEmptyString(value);
    if (found !== null) return found;
  }
  return null;
}

function normalizeWebhookPhone(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const digits = value.split('@')[0].replace(/\D/g, '');
    const normalized = normalizeBrazilianPhone(digits);
    if (normalized.valid) return normalized.normalized;
  }
  return null;
}

function webhookDate(value: unknown): Date {
  if (typeof value === 'number') {
    const parsed = new Date(value < 10_000_000_000 ? value * 1000 : value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric)
      ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
      : new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
}

function deliveryStatus(value: unknown): WhatsAppRecipientStatus | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const map: Record<string, WhatsAppRecipientStatus> = {
    scheduled: 'QUEUED', queued: 'QUEUED', sent: 'SENT', delivered: 'DELIVERED',
    read: 'READ', played: 'PLAYED', failed: 'FAILED', error: 'FAILED',
    canceled: 'CANCELED', cancelled: 'CANCELED',
  };
  return map[normalized] ?? null;
}

function statusDateField(status: WhatsAppRecipientStatus) {
  const fields: Partial<Record<WhatsAppRecipientStatus,
    'queuedAt' | 'sentAt' | 'deliveredAt' | 'readAt' | 'playedAt' | 'failedAt' | 'canceledAt'>> = {
    QUEUED: 'queuedAt', SENT: 'sentAt', DELIVERED: 'deliveredAt', READ: 'readAt',
    PLAYED: 'playedAt', FAILED: 'failedAt', CANCELED: 'canceledAt',
  };
  return fields[status];
}

function stableFallbackId(eventType: string, messageId: string | null, status: string | null) {
  const source = `${eventType}|${messageId ?? 'none'}|${status ?? 'received'}`;
  return `fallback:${createHash('sha256').update(source).digest('hex')}`;
}

function isOptOut(text: string | null) {
  return text !== null && /^sair[.!]?$/i.test(text.trim());
}

async function recipientByMessageId(messageId: string | null) {
  if (messageId === null) return null;
  return prisma.whatsAppRecipient.findFirst({
    where: { externalMessageIds: { has: messageId } },
  });
}

async function recipientForInbound(quotedId: string | null, phone: string | null) {
  const quoted = await recipientByMessageId(quotedId);
  if (quoted !== null || phone === null) return quoted;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return prisma.whatsAppRecipient.findFirst({
    where: {
      phoneNormalized: phone,
      status: { in: ['SENT', 'DELIVERED', 'READ', 'PLAYED'] },
      OR: [{ sentAt: { gte: cutoff } }, { sentAt: null, updatedAt: { gte: cutoff } }],
    },
    orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }],
  });
}

function isUniqueViolation(error: unknown) {
  return record(error).code === 'P2002';
}

export interface WebhookProcessResult {
  accepted: true;
  processed: boolean;
  duplicate: boolean;
}

export async function processUazapiWebhook(payload: unknown): Promise<WebhookProcessResult> {
  const root = record(payload);
  const data = Object.keys(record(root.data)).length > 0
    ? record(root.data)
    : Object.keys(record(root.message)).length > 0
      ? record(root.message)
      : root;
  const context = record(data.context);
  const quoted = record(data.quoted ?? context.quoted);
  const eventType = firstString(root.event, root.eventType, root.type, data.event) ?? 'unknown';
  const messageId = firstString(data.messageid, data.messageId, data.message_id, data.id);
  const rawStatus = firstString(data.status, data.messageStatus, root.status);
  const status = deliveryStatus(rawStatus);
  const explicitId = firstString(root.eventId, root.event_id, root.webhookId, root.webhook_id, root.id);
  const externalId = explicitId ?? stableFallbackId(eventType, messageId, rawStatus?.toLowerCase() ?? null);
  const phone = normalizeWebhookPhone(
    data.sender, data.from, data.phone, data.number, data.chatid, data.chatId,
  );
  const text = firstString(data.text, data.body, data.content, record(data.message).text);
  const quotedId = firstString(
    data.quotedMessageId, data.quoted_message_id, quoted.messageid, quoted.messageId,
    context.quotedMessageId, context.stanzaId,
  );
  const occurredAt = webhookDate(data.timestamp ?? data.created_at ?? root.timestamp);
  const fromMe = data.fromMe === true || data.from_me === true || data.wasSentByApi === true;
  const inbound = !fromMe && (text !== null || quotedId !== null || status === null);
  const optOut = inbound && isOptOut(text);
  const recipient = inbound
    ? await recipientForInbound(quotedId, phone)
    : await recipientByMessageId(messageId);

  const duplicate = await prisma.whatsAppInteraction.findUnique({
    where: { tenantId_externalId: { tenantId: getTenantId(), externalId } },
  });
  if (duplicate) return { accepted: true, processed: false, duplicate: true };
  if (recipient === null && !optOut) return { accepted: true, processed: false, duplicate: false };

  try {
    await prisma.whatsAppInteraction.create({
      data: {
        tenantId: getTenantId(),
        campaignId: recipient?.campaignId ?? null,
        recipientId: recipient?.id ?? null,
        externalId,
        eventType,
        direction: inbound ? 'INBOUND' : 'OUTBOUND',
        status: 'RECEIVED',
        phoneNormalized: phone,
        payload: payload as any,
        occurredAt,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { accepted: true, processed: false, duplicate: true };
    throw error;
  }

  try {
    if (recipient !== null && status !== null && !inbound) {
      const next = advanceRecipientStatus(recipient.status, status);
      const field = statusDateField(next);
      await prisma.whatsAppRecipient.update({
        where: { id: recipient.id },
        data: {
          status: next,
          ...(field !== undefined && next !== recipient.status && recipient[field] === null
            ? { [field]: occurredAt }
            : {}),
        },
      });
    }

    if (inbound && recipient !== null && !optOut) {
      await prisma.whatsAppCampaign.update({
        where: { id: recipient.campaignId }, data: { replyCount: { increment: 1 } },
      });
    }

    if (optOut && phone !== null) {
      const now = occurredAt;
      await prisma.whatsAppSuppression.upsert({
        where: { tenantId_phoneNormalized: { tenantId: getTenantId(), phoneNormalized: phone } },
        create: {
          tenantId: getTenantId(), phoneNormalized: phone, active: true,
          reason: 'SAIR', source: 'WEBHOOK', firstOptOutAt: now, lastOptOutAt: now,
        },
        update: {
          active: true, reason: 'SAIR', source: 'WEBHOOK', lastOptOutAt: now,
          reauthorizedAt: null, reauthorizedById: null,
        },
      });
      await prisma.whatsAppRecipient.updateMany({
        where: { phoneNormalized: phone, status: { in: ['PENDING', 'QUEUED'] } },
        data: { status: 'CANCELED', canceledAt: now },
      });
      if (recipient !== null) {
        await prisma.whatsAppCampaign.update({
          where: { id: recipient.campaignId }, data: { optOutCount: { increment: 1 } },
        });
      }
    }

    await prisma.whatsAppInteraction.update({
      where: { tenantId_externalId: { tenantId: getTenantId(), externalId } },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
    if (recipient !== null) await refreshCampaignMetrics(recipient.campaignId);
    return { accepted: true, processed: true, duplicate: false };
  } catch (error) {
    await prisma.whatsAppInteraction.update({
      where: { tenantId_externalId: { tenantId: getTenantId(), externalId } },
      data: {
        status: 'FAILED', processedAt: new Date(),
        error: error instanceof Error ? error.message.slice(0, 1_000) : 'Webhook processing failed.',
      },
    });
    throw error;
  }
}
