import { config } from '../../config.js';
import { prisma, withAdvisoryLock, withAdvisoryLocks } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';
import type { AudienceFilter, AudiencePreview } from '../domain/audience.js';
import { applyMarketingFooter, buildUazapiMessage, personalizeContent } from '../domain/content.js';
import { normalizeBrazilianPhone } from '../domain/phone.js';
import type { WhatsAppCampaignContent, WhatsAppContentItem } from '../types.js';
import type { WhatsAppCampaignMetrics, WhatsAppCampaignStatus, WhatsAppRecipientStatus } from '../types.js';
import { advanceRecipientStatus, mergeCampaignMetrics } from '../domain/metrics.js';
import { UazapiError } from '../uazapi/client.js';
import { previewAudience } from './audience-service.js';
import { getConfiguredUazapiClient } from './config-service.js';

export interface CreateCampaignInput {
  name: string;
  category: 'MARKETING' | 'UTILITY';
  audienceFilter: AudienceFilter;
  content: WhatsAppCampaignContent;
  consentimentoConfirmado: true;
  scheduledAt?: string;
}

export interface TestCampaignInput {
  phone: string;
  name: string;
  category: 'MARKETING' | 'UTILITY';
  content: WhatsAppCampaignContent;
}

export class CampaignDispatchError extends Error {
  readonly statusCode = 502;
}

export class CampaignValidationError extends Error {
  readonly statusCode = 400;
}

export class CampaignConflictError extends Error {
  readonly statusCode = 409;
}

export class CampaignNotFoundError extends Error {
  readonly statusCode = 404;

  constructor() {
    super('Campaign not found.');
  }
}

export class CampaignStateIndeterminateError extends Error {
  readonly statusCode = 503;

  constructor() {
    super('Uazapi accepted the campaign, but local state could not be confirmed. Do not retry automatically.');
  }
}

export class CampaignSuppressionReconciliationError extends Error {
  readonly statusCode = 503;

  constructor() {
    super('Suppression recorded; remote campaign reconciliation is pending.');
  }
}

const configurationError = () => new Error('WhatsApp integration is not configured.');
const campaignOperationLock = (campaignId: string) =>
  `whatsapp:campaign:${getTenantId()}:${campaignId}`;

function campaignContent(input: Pick<CreateCampaignInput, 'category' | 'content'>): WhatsAppCampaignContent {
  return input.category === 'MARKETING' ? applyMarketingFooter(input.content) : input.content;
}

function allItems(content: WhatsAppCampaignContent): WhatsAppContentItem[] {
  return [content.primary, ...content.sequence];
}

function mediaIds(content: WhatsAppCampaignContent): string[] {
  const ids = new Set<string>();
  for (const item of allItems(content)) {
    if ('mediaId' in item && typeof item.mediaId === 'string') ids.add(item.mediaId);
    if (item.type === 'carousel') {
      for (const card of item.cards) if (card.mediaId) ids.add(card.mediaId);
    }
  }
  return [...ids];
}

async function mediaUrlFactory(content: WhatsAppCampaignContent, requireStored = true) {
  if (!config.publicApiUrl) throw configurationError();
  const ids = mediaIds(content);
  const stored = ids.length === 0 ? [] : await prisma.whatsAppMedia.findMany({
    where: { id: { in: ids } },
    select: { id: true, publicToken: true },
  });
  if (requireStored && stored.length !== ids.length) {
    throw new CampaignValidationError('Campaign media is no longer available.');
  }
  const publicTokens = new Map(stored.map(({ id, publicToken }) => [id, publicToken]));
  return (mediaId: string) =>
    `${config.publicApiUrl}/public/whatsapp/media/${publicTokens.get(mediaId) ?? mediaId}`;
}

function safeRemoteError(error: unknown): string {
  if (error instanceof UazapiError) return error.message;
  if (error instanceof Error && error.message === 'WhatsApp integration is not configured.') {
    return error.message;
  }
  return 'Unable to queue WhatsApp campaign.';
}

type RemoteRecord = Record<string, unknown>;
const record = (value: unknown): RemoteRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RemoteRecord
    : {};
const stringValue = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;

function remoteFolder(response: unknown) {
  const root = record(response);
  const nested = record(root.folder);
  const id = stringValue(root.folder_id) ?? stringValue(nested.id);
  if (!id) throw new UazapiError('UAZAPI_INVALID_RESPONSE', 502, 'Uazapi returned an invalid response.');
  const created = stringValue(root.created_at) ?? stringValue(nested.created_at);
  const createdAt = created === null ? null : new Date(created);
  return {
    id,
    status: stringValue(root.status) ?? stringValue(nested.status),
    createdAt: createdAt !== null && Number.isFinite(createdAt.getTime()) ? createdAt : null,
  };
}

function folderRecord(value: unknown) {
  const root = record(value);
  const nested = record(root.folder);
  return {
    id: stringValue(root.folder_id) ?? stringValue(root.id) ?? stringValue(nested.id),
    status: stringValue(root.status) ?? stringValue(nested.status),
  };
}

function responseItems(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const root = record(value);
  for (const key of keys) if (Array.isArray(root[key])) return root[key] as unknown[];
  return [];
}

function remoteMessageStatus(value: unknown): WhatsAppRecipientStatus | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const statuses: Record<string, WhatsAppRecipientStatus> = {
    scheduled: 'QUEUED', queued: 'QUEUED', pending: 'QUEUED',
    sent: 'SENT', delivered: 'DELIVERED', read: 'READ', played: 'PLAYED',
    failed: 'FAILED', error: 'FAILED', canceled: 'CANCELED', cancelled: 'CANCELED',
  };
  return statuses[normalized] ?? null;
}

function remotePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.split('@')[0].replace(/\D/g, '');
  const normalized = normalizeBrazilianPhone(candidate);
  return normalized.valid ? normalized.normalized : null;
}

