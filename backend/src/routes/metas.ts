import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';

const createSchema = z.object({
  municipalityId: z.string().min(1),
  regiao: z.string().trim().optional(),
  eleitores: z.number().int().min(0).default(0),
  votosValidos: z.number().int().min(0).default(0),
  meta: z.number().int().min(0).default(0),
  observacao: z.string().trim().optional()
});

const updateSchema = z.object({
  regiao: z.string().trim().nullable().optional(),
  eleitores: z.number().int().min(0).optional(),
  votosValidos: z.number().int().min(0).optional(),
  meta: z.number().int().min(0).optional(),
  observacao: z.string().trim().nullable().optional()
});

const paramsSchema = z.object({ id: z.string().min(1) });

type MetaRecord = {
  id: string;
  municipalityId: string;
  regiao: string | null;
  eleitores: number;
  votosValidos: number;
  meta: number;
  observacao: string | null;
  createdAt: Date;
  updatedAt: Date;
  municipality: { name: string };
};

const serializeMeta = (meta: MetaRecord, apoiadoresCadastrados: number) => ({
  id: meta.id,
  municipalityId: meta.municipalityId,
  cidade: meta.municipality.name,
  regiao: meta.regiao,
  eleitores: meta.eleitores,
  votosValidos: meta.votosValidos,
  meta: meta.meta,
  observacao: meta.observacao,
  apoiadoresCadastrados,
  createdAt: meta.createdAt.toISOString(),
  updatedAt: meta.updatedAt.toISOString()
});

// Conta quantos apoiadores já estão cadastrados em cada município, para o
// acompanhamento "meta x realizado".
const buildApoiadoresCountMap = async () => {
  const counts = await prisma.indication.groupBy({
    by: ['municipalityId'],
    _count: { _all: true }
  });
  return new Map(counts.map((c) => [c.municipalityId, c._count._all]));
};

export async function metaRoutes(app: FastifyInstance) {
  app.get('/metas', { preHandler: app.requireCoordinator }, async () => {
    const [metas, countMap] = await Promise.all([
      prisma.metaCidade.findMany({
        include: { municipality: { select: { name: true } } },
        orderBy: [{ regiao: 'asc' }, { municipality: { name: 'asc' } }]
      }),
      buildApoiadoresCountMap()
    ]);

    return {
      metas: metas.map((meta) =>
        serializeMeta(meta, countMap.get(meta.municipalityId) ?? 0)
      )
    };
  });

  app.post('/metas', { preHandler: app.requireCoordinator }, async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const municipality = await prisma.municipality.findUnique({
      where: { id: body.data.municipalityId },
      select: { id: true }
    });
    if (!municipality) {
      return reply.code(404).send({ error: 'Cidade não encontrada.' });
    }

    const existing = await prisma.metaCidade.findUnique({
      where: { municipalityId: body.data.municipalityId },
      select: { id: true }
    });
    if (existing) {
      return reply.code(409).send({ error: 'Essa cidade já está no planejamento.' });
    }

    const meta = await prisma.metaCidade.create({
      data: {
        municipalityId: body.data.municipalityId,
        regiao: body.data.regiao || null,
        eleitores: body.data.eleitores,
        votosValidos: body.data.votosValidos,
        meta: body.data.meta,
        observacao: body.data.observacao || null
      },
      include: { municipality: { select: { name: true } } }
    });

    const count = await prisma.indication.count({
      where: { municipalityId: meta.municipalityId }
    });

    return reply.code(201).send({ meta: serializeMeta(meta, count) });
  });

  app.patch('/metas/:id', { preHandler: app.requireCoordinator }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid id' });
    }

    const body = updateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid payload' });
    }

    const existing = await prisma.metaCidade.findUnique({
      where: { id: params.data.id },
      select: { id: true }
    });
    if (!existing) {
      return reply.code(404).send({ error: 'Meta não encontrada.' });
    }

    const meta = await prisma.metaCidade.update({
      where: { id: params.data.id },
      data: {
        ...(body.data.regiao !== undefined ? { regiao: body.data.regiao || null } : {}),
        ...(body.data.eleitores !== undefined ? { eleitores: body.data.eleitores } : {}),
        ...(body.data.votosValidos !== undefined ? { votosValidos: body.data.votosValidos } : {}),
        ...(body.data.meta !== undefined ? { meta: body.data.meta } : {}),
        ...(body.data.observacao !== undefined ? { observacao: body.data.observacao || null } : {})
      },
      include: { municipality: { select: { name: true } } }
    });

    const count = await prisma.indication.count({
      where: { municipalityId: meta.municipalityId }
    });

    return { meta: serializeMeta(meta, count) };
  });

  app.delete('/metas/:id', { preHandler: app.requireCoordinator }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'Invalid id' });
    }

    const existing = await prisma.metaCidade.findUnique({
      where: { id: params.data.id },
      select: { id: true }
    });
    if (!existing) {
      return reply.code(404).send({ error: 'Meta não encontrada.' });
    }

    await prisma.metaCidade.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });
}
