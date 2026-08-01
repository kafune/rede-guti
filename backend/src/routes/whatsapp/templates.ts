import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';
import { personalizeContent } from '../../whatsapp/domain/content.js';
import type { WhatsAppCampaignContent } from '../../whatsapp/types.js';

const text = z.string().trim().min(1).max(10_000);
const optionalText = z.string().trim().min(1).max(10_000).optional();
const buttonSchema = z.object({
  label: z.string().trim().min(1).max(80),
  action: z.enum(['REPLY', 'URL', 'CALL', 'COPY']),
  value: z.string().trim().min(1).max(2_000),
}).strict();

const contentItemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text }).strict(),
  z.object({ type: z.literal('image'), mediaId: z.string().min(1), caption: optionalText }).strict(),
  z.object({
    type: z.literal('document'), mediaId: z.string().min(1), caption: optionalText,
    filename: z.string().trim().min(1).max(255).optional(),
  }).strict(),
  z.object({ type: z.literal('audio'), mediaId: z.string().min(1), caption: optionalText }).strict(),
  z.object({
    type: z.literal('button'), text, footerText: optionalText,
    mediaId: z.string().min(1).optional(), buttons: z.array(buttonSchema).min(1).max(10),
  }).strict(),
  z.object({
    type: z.literal('poll'), text, choices: z.array(text).min(2).max(12),
    selectableCount: z.number().int().min(1).max(12),
  }).strict(),
  z.object({
    type: z.literal('carousel'), text,
    cards: z.array(z.object({
      text,
      mediaId: z.string().min(1).optional(),
      buttons: z.array(buttonSchema).min(1).max(10),
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
      message: error instanceof Error ? error.message : 'Invalid template variables',
    });
  }
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.enum(['MARKETING', 'UTILITY']),
  purpose: z.string().trim().min(1).max(500).optional(),
  content: campaignContentSchema,
}).strict();

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  category: z.enum(['MARKETING', 'UTILITY']).optional(),
  purpose: z.string().trim().min(1).max(500).nullable().optional(),
  content: campaignContentSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

const favoriteSchema = z.object({ favorite: z.boolean() }).strict();
const duplicateSchema = z.object({ name: z.string().trim().min(1).max(160) }).strict();
const paramsSchema = z.object({ id: z.string().min(1) });

function isUniqueConflict(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function sendWriteError(reply: FastifyReply, error: unknown) {
  if (isUniqueConflict(error)) return reply.code(409).send({ error: 'Template name already exists.' });
  throw error;
}

export async function whatsappTemplateRoutes(app: FastifyInstance) {
  app.get('/templates', async () => ({
    templates: await prisma.whatsAppTemplate.findMany({ orderBy: [{ favorite: 'desc' }, { updatedAt: 'desc' }] }),
  }));

  app.post('/templates', async (request, reply) => {
    const input = createSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid payload' });
    try {
      const template = await prisma.whatsAppTemplate.create({
        data: {
          tenantId: getTenantId(),
          createdById: request.user.sub,
          name: input.data.name,
          category: input.data.category,
          purpose: input.data.purpose,
          content: input.data.content as any,
        },
      });
      return reply.code(201).send({ template });
    } catch (error) {
      return sendWriteError(reply, error);
    }
  });

  app.patch('/templates/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const input = updateSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid payload' });
    const exists = await prisma.whatsAppTemplate.findUnique({ where: { id: params.data.id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Template not found.' });
    try {
      const template = await prisma.whatsAppTemplate.update({
        where: { id: params.data.id },
        data: {
          ...input.data,
          ...(input.data.content === undefined ? {} : { content: input.data.content as any }),
          version: { increment: 1 },
        },
      });
      return { template };
    } catch (error) {
      return sendWriteError(reply, error);
    }
  });

  app.patch('/templates/:id/favorite', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const input = favoriteSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid payload' });
    const exists = await prisma.whatsAppTemplate.findUnique({ where: { id: params.data.id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: 'Template not found.' });
    const template = await prisma.whatsAppTemplate.update({
      where: { id: params.data.id },
      data: { favorite: input.data.favorite, version: { increment: 1 } },
    });
    return { template };
  });

  app.post('/templates/:id/duplicate', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const input = duplicateSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid payload' });
    const source = await prisma.whatsAppTemplate.findUnique({ where: { id: params.data.id } });
    if (!source) return reply.code(404).send({ error: 'Template not found.' });
    try {
      const template = await prisma.whatsAppTemplate.create({
        data: {
          tenantId: getTenantId(),
          createdById: request.user.sub,
          name: input.data.name,
          category: source.category,
          purpose: source.purpose,
          content: source.content as any,
          favorite: false,
          version: 1,
        },
      });
      return reply.code(201).send({ template });
    } catch (error) {
      return sendWriteError(reply, error);
    }
  });

  app.delete('/templates/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid id' });
    const removed = await prisma.whatsAppTemplate.deleteMany({ where: { id: params.data.id } });
    if (removed.count === 0) return reply.code(404).send({ error: 'Template not found.' });
    return reply.code(204).send();
  });
}