function messageTimestamp(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'number') {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    const date = Number.isFinite(numeric)
      ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
      : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function statusDateField(status: WhatsAppRecipientStatus):
  'queuedAt' | 'sentAt' | 'deliveredAt' | 'readAt' | 'playedAt' | 'failedAt' | 'canceledAt' | null {
  const fields = {
    QUEUED: 'queuedAt', SENT: 'sentAt', DELIVERED: 'deliveredAt', READ: 'readAt',
    PLAYED: 'playedAt', FAILED: 'failedAt', CANCELED: 'canceledAt',
  } as const;
  return status === 'PENDING' ? null : fields[status];
}

const sentOrBeyond = new Set<WhatsAppRecipientStatus>(['SENT', 'DELIVERED', 'READ', 'PLAYED']);
const lowerRecipientStates: Record<WhatsAppRecipientStatus, WhatsAppRecipientStatus[]> = {
  PENDING: [],
  QUEUED: ['PENDING'],
  SENT: ['PENDING', 'QUEUED'],
  DELIVERED: ['PENDING', 'QUEUED', 'SENT'],
  READ: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED'],
  PLAYED: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ'],
  FAILED: ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'PLAYED'],
  CANCELED: ['PENDING', 'QUEUED'],
};

function metricsFromCampaign(campaign: any, recipients: Array<{ status: WhatsAppRecipientStatus }>): WhatsAppCampaignMetrics {
  return {
    status: campaign.status,
    queued: recipients.filter(({ status }) => status !== 'PENDING').length,
    sent: recipients.filter(({ status }) => sentOrBeyond.has(status)).length,
    failed: recipients.filter(({ status }) => status === 'FAILED').length,
    delivered: recipients.filter(({ status }) => ['DELIVERED', 'READ', 'PLAYED'].includes(status)).length,
    read: recipients.filter(({ status }) => ['READ', 'PLAYED'].includes(status)).length,
    played: recipients.filter(({ status }) => status === 'PLAYED').length,
    replies: campaign.replyCount,
    optOuts: campaign.optOutCount,
  };
}

export async function refreshCampaignMetrics(
  campaignId: string,
  incomingStatus?: WhatsAppCampaignStatus,
  expectedState?: { status: WhatsAppCampaignStatus; remoteFolderId: string | null },
) {
  const campaign = await prisma.whatsAppCampaign.findUnique({
    where: { id: campaignId }, include: { recipients: { where: { isValid: true } } },
  });
  if (!campaign) throw new CampaignNotFoundError();
  const current: WhatsAppCampaignMetrics = {
    status: campaign.status,
    queued: campaign.queuedCount,
    sent: campaign.sentCount,
    failed: campaign.failedCount,
    delivered: campaign.deliveredCount,
    read: campaign.readCount,
    played: campaign.playedCount,
    replies: campaign.replyCount,
    optOuts: campaign.optOutCount,
  };
  const derived = metricsFromCampaign(campaign, campaign.recipients as Array<{ status: WhatsAppRecipientStatus }>);
  const merged = mergeCampaignMetrics(current, { ...derived, status: incomingStatus ?? derived.status });
  const now = new Date();
  await prisma.$executeRawUnsafe(`
    UPDATE "whatsapp_campaigns"
    SET
      "queued_count" = GREATEST("queued_count", $1),
      "sent_count" = GREATEST("sent_count", $2),
      "failed_count" = GREATEST("failed_count", $3),
      "delivered_count" = GREATEST("delivered_count", $4),
      "read_count" = GREATEST("read_count", $5),
      "played_count" = GREATEST("played_count", $6),
      "reply_count" = GREATEST("reply_count", $7),
      "opt_out_count" = GREATEST("opt_out_count", $8),
      "updated_at" = NOW()
    WHERE "id" = $9 AND "tenant_id" = $10
  `, merged.queued, merged.sent, merged.failed, merged.delivered, merged.read, merged.played,
  merged.replies, merged.optOuts, campaignId, getTenantId());
  await prisma.whatsAppCampaign.updateMany({
    where: {
      id: campaignId,
      status: expectedState?.status ?? campaign.status,
      ...(expectedState === undefined ? {} : { remoteFolderId: expectedState.remoteFolderId }),
    },
    data: {
      status: merged.status,
      ...(merged.status === 'SENDING' && campaign.startedAt === null ? { startedAt: now } : {}),
      ...(merged.status === 'COMPLETED' && campaign.completedAt === null ? { completedAt: now } : {}),
      ...(merged.status === 'CANCELED' && campaign.canceledAt === null ? { canceledAt: now } : {}),
    },
  });
  return prisma.whatsAppCampaign.findUniqueOrThrow({ where: { id: campaignId } });
}

function campaignStatusFromRemote(status: string | null, hasSent: boolean): WhatsAppCampaignStatus | undefined {
  const normalized = status?.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) return hasSent ? 'SENDING' : undefined;
  if (['done', 'completed', 'complete', 'archived', 'finished'].includes(normalized)) return 'COMPLETED';
  if (['canceled', 'cancelled', 'deleted'].includes(normalized)) return 'CANCELED';
  if (normalized === 'deleting') return 'CANCELING';
  if (['failed', 'error'].includes(normalized)) return 'FAILED';
  if (['paused', 'stopped'].includes(normalized)) return 'PAUSED';
  if (['sending', 'active', 'running'].includes(normalized)) return hasSent ? 'SENDING' : 'SENDING';
  if (['scheduled', 'queued', 'pending'].includes(normalized)) return 'SCHEDULED';
  return hasSent ? 'SENDING' : undefined;
}

function advanceRemoteFolderStatus(current: string | null, incoming: string | null) {
  if (incoming === null) return current;
  if (current === null) return incoming;
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const terminal = new Set(['done', 'completed', 'complete', 'archived', 'finished', 'failed', 'error', 'canceled', 'cancelled', 'deleted']);
  const currentNormalized = normalize(current);
  const incomingNormalized = normalize(incoming);
  if (terminal.has(currentNormalized)) return current;
  if (terminal.has(incomingNormalized)) return incoming;
  const rank = (value: string) => ['scheduled', 'queued', 'pending'].includes(value)
    ? 0
    : ['sending', 'active', 'running'].includes(value)
      ? 1
      : ['paused', 'stopped'].includes(value)
        ? 2
        : value === 'deleting' ? 3 : 1;
  return rank(incomingNormalized) >= rank(currentNormalized) ? incoming : current;
}

async function requireCampaign(campaignId: string) {
  const campaign = await prisma.whatsAppCampaign.findUnique({
    where: { id: campaignId }, include: { recipients: true },
  });
  if (!campaign) throw new CampaignNotFoundError();
  return campaign;
}

