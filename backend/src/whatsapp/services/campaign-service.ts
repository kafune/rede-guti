import { config } from '../../config.js';
import { prisma } from '../../db.js';
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

const configurationError = () => new Error('WhatsApp integration is not configured.');

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

async function mediaUrlFactory(content: WhatsAppCampaignContent) {
  if (!config.publicApiUrl) throw configurationError();
  const ids = mediaIds(content);
  const stored = ids.length === 0 ? [] : await prisma.whatsAppMedia.findMany({
    where: { id: { in: ids } },
    select: { id: true, publicToken: true },
  });
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
  return prisma.whatsAppCampaign.update({
    where: { id: campaignId },
    data: {
      status: merged.status,
      queuedCount: merged.queued,
      sentCount: merged.sent,
      failedCount: merged.failed,
      deliveredCount: merged.delivered,
      readCount: merged.read,
      playedCount: merged.played,
      replyCount: merged.replies,
      optOutCount: merged.optOuts,
      ...(merged.status === 'SENDING' && campaign.startedAt === null ? { startedAt: now } : {}),
      ...(merged.status === 'COMPLETED' && campaign.completedAt === null ? { completedAt: now } : {}),
    },
  });
}

function campaignStatusFromRemote(status: string | null, hasSent: boolean): WhatsAppCampaignStatus | undefined {
  const normalized = status?.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) return hasSent ? 'SENDING' : undefined;
  if (['completed', 'complete', 'archived', 'finished'].includes(normalized)) return 'COMPLETED';
  if (['canceled', 'cancelled', 'deleted'].includes(normalized)) return 'CANCELED';
  if (['failed', 'error'].includes(normalized)) return 'FAILED';
  if (['paused', 'stopped'].includes(normalized)) return 'PAUSED';
  if (['active', 'sending', 'running'].includes(normalized)) return hasSent ? 'SENDING' : 'QUEUED';
  if (['scheduled', 'queued', 'pending'].includes(normalized)) return 'SCHEDULED';
  return hasSent ? 'SENDING' : undefined;
}

function advanceRemoteFolderStatus(current: string | null, incoming: string | null) {
  if (incoming === null) return current;
  if (current === null) return incoming;
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const terminal = new Set(['completed', 'complete', 'archived', 'finished', 'failed', 'error', 'canceled', 'cancelled', 'deleted']);
  const currentNormalized = normalize(current);
  const incomingNormalized = normalize(incoming);
  if (terminal.has(currentNormalized)) return current;
  if (terminal.has(incomingNormalized)) return incoming;
  const rank = (value: string) => ['scheduled', 'queued', 'pending'].includes(value) ? 0 : 1;
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

export async function syncCampaign(campaignId: string, folders?: unknown[]) {
  const campaign = await requireCampaign(campaignId);
  if (!campaign.remoteFolderId) return refreshCampaignMetrics(campaign.id);
  const client = await getConfiguredUazapiClient();
  const remoteFolders = folders ?? await client.listFolders();
  const folder = responseItems(remoteFolders, ['folders', 'data', 'items'])
    .map(folderRecord)
    .find(({ id }) => id === campaign.remoteFolderId);
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
      occurredAt: messageTimestamp(message.timestamp ?? message.created_at ?? message.updated_at),
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
    const externalMessageIds = [...new Set([
      ...recipient.externalMessageIds,
      ...matched.map(({ id }) => id).filter((id): id is string => id !== null),
    ])];
    const field = statusDateField(next);
    await prisma.whatsAppRecipient.update({
      where: { id: recipient.id },
      data: {
        status: next,
        externalMessageIds,
        externalChatId: matched.find(({ chatId }) => chatId)?.chatId ?? recipient.externalChatId,
        ...(field !== null && recipient[field] === null ? { [field]: transitionAt ?? new Date() } : {}),
      },
    });
  }
  const fresh = await prisma.whatsAppRecipient.findMany({ where: { campaignId } });
  const hasSent = fresh.some(({ status }) => sentOrBeyond.has(status));
  const incomingStatus = campaignStatusFromRemote(folder?.status ?? null, hasSent);
  if (folder?.status !== undefined) {
    await prisma.whatsAppCampaign.update({
      where: { id: campaignId },
      data: { remoteFolderStatus: advanceRemoteFolderStatus(campaign.remoteFolderStatus, folder.status) },
    });
  }
  return refreshCampaignMetrics(campaignId, incomingStatus);
}

