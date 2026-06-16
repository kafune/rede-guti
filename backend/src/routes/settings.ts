import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const SETTINGS_ID = 'default';

const updateSchema = z
  .object({
    whatsappGroupLink: z.string().url().nullable().optional(),
    announcement: z.string().max(1000).nullable().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Invalid payload'
  });

const settingsSelect = {
  whatsappGroupLink: true,
  announcement: true,
  updatedAt: true
} as const;

const serializeSettings = (settings?: {
  whatsappGroupLink: string | null;
  announcement: string | null;
  updatedAt: Date;
} | null) => ({
  whatsappGroupLink: settings?.whatsappGroupLink ?? null,
  announcement: settings?.announcement ?? null,
  updatedAt: settings?.updatedAt ?? null
});

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/settings', { preHandler: app.authenticate }, async () => {
    const settings = await prisma.appConfig.findUnique({
      where: { id: SETTINGS_ID },
      select: settingsSelect
    });

    return { settings: serializeSettings(settings) };
  });

  app.patch('/settings', { preHandler: app.requireCoordinator }, async (request, reply) => {
    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const data: { whatsappGroupLink?: string | null; announcement?: string | null } = {};

    if (body.data.whatsappGroupLink !== undefined) {
      data.whatsappGroupLink = body.data.whatsappGroupLink?.trim() || null;
    }

    if (body.data.announcement !== undefined) {
      data.announcement = body.data.announcement?.trim() || null;
    }

    const settings = await prisma.appConfig.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: {
        id: SETTINGS_ID,
        ...data
      },
      select: settingsSelect
    });

    return { settings: serializeSettings(settings) };
  });
}
