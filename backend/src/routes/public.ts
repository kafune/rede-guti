import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const createPublicSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional(),
  churchName: z.string().min(2),
  municipalityName: z.string().min(2),
  indicatedBy: z.string().min(2)
});

const normalizeText = (value: string) => value.trim();

export async function publicRoutes(app: FastifyInstance) {
  app.get('/public/options', async (request, reply) => {
    const churches = await prisma.church.findMany({
      select: { name: true },
      orderBy: { name: 'asc' }
    });
    const municipalities = await prisma.municipality.findMany({
      select: { name: true },
      orderBy: { name: 'asc' }
    });

    return {
      churches: churches.map((c) => c.name),
      municipalities: municipalities.map((m) => m.name)
    };
  });

  app.post('/public/indications', async (request, reply) => {
    const body = createPublicSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const data = body.data;
    const name = normalizeText(data.name);
    const phone = normalizeText(data.phone);
    const email = data.email ? data.email.toLowerCase().trim() : undefined;
    const churchName = normalizeText(data.churchName);
    const municipalityName = normalizeText(data.municipalityName);
    const indicatedBy = normalizeText(data.indicatedBy);

    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    });

    if (!admin) {
      return reply.code(409).send({ error: 'Nenhum administrador disponivel.' });
    }

    let church = await prisma.church.findFirst({
      where: { name: { equals: churchName, mode: 'insensitive' } }
    });
    if (!church) {
      church = await prisma.church.create({ data: { name: churchName } });
    }

    let municipality = await prisma.municipality.findFirst({
      where: { name: { equals: municipalityName, mode: 'insensitive' }, stateCode: 'SP' }
    });
    if (!municipality) {
      municipality = await prisma.municipality.create({
        data: { name: municipalityName, stateCode: 'SP' }
      });
    }

    const indication = await prisma.indication.create({
      data: {
        name,
        phone,
        email,
        indicatedBy,
        churchId: church.id,
        municipalityId: municipality.id,
        createdById: admin.id
      },
      include: { church: true, municipality: true }
    });

    return reply.code(201).send({ indication });
  });
}