export async function syncActiveCampaigns() {
  const campaigns = await prisma.whatsAppCampaign.findMany({
    where: { status: { in: ['SCHEDULED', 'QUEUED', 'SENDING', 'PAUSED'] }, remoteFolderId: { not: null } },
    orderBy: { id: 'asc' },
  });
  const client = campaigns.length === 0 ? null : await getConfiguredUazapiClient();
  const folders = client === null ? [] : await client.listFolders();
  for (const campaign of campaigns) await syncCampaign(campaign.id, folders);
  return { synced: campaigns.length, campaignIds: campaigns.map(({ id }) => id) };
}

async function editRemoteFolder(campaignId: string, action: 'stop' | 'continue' | 'delete') {
  const campaign = await requireCampaign(campaignId);
  if (['COMPLETED', 'CANCELED', 'FAILED'].includes(campaign.status)) {
    throw new CampaignConflictError('Campaign is terminal.');
  }
  if (!campaign.remoteFolderId) throw new CampaignConflictError('Campaign has no remote folder.');
  const client = await getConfiguredUazapiClient();
  await client.editFolder({ folder_id: campaign.remoteFolderId, action });
  return campaign;
}

export async function pauseCampaign(campaignId: string) {
  await editRemoteFolder(campaignId, 'stop');
  return prisma.whatsAppCampaign.update({
    where: { id: campaignId }, data: { status: 'PAUSED', pausedAt: new Date() },
  });
}

export async function resumeCampaign(campaignId: string) {
  await editRemoteFolder(campaignId, 'continue');
  return prisma.whatsAppCampaign.update({
    where: { id: campaignId }, data: { status: 'SENDING', pausedAt: null },
  });
}

export async function cancelCampaign(campaignId: string) {
  await editRemoteFolder(campaignId, 'delete');
  const canceledAt = new Date();
  await prisma.$transaction([
    prisma.whatsAppRecipient.updateMany({
      where: { campaignId, status: { in: ['PENDING', 'QUEUED'] } },
      data: { status: 'CANCELED', canceledAt },
    }),
    prisma.whatsAppCampaign.update({
      where: { id: campaignId }, data: { status: 'CANCELED', canceledAt },
    }),
  ]);
  return prisma.whatsAppCampaign.findUniqueOrThrow({ where: { id: campaignId } });
}

async function assertUnstarted(campaign: Awaited<ReturnType<typeof requireCampaign>>) {
  if (['COMPLETED', 'CANCELED', 'FAILED'].includes(campaign.status)) {
    throw new CampaignConflictError('Campaign is terminal.');
  }
  if (campaign.recipients.some(({ status }) => sentOrBeyond.has(status))) {
    throw new CampaignConflictError('Campaign has already started.');
  }
}

async function recreateCampaignFolder(
  campaign: Awaited<ReturnType<typeof requireCampaign>>,
  options: { name: string; content: WhatsAppCampaignContent; scheduledAt: Date },
) {
  const client = await getConfiguredUazapiClient();
  if (campaign.remoteFolderId) {
    await client.editFolder({ folder_id: campaign.remoteFolderId, action: 'delete' });
  }
  const mediaUrl = await mediaUrlFactory(options.content);
  const recipients = campaign.recipients.filter(({ isValid, status }) => isValid && status !== 'CANCELED');
  const personalized = recipients.map((recipient) => ({
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
  const folder = remoteFolder(response);
  const queuedAt = new Date();
  for (const { recipient, content } of personalized) {
    await prisma.whatsAppRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'QUEUED', queuedAt, error: null, failedAt: null,
        personalizedContent: content as any,
        externalMessageIds: [],
      },
    });
  }
  return { folder, queuedAt };
}

