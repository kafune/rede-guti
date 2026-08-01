import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { getTenantId } from '../../lib/tenantContext.js';
import { normalizeBrazilianPhone } from '../../whatsapp/domain/phone.js';

const id = z.string().trim().min(1).max(200);
const paramsSchema = z.object({ id }).strict();
const createSchema = z.object({
  phone: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(1_000),
}).strict();
const reauthorizeSchema = z.object({ consentimentoConfirmado: z.literal(true) }).strict();

export async function whatsappSuppressionRoutes(app: FastifyInstance) {
  app.get('/suppressions', async () => ({
    suppressions: await prisma.whatsAppSuppression.findMany({
      orderBy: [{ active: 'desc' }, { updatedAt: 'desc' }],
    }),
  }));

  app.post('/suppressions', async (request, reply) => {
    const input = createSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'Invalid payload' });
    const phone = normalizeBrazilianPhone(input.data.phone);
    if (!phone.valid) return reply.code(400).send({ error: 'Invalid Brazilian phone.' });
    const now = new Date();
    const suppression = await prisma.whatsAppSuppression.upsert({
      where: {
        tenantId_phoneNormalized: {
          tenantId: getTenantId(), phoneNormalized: phone.normalized,
        },
      },
      create: {
        tenantId: getTenantId(), phoneNormalized: phone.normalized, active: true,
        reason: input.data.reason, source: 'MANUAL', createdById: request.user.sub,
        firstOptOutAt: now, lastOptOutAt: now,
      },
      update: {
        active: true, reason: input.data.reason, source: 'MANUAL', createdById: request.user.sub,
        lastOptOutAt: now, reauthorizedAt: null, reauthorizedById: null,
      },
    });
    await prisma.whatsAppRecipient.updateMany({
      where: { phoneNormalized: phone.normalized, status: { in: ['PENDING', 'QUEUED'] } },
      data: { status: 'CANCELED', canceledAt: now },
    });
    return reply.code(201).send({ suppression });
  });

  app.post('/suppressions/:id/reauthorize', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const input = reauthorizeSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: 'Invalid payload' });
    const existing = await prisma.whatsAppSuppression.findUnique({ where: { id: params.data.id } });
    if (!existing) return reply.code(404).send({ error: 'Suppression not found.' });
    const suppression = await prisma.whatsAppSuppression.update({
      where: { id: existing.id },
      data: {
        active: false, reauthorizedAt: new Date(), reauthorizedById: request.user.sub,
      },
    });
    return { suppression };
  });
}
