import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import type { AudienceFilter } from '../../whatsapp/domain/audience.js';
import { AudienceValidationError } from '../../whatsapp/domain/audience.js';
import { applyMarketingFooter, personalizeContent } from '../../whatsapp/domain/content.js';
import {
  CampaignDispatchError,
  CampaignConflictError,
  CampaignNotFoundError,
  CampaignStateIndeterminateError,
  CampaignValidationError,
  cancelCampaign,
  createCampaign,
  editUnstartedCampaign,
  pauseCampaign,
  rescheduleCampaign,
  resumeCampaign,
  retryFailedRecipients,
  sendTestCampaign,
  syncActiveCampaigns,
  syncCampaign,
} from '../../whatsapp/services/campaign-service.js';
import { previewAudience } from '../../whatsapp/services/audience-service.js';
import type { WhatsAppCampaignContent } from '../../whatsapp/types.js';
import { UazapiError } from '../../whatsapp/uazapi/client.js';

const id = z.string().trim().min(1).max(200);
const ids = z.array(id).max(10_000).optional();
const text = z.string().trim().min(1).max(10_000);
const optionalText = z.string().trim().min(1).max(10_000).optional();
const buttonSchema = z.object({
  label: z.string().trim().min(1).max(80),
  action: z.enum(['REPLY', 'URL', 'CALL', 'COPY']),
  value: z.string().trim().min(1).max(2_000),
}).strict();
const contentItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text }).strict(),
  z.object({ type: z.literal('image'), mediaId: id, caption: optionalText }).strict(),
  z.object({
    type: z.literal('document'), mediaId: id, caption: optionalText,
    filename: z.string().trim().min(1).max(255).optional(),
  }).strict(),
  z.object({ type: z.literal('audio'), mediaId: id, caption: optionalText }).strict(),
  z.object({
    type: z.literal('button'), text, footerText: optionalText, mediaId: id.optional(),
    buttons: z.array(buttonSchema).min(1).max(10),
  }).strict(),
  z.object({
    type: z.literal('poll'), text, choices: z.array(text).min(2).max(12),
    selectableCount: z.number().int().min(1).max(12),
  }).strict(),
  z.object({
    type: z.literal('carousel'), text,
    cards: z.array(z.object({
      text, mediaId: id.optional(), buttons: z.array(buttonSchema).min(1).max(10),
    }).strict()).min(1).max(10),
  }).strict(),
]);
const campaignContentSchema = z.object({
  primary: contentItemSchema,
  sequence: z.array(contentItemSchema).max(9),
}).strict().superRefine((value, context) => {
  for (const item of [value.primary, ...value.sequence]) {
    if (item.type === 'poll' && item.selectableCount > item.choices.length) {
      context.addIssue({ code: 'custom', message: 'selectableCount exceeds choices' });
    }
  }
  try {
    personalizeContent(value as WhatsAppCampaignContent, { name: 'Nome Completo' });
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid campaign variables',
    });
  }
});

const audienceFilterSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('LEADERS'),
    roles: z.array(z.enum(['COORDENADOR', 'LIDER_REGIONAL', 'VERIFICADORA'])).optional(),
    active: z.boolean().optional(), hierarchyRootId: id.optional(), selectedIds: ids,
  }).strict(),
  z.object({
    type: z.literal('SUPPORTERS'),
    statuses: z.array(z.enum(['ATIVO', 'INATIVO'])).optional(),
    municipalityIds: ids, churchIds: ids, leaderIds: ids,
    createdFrom: z.string().datetime({ offset: true }).optional(),
    createdTo: z.string().datetime({ offset: true }).optional(),
    selectedIds: ids,
  }).strict(),
  z.object({
    type: z.literal('EVENT_GUESTS'), eventId: id,
    statuses: z.array(z.enum(['INDICADO', 'APROVADO', 'RECUSADO', 'CONFIRMADO', 'PRESENTE'])).optional(),
    selectedIds: ids,
  }).strict(),
  z.object({
    type: z.literal('TEAM_CONTACTS'),
    statuses: z.array(z.enum(['ATIVA', 'INATIVA'])).optional(), leaderIds: ids,
    contactKinds: z.array(z.enum(['DRIVER', 'MEMBER'])).optional(), teamIds: ids, selectedIds: ids,
  }).strict(),
]);

