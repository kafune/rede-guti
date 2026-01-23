import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const municipalitySchema = z.object({
  name: z.string().min(2),
  stateCode: z.string().length(2).optional()
});

export async function municipalityRoutes(app: FastifyInstance) {
  app.get('/municipalities', { preHandler: app.authenticate }, async () => {
    const municipalities = await prisma.municipality.findMany({ orderBy: { name: 'asc' } });
    return { municipalities };
  });

  app.post('/municipalities', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = municipalitySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const name = body.data.name.trim();
    const stateCode = (body.data.stateCode ?? 'SP').toUpperCase();

    try {
      const municipality = await prisma.municipality.create({
        data: { name, stateCode }
      });
      return reply.code(201).send({ municipality });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({ error: 'Municipality already exists' });
      }
      throw error;
    }
  });
}