async function listAllFolderMessages(client: Awaited<ReturnType<typeof getConfiguredUazapiClient>>, folderId: string) {
  const messages: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    const response = await client.listMessages({ folder_id: folderId, limit: 1000, offset });
    const page = responseItems(response, ['messages', 'data', 'items']);
    messages.push(...page);
    const total = Number(record(response).total);
    if (page.length < 1000 || (Number.isFinite(total) && messages.length >= total)) break;
  }
  return messages;
}

async function syncCampaignUnlocked(campaignId: string, folders?: unknown[]) {
  const campaign = await requireCampaign(campaignId);
  if (!campaign.remoteFolderId) return refreshCampaignMetrics(campaign.id);
  const client = await getConfiguredUazapiClient();
  const remoteFolders = folders ?? await client.listFolders();
  const folder = responseItems(remoteFolders, ['folders', 'data', 'items'])
    .map(folderRecord)
    .find(({ id }) => id === campaign.remoteFolderId);
  if (folder === undefined && campaign.status === 'CANCELING') {
    const canceledAt = new Date();
    const confirmed = await prisma.$transaction(async (tx) => {
      const changed = await tx.whatsAppCampaign.updateMany({
        where: {
          id: campaignId, status: 'CANCELING', remoteFolderId: campaign.remoteFolderId,
        },
        data: { status: 'CANCELED', canceledAt, remoteFolderStatus: 'deleted' },
      });
      if (changed.count !== 1) return false;
      await tx.whatsAppRecipient.updateMany({
        where: { campaignId, status: { in: ['PENDING', 'QUEUED'] } },
        data: { status: 'CANCELED', canceledAt },
      });
      return true;
    });
    return refreshCampaignMetrics(campaignId, confirmed ? 'CANCELED' : undefined);
  }
  const messages = await listAllFolderMessages(client, campaign.remoteFolderId);
  const byPhone = new Map<string, Array<{ id: string | null; status: WhatsAppRecipientStatus; occurredAt: Date | null; chatId: string | null }>>();
  for (const value of messages) {
    const message = record(value);
    const phone = remotePhone(message.chatid ?? message.chatId) ?? remotePhone(message.sender ?? message.number);
    const status = remoteMessageStatus(message.status ?? message.messageStatus);
    if (!phone || !status) continue;
    const values = byPhone.get(phone) ?? [];
    values.push({
      id: stringValue(message.messageid) ?? stringValue(message.messageId) ?? stringValue(message.id),
      status,
      occurredAt: messageTimestamp(
        message.messageTimestamp ?? message.timestamp ?? message.created_at ?? message.updated_at,
      ),
      chatId: stringValue(message.chatid) ?? stringValue(message.chatId),
    });
    byPhone.set(phone, values);
  }
  for (const recipient of campaign.recipients) {
    if (!recipient.phoneNormalized) continue;
    const matched = byPhone.get(recipient.phoneNormalized);
    if (!matched?.length) continue;
    let next = recipient.status as WhatsAppRecipientStatus;
    let transitionAt: Date | null = null;
    for (const message of matched) {
      const advanced = advanceRecipientStatus(next, message.status);
      if (advanced !== next) {
        next = advanced;
        transitionAt = message.occurredAt;
      }
    }
    const matchedMessageIds = matched.map(({ id }) => id).filter((id): id is string => id !== null);
    const field = statusDateField(next);
    if (next !== recipient.status) {
      await prisma.whatsAppRecipient.updateMany({
        where: { id: recipient.id, status: { in: lowerRecipientStates[next] } },
        data: {
          status: next,
          ...(field !== null && recipient[field] === null ? { [field]: transitionAt ?? new Date() } : {}),
        },
      });
    }
    const chatId = matched.find(({ chatId: value }) => value)?.chatId ?? null;
    await prisma.$executeRawUnsafe(`
      UPDATE "whatsapp_recipients"
      SET
        "external_message_ids" = ARRAY(
          SELECT "message_id"
          FROM unnest("external_message_ids" || $1::TEXT[])
            WITH ORDINALITY AS "combined"("message_id", "position")
          GROUP BY "message_id"
          ORDER BY MIN("position")
        ),
        "external_chat_id" = COALESCE($2::TEXT, "external_chat_id"),
        "updated_at" = NOW()
      WHERE "id" = $3 AND "tenant_id" = $4
    `, matchedMessageIds, chatId, recipient.id, getTenantId());
  }
  const fresh = await prisma.whatsAppRecipient.findMany({ where: { campaignId } });
  const hasSent = fresh.some(({ status }) => sentOrBeyond.has(status));
  const incomingStatus = campaignStatusFromRemote(folder?.status ?? null, hasSent);
  if (folder?.status !== undefined) {
    await prisma.whatsAppCampaign.updateMany({
      where: {
        id: campaignId, status: campaign.status, remoteFolderId: campaign.remoteFolderId,
        remoteFolderStatus: campaign.remoteFolderStatus,
      },
      data: { remoteFolderStatus: advanceRemoteFolderStatus(campaign.remoteFolderStatus, folder.status) },
    });
  }
  return refreshCampaignMetrics(campaignId, incomingStatus, {
    status: campaign.status as WhatsAppCampaignStatus,
    remoteFolderId: campaign.remoteFolderId,
  });
}

export async function syncCampaign(campaignId: string, folders?: unknown[]) {
  return withAdvisoryLock(
    campaignOperationLock(campaignId),
    () => syncCampaignUnlocked(campaignId, folders),
  );
}

export async function syncActiveCampaigns() {
  const campaigns = await prisma.whatsAppCampaign.findMany({
    where: { status: { in: ['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED', 'CANCELING'] }, remoteFolderId: { not: null } },
    orderBy: { id: 'asc' },
  });
  const client = campaigns.length === 0 ? null : await getConfiguredUazapiClient();
  const folders = client === null ? [] : await client.listFolders();
  for (const campaign of campaigns) await syncCampaign(campaign.id, folders);
  return { synced: campaigns.length, campaignIds: campaigns.map(({ id }) => id) };
}

const allowedControlStates = {
  stop: ['SCHEDULED', 'QUEUED', 'SENDING'],
  continue: ['PAUSED'],
  delete: ['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'],
} as const;

