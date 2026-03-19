import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const SETTINGS_ID = 'default';

const updateSchema = z.object({
  whatsappGroupLink: z.string().url().nullable()
});

const settingsSelect = {
  whatsappGroupLink: true,
  updatedAt: true
} as const;

const serializeSettings = (settings?: {
  whatsappGroupLink: string | null;
  updatedAt: Date;
} | null) => ({
  whatsappGroupLink: settings?.whatsappGroupLink ?? null,
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

    const whatsappGroupLink = body.data.whatsappGroupLink?.trim() || null;

    const settings = await prisma.appConfig.upsert({
      where: { id: SETTINGS_ID },
      update: {
        whatsappGroupLink
      },
      create: {
        id: SETTINGS_ID,
        whatsappGroupLink
      },
      select: settingsSelect
    });

    return { settings: serializeSettings(settings) };
  });
}
