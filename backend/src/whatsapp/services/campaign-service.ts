import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';
import type { AudienceFilter, AudiencePreview } from '../domain/audience.js';
import { applyMarketingFooter, buildUazapiMessage, personalizeContent } from '../domain/content.js';
import { normalizeBrazilianPhone } from '../domain/phone.js';
import type { WhatsAppCampaignContent, WhatsAppContentItem } from '../types.js';
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
