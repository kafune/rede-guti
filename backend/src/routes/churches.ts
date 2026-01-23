import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const churchSchema = z.object({
  name: z.string().min(2)
});

export async function churchRoutes(app: FastifyInstance) {
  app.get('/churches', { preHandler: app.authenticate }, async () => {
    const churches = await prisma.church.findMany({ orderBy: { name: 'asc' } });
    return { churches };
  });

  app.post('/churches', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = churchSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    try {
      const church = await prisma.church.create({ data: { name: body.data.name.trim() } });
      return reply.code(201).send({ church });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return reply.code(409).send({ error: 'Church already exists' });
      }
      throw error;
    }
  });
}