async function editRemoteFolder(campaignId: string, action: 'stop' | 'continue' | 'delete') {
  const campaign = await requireCampaign(campaignId);
  if (!allowedControlStates[action].includes(campaign.status as never)) {
    if (['COMPLETED', 'CANCELING', 'CANCELED', 'FAILED'].includes(campaign.status)) {
      throw new CampaignConflictError('Campaign is terminal.');
    }
    throw new CampaignConflictError(`Campaign cannot ${action} from its current state.`);
  }
  if (['COMPLETED', 'CANCELING', 'CANCELED', 'FAILED'].includes(campaign.status)) {
    throw new CampaignConflictError('Campaign is terminal.');
  }
  if (!campaign.remoteFolderId) throw new CampaignConflictError('Campaign has no remote folder.');
  const client = await getConfiguredUazapiClient();
  const remote = folderRecord(await client.editFolder({ folder_id: campaign.remoteFolderId, action }));
  return { campaign, remote };
}

async function consolidateControl(
  campaign: Awaited<ReturnType<typeof requireCampaign>>,
  status: WhatsAppCampaignStatus,
  remoteStatus: string | null,
  data: Record<string, unknown>,
) {
  const changed = await prisma.whatsAppCampaign.updateMany({
    where: {
      id: campaign.id, status: campaign.status, remoteFolderId: campaign.remoteFolderId,
    },
    data: {
      status,
      remoteFolderStatus: remoteStatus ?? campaign.remoteFolderStatus,
      ...data,
    },
  });
  if (changed.count === 0) return syncCampaignUnlocked(campaign.id);
  return prisma.whatsAppCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
}

export async function pauseCampaign(campaignId: string) {
  return withAdvisoryLock(campaignOperationLock(campaignId), async () => {
    const { campaign, remote } = await editRemoteFolder(campaignId, 'stop');
    const status = campaignStatusFromRemote(remote.status, false) ?? 'PAUSED';
    return consolidateControl(campaign, status === 'PAUSED' ? status : 'PAUSED', remote.status, {
      pausedAt: new Date(),
    });
  });
}

export async function resumeCampaign(campaignId: string) {
  return withAdvisoryLock(campaignOperationLock(campaignId), async () => {
    const { campaign, remote } = await editRemoteFolder(campaignId, 'continue');
    const status = campaignStatusFromRemote(remote.status, false) ?? 'SENDING';
    return consolidateControl(campaign, status, remote.status, { pausedAt: null });
  });
}

export async function cancelCampaign(campaignId: string) {
  return withAdvisoryLock(campaignOperationLock(campaignId), async () => {
    const { campaign, remote } = await editRemoteFolder(campaignId, 'delete');
    return consolidateControl(campaign, 'CANCELING', remote.status ?? 'deleting', {});
  });
}

async function assertUnstarted(campaign: Awaited<ReturnType<typeof requireCampaign>>) {
  if (['COMPLETED', 'CANCELING', 'CANCELED', 'FAILED'].includes(campaign.status)) {
    throw new CampaignConflictError('Campaign is terminal.');
  }
  if (campaign.recipients.some(({ status }) => sentOrBeyond.has(status))) {
    throw new CampaignConflictError('Campaign has already started.');
  }
}

async function replaceCampaignFolder(
  campaign: Awaited<ReturnType<typeof requireCampaign>>,
  options: {
    name: string;
    content: WhatsAppCampaignContent;
    scheduledAt: Date;
    campaignData: Record<string, unknown>;
  },
) {
  const client = await getConfiguredUazapiClient();
  const oldFolderId = campaign.remoteFolderId;
  if (oldFolderId) await client.editFolder({ folder_id: oldFolderId, action: 'stop' });
  const resumeOld = async () => {
    if (!oldFolderId) return;
    try { await client.editFolder({ folder_id: oldFolderId, action: 'continue' }); } catch { /* best effort */ }
  };
  const recipients = campaign.recipients.filter(({ isValid, status, phoneNormalized }) =>
    isValid && phoneNormalized !== null && ['PENDING', 'QUEUED'].includes(status));
  let personalized: Array<{ recipient: (typeof recipients)[number]; content: WhatsAppCampaignContent }>;
  let folder: ReturnType<typeof remoteFolder>;
  try {
    const mediaUrl = await mediaUrlFactory(options.content);
    personalized = recipients.map((recipient) => ({
      recipient,
      content: personalizeContent(options.content, { name: recipient.personName }),
    }));
    const response = await client.sendAdvanced({
      delayMin: config.whatsappDelayMin,
      delayMax: config.whatsappDelayMax,
      info: options.name,
      scheduled_for: options.scheduledAt.getTime(),
      messages: personalized.flatMap(({ recipient, content }) =>
        allItems(content).map((item) => buildUazapiMessage(item, {
          number: recipient.phoneNormalized!, mediaUrl,
        }))),
    });
    folder = remoteFolder(response);
  } catch (error) {
    await resumeOld();
    throw error;
  }
  const queuedAt = new Date();
  const replacementStatus = campaignStatusFromRemote(folder.status, false)
    ?? (options.scheduledAt.getTime() > Date.now() ? 'SCHEDULED' : 'QUEUED');
  try {
    await prisma.$transaction(async (tx) => {
      const consolidated = await tx.whatsAppCampaign.updateMany({
        where: {
          id: campaign.id, tenantId: getTenantId(), status: campaign.status,
          remoteFolderId: campaign.remoteFolderId,
        },
        data: {
          ...options.campaignData,
          status: replacementStatus,
          remoteFolderId: folder.id,
          remoteFolderStatus: folder.status,
          remoteFolderCreatedAt: folder.createdAt,
          queuedAt,
        },
      });
      if (consolidated.count !== 1) throw new Error('Campaign replacement CAS missed.');
      for (const { recipient, content } of personalized) {
        await tx.whatsAppRecipient.updateMany({
          where: {
            id: recipient.id, tenantId: getTenantId(), campaignId: campaign.id,
            status: { in: ['PENDING', 'QUEUED'] },
          },
          data: {
            status: 'QUEUED', queuedAt, error: null, failedAt: null,
            personalizedContent: content as any,
            externalMessageIds: [],
          },
        });
      }
    });
  } catch {
    try { await client.editFolder({ folder_id: folder.id, action: 'delete' }); } catch { /* best effort */ }
    await resumeOld();
    throw new CampaignStateIndeterminateError();
  }
  if (oldFolderId) {
    try { await client.editFolder({ folder_id: oldFolderId, action: 'delete' }); } catch { /* best effort */ }
  }
  return prisma.whatsAppCampaign.findUniqueOrThrow({
    where: { id: campaign.id },
  });
}

