import { createHash } from 'node:crypto';
import { prisma } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';
import { normalizeBrazilianPhone } from '../domain/phone.js';
import type { WhatsAppRecipientStatus } from '../types.js';

type JsonRecord = Record<string, unknown>;
type TransactionClient = Pick<
  typeof prisma,
  'whatsAppRecipient' | 'whatsAppCampaign' | 'whatsAppInteraction' | 'whatsAppSuppression'
>;

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

const LOWER_RECIPIENT_STATES: Record<WhatsAppRecipientStatus, WhatsAppRecipientStatus[]> = {
  PENDING: [],
  QUEUED: ['PENDING'],
  SENT: ['PENDING', 'QUEUED'],
  DELIVERED: ['PENDING', 'QUEUED', 'SENT'],
  READ: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED'],
  PLAYED: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ'],
  FAILED: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'PLAYED'],
  CANCELED: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'PLAYED'],
};

const SENT_OR_BEYOND = new Set<WhatsAppRecipientStatus>(['SENT', 'DELIVERED', 'READ', 'PLAYED']);

function stableFallbackId(eventType: string, messageId: string | null, status: string | null) {
  const source = `${eventType}|${messageId ?? 'none'}|${status ?? 'received'}`;
  return `fallback:${createHash('sha256').update(source).digest('hex')}`;
}

function isOptOut(text: string | null) {
  return text !== null && /^sair[.!]?$/i.test(text.trim());
}

async function recipientByMessageId(
  tx: TransactionClient,
  tenantId: string,
  messageId: string | null,
) {
  if (messageId === null) return null;
  return tx.whatsAppRecipient.findFirst({
    where: { tenantId, externalMessageIds: { has: messageId } },
  });
}

async function recipientForInbound(
  tx: TransactionClient,
  tenantId: string,
  quotedId: string | null,
  phone: string | null,
) {
  const quoted = await recipientByMessageId(tx, tenantId, quotedId);
  if (quoted !== null || phone === null) return quoted;
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return tx.whatsAppRecipient.findFirst({
    where: {
      tenantId,
      phoneNormalized: phone,
      status: { in: ['SENT', 'DELIVERED', 'READ', 'PLAYED'] },
      sentAt: { gte: cutoff },
    },
    orderBy: { sentAt: 'desc' },
  });
}

async function advanceRecipientAtomically(
  tx: TransactionClient,
  tenantId: string,
  recipientId: string,
  status: WhatsAppRecipientStatus,
  occurredAt: Date,
) {
  const lower = LOWER_RECIPIENT_STATES[status];
  if (lower.length === 0) return;
  const field = statusDateField(status);
  await tx.whatsAppRecipient.updateMany({
    where: { id: recipientId, tenantId, status: { in: lower } },
    data: { status, ...(field === undefined ? {} : { [field]: occurredAt }) },
  });
}

async function refreshCampaignMetricsInTransaction(
  tx: TransactionClient,
  tenantId: string,
  campaignId: string,
) {
  const campaign = await tx.whatsAppCampaign.findFirst({
    where: { id: campaignId, tenantId },
    include: { recipients: { where: { tenantId, isValid: true } } },
  });
  if (campaign === null) return;
  const recipients = campaign.recipients;
  const queued = recipients.filter(({ status }) => status !== 'PENDING').length;
  const sent = recipients.filter(({ status }) => SENT_OR_BEYOND.has(status)).length;
  const failed = recipients.filter(({ status }) => status === 'FAILED').length;
  const delivered = recipients.filter(({ status }) => ['DELIVERED', 'READ', 'PLAYED'].includes(status)).length;
  const read = recipients.filter(({ status }) => ['READ', 'PLAYED'].includes(status)).length;
  const played = recipients.filter(({ status }) => status === 'PLAYED').length;
  await tx.whatsAppCampaign.updateMany({
    where: { id: campaignId, tenantId },
    data: {
      queuedCount: Math.max(campaign.queuedCount, queued),
      sentCount: Math.max(campaign.sentCount, sent),
      failedCount: Math.max(campaign.failedCount, failed),
      deliveredCount: Math.max(campaign.deliveredCount, delivered),
      readCount: Math.max(campaign.readCount, read),
      playedCount: Math.max(campaign.playedCount, played),
    },
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
  const tenantId = getTenantId();

  try {
    return await prisma.$transaction(async (tx) => {
      // Tenant predicates are explicit throughout this transaction. This keeps
      // isolation independent of whether Prisma propagates client extensions
      // to an interactive transaction client in a future adapter release.
      const duplicate = await tx.whatsAppInteraction.findFirst({
        where: { tenantId, externalId },
      });
      if (duplicate !== null) return { accepted: true, processed: false, duplicate: true };

      const recipient = inbound
        ? await recipientForInbound(tx, tenantId, quotedId, phone)
        : await recipientByMessageId(tx, tenantId, messageId);
      if (recipient === null && !optOut) {
        return { accepted: true, processed: false, duplicate: false };
      }

      await tx.whatsAppInteraction.create({
        data: {
          tenantId,
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

      if (recipient !== null && status !== null && !inbound) {
        await advanceRecipientAtomically(tx, tenantId, recipient.id, status, occurredAt);
      }

      if (inbound && recipient !== null && !optOut) {
        await tx.whatsAppCampaign.updateMany({
          where: { id: recipient.campaignId, tenantId }, data: { replyCount: { increment: 1 } },
        });
      }

      if (optOut && phone !== null) {
        await tx.whatsAppSuppression.upsert({
          where: { tenantId_phoneNormalized: { tenantId, phoneNormalized: phone } },
          create: {
            tenantId, phoneNormalized: phone, active: true,
            reason: 'SAIR', source: 'WEBHOOK', firstOptOutAt: occurredAt, lastOptOutAt: occurredAt,
          },
          update: {
            active: true, reason: 'SAIR', source: 'WEBHOOK', lastOptOutAt: occurredAt,
            reauthorizedAt: null, reauthorizedById: null,
          },
        });
        await tx.whatsAppRecipient.updateMany({
          where: { tenantId, phoneNormalized: phone, status: { in: ['PENDING', 'QUEUED'] } },
          data: { status: 'CANCELED', canceledAt: occurredAt },
        });
        if (recipient !== null) {
          await tx.whatsAppCampaign.updateMany({
            where: { id: recipient.campaignId, tenantId }, data: { optOutCount: { increment: 1 } },
          });
        }
      }

      await tx.whatsAppInteraction.updateMany({
        where: { tenantId, externalId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      if (recipient !== null) {
        await refreshCampaignMetricsInTransaction(tx, tenantId, recipient.campaignId);
      }
      return { accepted: true, processed: true, duplicate: false };
    }) as WebhookProcessResult;
  } catch (error) {
    if (isUniqueViolation(error)) return { accepted: true, processed: false, duplicate: true };
    throw error;
  }
}
