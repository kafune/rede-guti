import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6).optional(),
  email: z.string().email().optional(),
  churchId: z.string().min(1),
  municipalityId: z.string().min(1),
  indicatedBy: z.string().min(2)
});

const querySchema = z.object({
  churchId: z.string().optional(),
  municipalityId: z.string().optional(),
  indicatedBy: z.string().optional(),
  q: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional()
});

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export async function indicationRoutes(app: FastifyInstance) {
  app.get('/indications', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query' });
    }

    const { churchId, municipalityId, indicatedBy, q, dateFrom, dateTo } = parsed.data;
    const from = parseDate(dateFrom);
    const to = parseDate(dateTo);

    if (from === null || to === null) {
      return reply.code(400).send({ error: 'Invalid date range' });
    }

    const where: any = {};

    if (churchId) where.churchId = churchId;
    if (municipalityId) where.municipalityId = municipalityId;
    if (indicatedBy) where.indicatedBy = { contains: indicatedBy, mode: 'insensitive' };

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { indicatedBy: { contains: q, mode: 'insensitive' } }
      ];
    }

    const indications = await prisma.indication.findMany({
      where,
      include: { church: true, municipality: true, createdBy: true },
      orderBy: { createdAt: 'desc' }
    });

    return { indications };
  });

  app.post('/indications', { preHandler: app.requireAdmin }, async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const data = body.data;
    const indication = await prisma.indication.create({
      data: {
        name: data.name.trim(),
        phone: data.phone?.trim(),
        email: data.email?.toLowerCase().trim(),
        indicatedBy: data.indicatedBy.trim(),
        churchId: data.churchId,
        municipalityId: data.municipalityId,
        createdById: request.user.sub
      },
      include: { church: true, municipality: true, createdBy: true }
    });

    return reply.code(201).send({ indication });
  });

  app.delete('/indications/:id', { preHandler: app.requireAdmin }, async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid id' });
    }

    await prisma.indication.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });
}