export async function rescheduleCampaign(campaignId: string, scheduledAtValue: string) {
  return withAdvisoryLock(campaignOperationLock(campaignId), async () => {
    const campaign = await requireCampaign(campaignId);
    await assertUnstarted(campaign);
    const scheduledAt = new Date(scheduledAtValue);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new CampaignValidationError('Scheduled time must be in the future.');
    }
    return replaceCampaignFolder(campaign, {
      name: campaign.name,
      content: campaign.content as unknown as WhatsAppCampaignContent,
      scheduledAt,
      campaignData: { scheduledAt },
    });
  });
}

export async function editUnstartedCampaign(
  campaignId: string,
  input: { name?: string; content?: WhatsAppCampaignContent },
) {
  return withAdvisoryLock(campaignOperationLock(campaignId), async () => {
    const campaign = await requireCampaign(campaignId);
    await assertUnstarted(campaign);
    const name = input.name ?? campaign.name;
    const content = campaignContent({ category: campaign.category, content: input.content ?? campaign.content as unknown as WhatsAppCampaignContent });
    const scheduledAt = campaign.scheduledAt ?? new Date();
    return replaceCampaignFolder(campaign, {
      name, content, scheduledAt,
      campaignData: { name, content: content as any },
    });
  });
}

const suppressionReconciliationError = () => new CampaignSuppressionReconciliationError();

async function recordSuppressionReconciliationFailure(campaignId: string) {
  await prisma.whatsAppCampaign.updateMany({
    where: { id: campaignId, status: { in: ['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'] } },
    data: { lastError: suppressionReconciliationError().message },
  });
}