const previewSchema = z.object({
  category: z.enum(['MARKETING', 'UTILITY']),
  audienceFilter: audienceFilterSchema,
  content: campaignContentSchema,
}).strict();
const testSchema = z.object({
  phone: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200).default('Teste'),
  category: z.enum(['MARKETING', 'UTILITY']),
  content: campaignContentSchema,
}).strict();
const createSchema = previewSchema.extend({
  name: z.string().trim().min(1).max(160),
  consentimentoConfirmado: z.literal(true),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
}).strict();
const paramsSchema = z.object({ id });
const rescheduleSchema = z.object({ scheduledAt: z.string().datetime({ offset: true }) }).strict();
const editSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  content: campaignContentSchema.optional(),
}).strict().refine((value) => value.name !== undefined || value.content !== undefined);

function sendCampaignError(reply: FastifyReply, error: unknown) {
  if (error instanceof CampaignConflictError || error instanceof CampaignNotFoundError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof CampaignValidationError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof AudienceValidationError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof CampaignDispatchError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof CampaignStateIndeterminateError) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  if (error instanceof UazapiError) {
    return reply.code(error.status).send({ error: error.message, code: error.code });
  }
  if (error instanceof Error && error.message === 'WhatsApp integration is not configured.') {
    return reply.code(503).send({ error: error.message });
  }
  if (error instanceof Error && error.message === 'Invalid Brazilian phone.') {
    return reply.code(400).send({ error: error.message });
  }
  throw error;
}

export async function whatsappCampaignRoutes(app: FastifyInstance) {
  app.post('/campaigns/preview', async (request, reply) => {
    const input = previewSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid payload' });
    const content = input.data.category === 'MARKETING'
      ? applyMarketingFooter(input.data.content as WhatsAppCampaignContent)
      : input.data.content as WhatsAppCampaignContent;
    try {
      return await previewAudience(input.data.audienceFilter as AudienceFilter, content);
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  app.post('/campaigns/test', async (request, reply) => {
    const input = testSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid payload' });
    try {
      await sendTestCampaign({
        ...input.data,
        content: input.data.content as WhatsAppCampaignContent,
      });
      return { sent: true };
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  app.post('/campaigns', async (request, reply) => {
    const input = createSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid payload' });
    try {
      const campaign = await createCampaign({
        ...input.data,
        audienceFilter: input.data.audienceFilter as AudienceFilter,
        content: input.data.content as WhatsAppCampaignContent,
      }, request.user.sub);
      return reply.code(201).send({ campaign });
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  app.post('/campaigns/sync', async (_request, reply) => {
    try {
      return await syncActiveCampaigns();
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  app.post('/campaigns/:id/sync', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    try {
      return { campaign: await syncCampaign(params.data.id) };
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  for (const [action, operation] of [
    ['pause', pauseCampaign],
    ['resume', resumeCampaign],
    ['cancel', cancelCampaign],
  ] as const) {
    app.post(`/campaigns/:id/${action}`, async (request, reply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
      try {
        return { campaign: await operation(params.data.id) };
      } catch (error) {
        return sendCampaignError(reply, error);
      }
    });
  }

  app.post('/campaigns/:id/reschedule', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const input = rescheduleSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid payload' });
    try {
      return { campaign: await rescheduleCampaign(params.data.id, input.data.scheduledAt) };
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  app.patch('/campaigns/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const input = editSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid payload' });
    try {
      return { campaign: await editUnstartedCampaign(params.data.id, {
        ...input.data,
        content: input.data.content as WhatsAppCampaignContent | undefined,
      }) };
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  app.post('/campaigns/:id/retry-failed', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    try {
      return { campaign: await retryFailedRecipients(params.data.id) };
    } catch (error) {
      return sendCampaignError(reply, error);
    }
  });

  app.get('/campaigns', async () => ({
    campaigns: await prisma.whatsAppCampaign.findMany({ orderBy: { createdAt: 'desc' } }),
  }));

  app.get('/campaigns/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    const campaign = await prisma.whatsAppCampaign.findUnique({
      where: { id: params.data.id },
      include: { recipients: { orderBy: { sourceId: 'asc' } } },
    });
    if (!campaign) return reply.code(404).send({ error: 'Campaign not found.' });
    return { campaign };
  });
}