export async function rescheduleCampaign(campaignId: string, scheduledAtValue: string) {
  const campaign = await requireCampaign(campaignId);
  await assertUnstarted(campaign);
  const scheduledAt = new Date(scheduledAtValue);
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new CampaignValidationError('Scheduled time must be in the future.');
  }
  const recreated = await recreateCampaignFolder(campaign, {
    name: campaign.name, content: campaign.content as unknown as WhatsAppCampaignContent, scheduledAt,
  });
  return prisma.whatsAppCampaign.update({
    where: { id: campaignId },
    data: {
      status: 'SCHEDULED', scheduledAt, remoteFolderId: recreated.folder.id,
      remoteFolderStatus: recreated.folder.status, remoteFolderCreatedAt: recreated.folder.createdAt,
      queuedAt: recreated.queuedAt,
    },
  });
}

export async function editUnstartedCampaign(
  campaignId: string,
  input: { name?: string; content?: WhatsAppCampaignContent },
) {
  const campaign = await requireCampaign(campaignId);
  await assertUnstarted(campaign);
  const name = input.name ?? campaign.name;
  const content = campaignContent({ category: campaign.category, content: input.content ?? campaign.content as unknown as WhatsAppCampaignContent });
  const scheduledAt = campaign.scheduledAt ?? new Date();
  const recreated = await recreateCampaignFolder(campaign, { name, content, scheduledAt });
  return prisma.whatsAppCampaign.update({
    where: { id: campaignId },
    data: {
      name, content: content as any, remoteFolderId: recreated.folder.id,
      remoteFolderStatus: recreated.folder.status, remoteFolderCreatedAt: recreated.folder.createdAt,
      queuedAt: recreated.queuedAt,
    },
  });
}

export async function retryFailedRecipients(campaignId: string, coordinatorId: string) {
  const campaign = await requireCampaign(campaignId);
  const failed = campaign.recipients.filter(({ status, isValid }) => status === 'FAILED' && isValid);
  if (failed.length === 0) throw new CampaignConflictError('Campaign has no failed recipients.');
  const name = `${campaign.name} (retry)`;
  const retry = await prisma.$transaction(async (tx) => {
    const audit = await tx.whatsAppCampaign.create({
      data: {
        tenantId: getTenantId(), createdById: coordinatorId, name,
        status: 'DRAFT', category: campaign.category,
        audienceFilter: { type: 'RETRY', retryOfCampaignId: campaign.id },
        content: campaign.content as any,
        consentAt: campaign.consentAt,
        totalRecipients: failed.length,
        validRecipients: failed.length,
      },
    });
    await tx.whatsAppRecipient.createMany({
      data: failed.map((recipient) => ({
        tenantId: getTenantId(), campaignId: audit.id,
        origin: recipient.origin, sourceId: recipient.sourceId, sourceName: recipient.sourceName,
        personName: recipient.personName, phoneOriginal: recipient.phoneOriginal,
        phoneNormalized: recipient.phoneNormalized,
        personalizedContent: recipient.personalizedContent as any,
        isValid: true, status: 'PENDING' as const,
      })),
    });
    return audit;
  });

  const client = await getConfiguredUazapiClient();
  const content = campaign.content as unknown as WhatsAppCampaignContent;
  const mediaUrl = await mediaUrlFactory(content);
  let response: Record<string, unknown>;
  try {
    response = await client.sendAdvanced({
      delayMin: config.whatsappDelayMin,
      delayMax: config.whatsappDelayMax,
      info: name,
      scheduled_for: Date.now(),
      messages: failed.flatMap((recipient) =>
        allItems(recipient.personalizedContent as unknown as WhatsAppCampaignContent).map((item) =>
          buildUazapiMessage(item, { number: recipient.phoneNormalized!, mediaUrl }))),
    });
  } catch (error) {
    const message = safeRemoteError(error);
    const failedAt = new Date();
    await prisma.$transaction([
      prisma.whatsAppRecipient.updateMany({
        where: { campaignId: retry.id }, data: { status: 'FAILED', error: message, failedAt },
      }),
      prisma.whatsAppCampaign.update({
        where: { id: retry.id },
        data: { status: 'FAILED', failedCount: failed.length, lastError: message, failedAt },
      }),
    ]);
    throw new CampaignDispatchError(message);
  }

  try {
    const folder = remoteFolder(response);
    const queuedAt = new Date();
    await prisma.$transaction([
      prisma.whatsAppRecipient.updateMany({
        where: { campaignId: retry.id }, data: { status: 'QUEUED', queuedAt },
      }),
      prisma.whatsAppCampaign.update({
        where: { id: retry.id },
        data: {
          status: 'QUEUED', remoteFolderId: folder.id,
          remoteFolderStatus: folder.status, remoteFolderCreatedAt: folder.createdAt,
          queuedCount: failed.length, queuedAt,
        },
      }),
    ]);
    return prisma.whatsAppCampaign.findUniqueOrThrow({ where: { id: retry.id } });
  } catch {
    throw new CampaignStateIndeterminateError();
  }
}

