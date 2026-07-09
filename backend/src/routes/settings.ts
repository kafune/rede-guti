import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { getTenantId } from '../lib/tenantContext.js';

const updateSchema = z
  .object({
    whatsappGroupLink: z.string().url().nullable().optional(),
    announcement: z.string().max(1000).nullable().optional(),
    liderAccessBlocked: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Invalid payload'
  });

const settingsSelect = {
  whatsappGroupLink: true,
  announcement: true,
  liderAccessBlocked: true,
  updatedAt: true
} as const;

const serializeSettings = (settings?: {
  whatsappGroupLink: string | null;
  announcement: string | null;
  liderAccessBlocked: boolean;
  updatedAt: Date;
} | null) => ({
  whatsappGroupLink: settings?.whatsappGroupLink ?? null,
  announcement: settings?.announcement ?? null,
  liderAccessBlocked: settings?.liderAccessBlocked ?? false,
  updatedAt: settings?.updatedAt ?? null
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings', { preHandler: app.authenticate }, async () => {
    // AppConfig deixou de ser singleton: uma linha por tenant (tenant_id UNIQUE).
    const settings = await prisma.appConfig.findUnique({
      where: { tenantId: getTenantId() },
      select: settingsSelect
    });

    return { settings: serializeSettings(settings) };
  });

  app.patch('/settings', { preHandler: app.requireCoordinator }, async (request, reply) => {
    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const data: {
      whatsappGroupLink?: string | null;
      announcement?: string | null;
      liderAccessBlocked?: boolean;
    } = {};

    if (body.data.whatsappGroupLink !== undefined) {
      data.whatsappGroupLink = body.data.whatsappGroupLink?.trim() || null;
    }

    if (body.data.announcement !== undefined) {
      data.announcement = body.data.announcement?.trim() || null;
    }

    if (body.data.liderAccessBlocked !== undefined) {
      data.liderAccessBlocked = body.data.liderAccessBlocked;
    }

    const tenantId = getTenantId();
    const settings = await prisma.appConfig.upsert({
      where: { tenantId },
      update: data,
      create: {
        tenantId,
        ...data
      },
      select: settingsSelect
    });

    return { settings: serializeSettings(settings) };
  });
}