export async function reconcileSuppressedPhone(phoneNormalized: string, occurredAt = new Date()) {
  const affected = await prisma.whatsAppCampaign.findMany({
    where: {
      status: { in: ['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'] },
      recipients: {
        some: { phoneNormalized, status: { in: ['PENDING', 'QUEUED'] } },
      },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const reconciledCampaignIds: string[] = [];

  for (const { id: campaignId } of affected) {
    await withAdvisoryLock(campaignOperationLock(campaignId), async () => {
      const campaign = await prisma.whatsAppCampaign.findFirst({
        where: {
          id: campaignId,
          status: { in: ['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'] },
        },
        include: { recipients: true },
      });
      if (campaign === null) return;
      const target = campaign.recipients.filter(({ phoneNormalized: phone, status }) =>
        phone === phoneNormalized && ['PENDING', 'QUEUED'].includes(status));
      if (target.length === 0) return;
      reconciledCampaignIds.push(campaign.id);
      if (!campaign.remoteFolderId) {
        await prisma.whatsAppRecipient.updateMany({
          where: {
            tenantId: getTenantId(), campaignId: campaign.id, phoneNormalized,
            status: { in: ['PENDING', 'QUEUED'] },
          },
          data: { status: 'CANCELED', canceledAt: occurredAt },
        });
        await refreshCampaignMetrics(campaign.id);
        return;
      }

      const client = await getConfiguredUazapiClient();
      const oldFolderId = campaign.remoteFolderId;
      try {
        await client.editFolder({ folder_id: oldFolderId, action: 'stop' });
      } catch {
        await recordSuppressionReconciliationFailure(campaign.id);
        throw suppressionReconciliationError();
      }

      const pending = campaign.recipients.filter(({ isValid, status, phoneNormalized: phone }) =>
        isValid && phone !== null && ['PENDING', 'QUEUED'].includes(status));
      const activeSuppressions = pending.length === 0 ? [] : await prisma.whatsAppSuppression.findMany({
        where: {
          active: true,
          phoneNormalized: { in: [...new Set(pending.map(({ phoneNormalized: phone }) => phone!))] },
        },
        select: { phoneNormalized: true },
      });
      const suppressedPhones = new Set(activeSuppressions.map(({ phoneNormalized: phone }) => phone));
      const remaining = pending.filter(({ phoneNormalized: phone }) => !suppressedPhones.has(phone!));
      const removed = pending.filter(({ phoneNormalized: phone }) => suppressedPhones.has(phone!));

      if (remaining.length === 0) {
        try {
          await client.editFolder({ folder_id: oldFolderId, action: 'delete' });
          await prisma.$transaction(async (tx) => {
            await tx.whatsAppRecipient.updateMany({
              where: {
                tenantId: getTenantId(), campaignId: campaign.id,
                id: { in: removed.map(({ id }) => id) }, status: { in: ['PENDING', 'QUEUED'] },
              },
              data: { status: 'CANCELED', canceledAt: occurredAt },
            });
            const consolidated = await tx.whatsAppCampaign.updateMany({
              where: {
                id: campaign.id, tenantId: getTenantId(), status: campaign.status,
                remoteFolderId: oldFolderId,
              },
              data: {
                status: 'CANCELING',
                remoteFolderStatus: 'deleting',
                lastError: null,
              },
            });
            if (consolidated.count !== 1) throw new Error('Suppression terminalization CAS missed.');
          });
        } catch {
          await recordSuppressionReconciliationFailure(campaign.id);
          throw suppressionReconciliationError();
        }
        await refreshCampaignMetrics(campaign.id);
        return;
      }

      let replacement: ReturnType<typeof remoteFolder> | null = null;
      try {
        const mediaUrl = await mediaUrlFactory(campaign.content as unknown as WhatsAppCampaignContent);
        replacement = remoteFolder(await client.sendAdvanced({
          delayMin: config.whatsappDelayMin,
          delayMax: config.whatsappDelayMax,
          info: `${campaign.name} (suppression rebuild)`,
          scheduled_for: campaign.scheduledAt?.getTime() ?? Date.now(),
          messages: remaining.flatMap((recipient) =>
            allItems(recipient.personalizedContent as unknown as WhatsAppCampaignContent).map((item) =>
              buildUazapiMessage(item, { number: recipient.phoneNormalized!, mediaUrl }))),
        }));
        let replacementStatus = campaignStatusFromRemote(replacement.status, false) ?? 'SCHEDULED';
        if (campaign.status === 'PAUSED') {
          const paused = folderRecord(await client.editFolder({ folder_id: replacement.id, action: 'stop' }));
          replacement = { ...replacement, status: paused.status ?? 'paused' };
          replacementStatus = 'PAUSED';
        }
        const queuedAt = new Date();
        await prisma.$transaction(async (tx) => {
          const consolidated = await tx.whatsAppCampaign.updateMany({
            where: {
              id: campaign.id, tenantId: getTenantId(), status: campaign.status,
              remoteFolderId: oldFolderId,
            },
            data: {
              status: replacementStatus,
              remoteFolderId: replacement!.id,
              remoteFolderStatus: replacement!.status,
              remoteFolderCreatedAt: replacement!.createdAt,
              lastError: null,
            },
          });
          if (consolidated.count !== 1) throw new Error('Suppression replacement CAS missed.');
          await tx.whatsAppRecipient.updateMany({
            where: {
              tenantId: getTenantId(), campaignId: campaign.id,
              id: { in: removed.map(({ id }) => id) }, status: { in: ['PENDING', 'QUEUED'] },
            },
            data: { status: 'CANCELED', canceledAt: occurredAt },
          });
          await tx.whatsAppRecipient.updateMany({
            where: {
              tenantId: getTenantId(), campaignId: campaign.id,
              id: { in: remaining.map(({ id }) => id) }, status: { in: ['PENDING', 'QUEUED'] },
            },
            data: {
              status: 'QUEUED', queuedAt, externalMessageIds: [], processedWebhookEventIds: [],
              externalChatId: null, error: null, failedAt: null,
            },
          });
        });
      } catch {
        if (replacement !== null) {
          try { await client.editFolder({ folder_id: replacement.id, action: 'delete' }); } catch { /* best effort */ }
        }
        await recordSuppressionReconciliationFailure(campaign.id);
        throw suppressionReconciliationError();
      }
      try { await client.editFolder({ folder_id: oldFolderId, action: 'delete' }); } catch { /* best effort */ }
      await refreshCampaignMetrics(campaign.id);
    });
  }

  return { reconciledCampaignIds };
}

export async function retryFailedRecipients(
  campaignId: string,
  coordinatorId: string,
  idempotencyKey?: string,
) {
  const campaign = await requireCampaign(campaignId);
  const failed = campaign.recipients.filter(({ status, isValid }) => status === 'FAILED' && isValid);
  if (failed.length === 0) throw new CampaignConflictError('Campaign has no failed recipients.');
  const name = `${campaign.name} (retry)`;
  const tenantId = getTenantId();
  const commandLock = idempotencyKey === undefined
    ? []
    : [`whatsapp:command:${tenantId}:${idempotencyKey}`];

  return withAdvisoryLocks([
    ...commandLock,
    `whatsapp:retry-parent:${tenantId}:${campaign.id}`,
  ], async () => {
    const existing = await prisma.whatsAppCampaign.findFirst({
      where: { retryOfCampaignId: campaign.id },
    });
    if (existing !== null) return existing;

    if (idempotencyKey !== undefined) {
      const command = await prisma.whatsAppCampaign.findFirst({ where: { idempotencyKey } });
      if (command !== null) {
        throw new CampaignConflictError('Idempotency-Key is already used by another campaign.');
      }
    }

    // Preflight only after idempotency reconciliation, but before an audit
    // exists, so a replay still works if configuration later changes.
    const client = await getConfiguredUazapiClient();
    const content = campaign.content as unknown as WhatsAppCampaignContent;
    const mediaUrl = await mediaUrlFactory(content, true);
    if (campaign.remoteFolderId !== null && campaign.remoteFolderStatus === 'deleting') {
      await client.editFolder({ folder_id: campaign.remoteFolderId, action: 'stop' });
      await client.editFolder({ folder_id: campaign.remoteFolderId, action: 'delete' });
    }
    const phones = failed.map(({ phoneNormalized }) => phoneNormalized!).filter(Boolean);
    return withAdvisoryLocks(phones.map(
      (phone) => `whatsapp:recipient:${tenantId}:${phone}`,
    ), async () => {
      const retry = await prisma.$transaction(async (tx) => {
        const audit = await tx.whatsAppCampaign.create({
          data: {
            tenantId, createdById: coordinatorId, name,
            status: 'DRAFT', category: campaign.category,
            audienceFilter: { type: 'RETRY', retryOfCampaignId: campaign.id },
            content: campaign.content as any,
            consentAt: campaign.consentAt,
            totalRecipients: failed.length,
            validRecipients: failed.length,
            retryOfCampaignId: campaign.id,
            idempotencyKey,
          },
        });
        await tx.whatsAppRecipient.createMany({
          data: failed.map((recipient) => ({
            tenantId, campaignId: audit.id,
            origin: recipient.origin, sourceId: recipient.sourceId, sourceName: recipient.sourceName,
            personName: recipient.personName, phoneOriginal: recipient.phoneOriginal,
            phoneNormalized: recipient.phoneNormalized,
            personalizedContent: recipient.personalizedContent as any,
            isValid: true, status: 'PENDING' as const,
          })),
        });
        return audit;
      });

      const failAudit = async (
        message: string,
        dispatchCount: number,
        folder?: ReturnType<typeof remoteFolder>,
      ) => {
        const failedAt = new Date();
        await prisma.$transaction([
          prisma.whatsAppRecipient.updateMany({
            where: { campaignId: retry.id, status: { in: ['PENDING', 'QUEUED'] } },
            data: { status: 'FAILED', error: message, failedAt },
          }),
          prisma.whatsAppCampaign.update({
            where: { id: retry.id },
            data: {
              status: 'FAILED', failedCount: dispatchCount, lastError: message, failedAt,
              ...(folder === undefined ? {} : {
                remoteFolderId: folder.id,
                remoteFolderStatus: 'deleting',
                remoteFolderCreatedAt: folder.createdAt,
              }),
            },
          }),
        ]);
      };

      const suppressions = await prisma.whatsAppSuppression.findMany({
        where: { active: true, phoneNormalized: { in: phones } },
        select: { phoneNormalized: true },
      });
      const suppressed = new Set(suppressions.map(({ phoneNormalized }) => phoneNormalized));
      const dispatch = failed.filter(({ phoneNormalized }) => !suppressed.has(phoneNormalized!));
      if (suppressed.size > 0) {
        await prisma.whatsAppRecipient.updateMany({
          where: {
            campaignId: retry.id, phoneNormalized: { in: [...suppressed] }, status: 'PENDING',
          },
          data: { status: 'CANCELED', canceledAt: new Date() },
        });
      }
      if (dispatch.length === 0) {
        return prisma.whatsAppCampaign.update({
          where: { id: retry.id }, data: { status: 'CANCELED', canceledAt: new Date() },
        });
      }

      let response: Record<string, unknown>;
      try {
        response = await client.sendAdvanced({
          delayMin: config.whatsappDelayMin,
          delayMax: config.whatsappDelayMax,
          info: name,
          scheduled_for: Date.now(),
          messages: dispatch.flatMap((recipient) =>
            allItems(recipient.personalizedContent as unknown as WhatsAppCampaignContent).map((item) =>
              buildUazapiMessage(item, { number: recipient.phoneNormalized!, mediaUrl }))),
        });
      } catch (error) {
        const message = safeRemoteError(error);
        await failAudit(message, dispatch.length);
        throw new CampaignDispatchError(message);
      }

      let folder: ReturnType<typeof remoteFolder> | undefined;
      try {
        folder = remoteFolder(response);
        const queuedAt = new Date();
        await prisma.$transaction([
          prisma.whatsAppRecipient.updateMany({
            where: {
              campaignId: retry.id,
              phoneNormalized: { in: dispatch.map(({ phoneNormalized }) => phoneNormalized!) },
              status: 'PENDING',
            },
            data: { status: 'QUEUED', queuedAt },
          }),
          prisma.whatsAppCampaign.update({
            where: { id: retry.id },
            data: {
              status: 'QUEUED', remoteFolderId: folder.id,
              remoteFolderStatus: folder.status, remoteFolderCreatedAt: folder.createdAt,
              queuedCount: dispatch.length, queuedAt,
            },
          }),
        ]);
        return prisma.whatsAppCampaign.findUniqueOrThrow({ where: { id: retry.id } });
      } catch {
        if (folder !== undefined) {
          try { await client.editFolder({ folder_id: folder.id, action: 'stop' }); } catch { /* best effort */ }
          try { await client.editFolder({ folder_id: folder.id, action: 'delete' }); } catch { /* best effort */ }
        }
        const indeterminate = new CampaignStateIndeterminateError();
        await failAudit(indeterminate.message, dispatch.length, folder);
        throw indeterminate;
      }
    });
  });
}

async function persistAudit(
  input: CreateCampaignInput & { coordinatorId: string; idempotencyKey?: string },
  content: WhatsAppCampaignContent,
  preview: AudiencePreview,
  consentAt: Date,
  scheduledAt: Date | null,
) {
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.whatsAppCampaign.create({
      data: {
        tenantId: getTenantId(),
        createdById: input.coordinatorId,
        name: input.name,
        status: scheduledAt === null ? 'DRAFT' : 'SCHEDULED',
        category: input.category,
        audienceFilter: input.audienceFilter as any,
        content: content as any,
        consentAt,
        scheduledAt,
        idempotencyKey: input.idempotencyKey,
        totalRecipients: preview.totals.source,
        validRecipients: preview.totals.valid,
        excludedRecipients: preview.totals.source - preview.totals.valid,
      },
    });
    if (preview.recipients.length > 0) {
      await tx.whatsAppRecipient.createMany({
        data: preview.recipients.map((recipient) => ({
          tenantId: getTenantId(),
          campaignId: campaign.id,
          origin: recipient.origin,
          sourceId: recipient.sourceId,
          sourceName: recipient.sourceName,
          personName: recipient.personName,
          phoneOriginal: recipient.phoneOriginal,
          phoneNormalized: recipient.phoneNormalized,
          personalizedContent: recipient.personalizedContent as any,
          isValid: recipient.isValid,
          exclusionReason: recipient.exclusionReason,
          status: 'PENDING' as const,
        })),
      });
    }
    return campaign;
  });
}

type InternalCreateCampaignInput = CreateCampaignInput & {
  coordinatorId: string;
  idempotencyKey?: string;
};

async function createCampaignOnce(
  input: CreateCampaignInput,
  coordinatorId: string,
  idempotencyKey?: string,
) {
  if (input.consentimentoConfirmado !== true) throw new Error('Explicit consent is required.');
  const consentAt = new Date();
  const scheduledAt = input.scheduledAt === undefined ? null : new Date(input.scheduledAt);
  if (
    scheduledAt !== null
    && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= consentAt.getTime())
  ) {
    throw new CampaignValidationError('Scheduled time must be in the future.');
  }
  const content = campaignContent(input);
  const preview = await previewAudience(input.audienceFilter, content);
  const validRecipients = preview.recipients.filter(
    (recipient): recipient is typeof recipient & { phoneNormalized: string } => recipient.isValid,
  );
  if (validRecipients.length === 0) {
    throw new CampaignValidationError('Campaign requires at least one valid recipient.');
  }

  const tenantId = getTenantId();
  return withAdvisoryLocks(validRecipients.map(
    ({ phoneNormalized }) => `whatsapp:recipient:${tenantId}:${phoneNormalized}`,
  ), async () => {
    const client = await getConfiguredUazapiClient();
    const mediaUrl = await mediaUrlFactory(content);
    const internalInput: InternalCreateCampaignInput = { ...input, coordinatorId, idempotencyKey };
    const audit = await persistAudit(internalInput, content, preview, consentAt, scheduledAt);
    const scheduledFor = scheduledAt?.getTime() ?? consentAt.getTime();

    // The preview is advisory. Re-read suppression state after the frozen audit
    // exists and immediately before creating the remote folder.
    const suppressions = await prisma.whatsAppSuppression.findMany({
      where: {
        active: true,
        phoneNormalized: { in: validRecipients.map(({ phoneNormalized }) => phoneNormalized) },
      },
      select: { phoneNormalized: true },
    });
    const suppressed = new Set(suppressions.map(({ phoneNormalized }) => phoneNormalized));
    const dispatchRecipients = validRecipients.filter(
      ({ phoneNormalized }) => !suppressed.has(phoneNormalized),
    );
    if (suppressed.size > 0) {
      await prisma.whatsAppRecipient.updateMany({
        where: {
          campaignId: audit.id,
          isValid: true,
          phoneNormalized: { in: [...suppressed] },
          status: 'PENDING',
        },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
    }
    if (dispatchRecipients.length === 0) {
      return prisma.whatsAppCampaign.update({
        where: { id: audit.id },
        data: { status: 'CANCELED', canceledAt: new Date(), queuedCount: 0 },
      });
    }

    let response: Record<string, unknown>;
    try {
      response = await client.sendAdvanced({
      delayMin: config.whatsappDelayMin,
      delayMax: config.whatsappDelayMax,
      info: input.name,
      scheduled_for: scheduledFor,
      messages: dispatchRecipients.flatMap((recipient) =>
        allItems(recipient.personalizedContent).map((item) => buildUazapiMessage(item, {
          number: recipient.phoneNormalized,
          mediaUrl,
        }))),
      });
    } catch (error) {
      const message = safeRemoteError(error);
      const failedAt = new Date();
      await prisma.$transaction([
        prisma.whatsAppRecipient.updateMany({
          where: {
            campaignId: audit.id,
            isValid: true,
            phoneNormalized: { in: dispatchRecipients.map(({ phoneNormalized }) => phoneNormalized) },
            status: 'PENDING',
          },
          data: { status: 'FAILED', error: message, failedAt },
        }),
        prisma.whatsAppCampaign.update({
          where: { id: audit.id },
          data: {
            status: 'FAILED', lastError: message, failedCount: dispatchRecipients.length, failedAt,
          },
        }),
      ]);
      throw new CampaignDispatchError(message);
    }

    let folder: ReturnType<typeof remoteFolder> | undefined;
    try {
      folder = remoteFolder(response);
      const queuedAt = new Date();
      await prisma.$transaction([
        prisma.whatsAppRecipient.updateMany({
          where: {
            campaignId: audit.id,
            isValid: true,
            phoneNormalized: { in: dispatchRecipients.map(({ phoneNormalized }) => phoneNormalized) },
            status: 'PENDING',
          },
          data: { status: 'QUEUED', queuedAt },
        }),
        prisma.whatsAppCampaign.update({
          where: { id: audit.id },
          data: {
            status: scheduledAt === null ? 'QUEUED' : 'SCHEDULED',
            remoteFolderId: folder.id,
            remoteFolderStatus: folder.status,
            remoteFolderCreatedAt: folder.createdAt,
            queuedCount: dispatchRecipients.length,
            queuedAt,
          },
        }),
      ]);
      return await prisma.whatsAppCampaign.findUniqueOrThrow({ where: { id: audit.id } });
    } catch {
      const indeterminate = new CampaignStateIndeterminateError();
      let remoteStatus = folder?.status ?? null;
      if (folder !== undefined) {
        try {
          const stopped = folderRecord(await client.editFolder({ folder_id: folder.id, action: 'stop' }));
          remoteStatus = stopped.status ?? remoteStatus;
        } catch { /* best effort */ }
        try {
          const deleted = folderRecord(await client.editFolder({ folder_id: folder.id, action: 'delete' }));
          remoteStatus = deleted.status ?? 'deleting';
        } catch { /* best effort */ }
      }
      const failedAt = new Date();
      try {
        await prisma.$transaction([
          prisma.whatsAppRecipient.updateMany({
            where: {
              campaignId: audit.id,
              isValid: true,
              phoneNormalized: { in: dispatchRecipients.map(({ phoneNormalized }) => phoneNormalized) },
              status: { in: ['PENDING', 'QUEUED'] },
            },
            data: { status: 'FAILED', error: indeterminate.message, failedAt },
          }),
          prisma.whatsAppCampaign.update({
            where: { id: audit.id },
            data: {
              status: 'FAILED', lastError: indeterminate.message,
              failedCount: dispatchRecipients.length, failedAt,
              ...(folder === undefined ? {} : {
                remoteFolderId: folder.id,
                remoteFolderStatus: remoteStatus,
                remoteFolderCreatedAt: folder.createdAt,
              }),
            },
          }),
        ]);
      } catch { /* preserve the original indeterminate state error */ }
      throw indeterminate;
    }
  });
}

export async function createCampaign(
  input: CreateCampaignInput,
  coordinatorId: string,
  idempotencyKey?: string,
) {
  if (idempotencyKey === undefined) return createCampaignOnce(input, coordinatorId);
  const tenantId = getTenantId();
  return withAdvisoryLock(`whatsapp:command:${tenantId}:${idempotencyKey}`, async () => {
    const existing = await prisma.whatsAppCampaign.findFirst({ where: { idempotencyKey } });
    if (existing !== null) {
      if (existing.status === 'FAILED' && existing.queuedAt === null) {
        if (existing.lastError === new CampaignStateIndeterminateError().message) {
          throw new CampaignStateIndeterminateError();
        }
        throw new CampaignDispatchError(existing.lastError ?? 'Unable to queue WhatsApp campaign.');
      }
      return existing;
    }
    return createCampaignOnce(input, coordinatorId, idempotencyKey);
  });
}

export async function sendTestCampaign(input: TestCampaignInput) {
  const phone = normalizeBrazilianPhone(input.phone);
  if (!phone.valid) throw new Error('Invalid Brazilian phone.');
  const client = await getConfiguredUazapiClient();
  const content = campaignContent(input);
  const mediaUrl = await mediaUrlFactory(content);
  const personalized = personalizeContent(content, { name: input.name });
  return client.sendAdvanced({
    delayMin: config.whatsappDelayMin,
    delayMax: config.whatsappDelayMax,
    info: 'Envio de teste',
    scheduled_for: Date.now(),
    messages: allItems(personalized).map((item) => buildUazapiMessage(item, {
      number: phone.normalized,
      mediaUrl,
    })),
  });
}