async function persistAudit(
  input: CreateCampaignInput & { coordinatorId: string },
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

type InternalCreateCampaignInput = CreateCampaignInput & { coordinatorId: string };

export async function createCampaign(input: CreateCampaignInput, coordinatorId: string) {
  if (input.consentimentoConfirmado !== true) throw new Error('Explicit consent is required.');
  const consentAt = new Date();
  const scheduledAt = input.scheduledAt === undefined ? null : new Date(input.scheduledAt);
  if (
    scheduledAt !== null
    && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= consentAt.getTime())
  ) {
    throw new CampaignValidationError('Scheduled time must be in the future.');
  }
  const client = await getConfiguredUazapiClient();
  const content = campaignContent(input);
  const mediaUrl = await mediaUrlFactory(content);
  const preview = await previewAudience(input.audienceFilter, content);
  const internalInput: InternalCreateCampaignInput = { ...input, coordinatorId };
  const audit = await persistAudit(internalInput, content, preview, consentAt, scheduledAt);
  const validRecipients = preview.recipients.filter(
    (recipient): recipient is typeof recipient & { phoneNormalized: string } => recipient.isValid,
  );
  const scheduledFor = scheduledAt?.getTime() ?? consentAt.getTime();

  if (validRecipients.length === 0) {
    return prisma.whatsAppCampaign.update({
      where: { id: audit.id },
      data: {
        status: scheduledAt === null ? 'QUEUED' : 'SCHEDULED',
        queuedAt: new Date(),
      },
    });
  }

  let response: Record<string, unknown>;
  try {
    response = await client.sendAdvanced({
      delayMin: config.whatsappDelayMin,
      delayMax: config.whatsappDelayMax,
      info: input.name,
      scheduled_for: scheduledFor,
      messages: validRecipients.flatMap((recipient) =>
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
        where: { campaignId: audit.id, isValid: true },
        data: { status: 'FAILED', error: message, failedAt },
      }),
      prisma.whatsAppCampaign.update({
        where: { id: audit.id },
        data: {
          status: 'FAILED', lastError: message, failedCount: validRecipients.length, failedAt,
        },
      }),
    ]);
    throw new CampaignDispatchError(message);
  }

  try {
    const folder = remoteFolder(response);
    const queuedAt = new Date();
    await prisma.whatsAppRecipient.updateMany({
      where: { campaignId: audit.id, isValid: true },
      data: { status: 'QUEUED', queuedAt },
    });
    return await prisma.whatsAppCampaign.update({
      where: { id: audit.id },
      data: {
        status: scheduledAt === null ? 'QUEUED' : 'SCHEDULED',
        remoteFolderId: folder.id,
        remoteFolderStatus: folder.status,
        remoteFolderCreatedAt: folder.createdAt,
        queuedCount: validRecipients.length,
        queuedAt,
      },
    });
  } catch {
    throw new CampaignStateIndeterminateError();
  }
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
