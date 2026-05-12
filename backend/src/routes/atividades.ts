import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { normalizeRole } from '../lib/access.js';

const paramsSchema = z.object({ id: z.string().min(1) });
const liderParamsSchema = z.object({ id: z.string().min(1) });

const createAtividadeSchema = z.object({
  liderId: z.string().trim().min(1, 'Liderança obrigatória.'),
  titulo: z.string().trim().min(2, 'Título muito curto.'),
  descricao: z.string().trim().optional(),
  dataHora: z.string().min(1, 'Data/hora obrigatória.'),
  local: z.string().trim().optional(),
  qtdEnvolvidos: z.number().int().min(0).default(0)
});

const updateAtividadeSchema = z.object({
  titulo: z.string().trim().min(2).optional(),
  descricao: z.string().trim().optional().nullable(),
  dataHora: z.string().min(1).optional(),
  local: z.string().trim().optional().nullable(),
  qtdEnvolvidos: z.number().int().min(0).optional()
});

const listQuerySchema = z.object({
  liderId: z.string().optional(),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  q: z.string().optional()
});

const atividadeInclude = {
  lider: { select: { id: true, name: true, email: true } }
} as const;

const serializeAtividade = (a: {
  id: string;
  liderId: string;
  titulo: string;
  descricao: string | null;
  dataHora: Date;
  local: string | null;
  qtdEnvolvidos: number;
  createdAt: Date;
  lider: { id: string; name: string | null; email: string };
}) => ({
  id: a.id,
  liderId: a.liderId,
  liderNome: a.lider.name ?? a.lider.email,
  titulo: a.titulo,
  descricao: a.descricao,
  dataHora: a.dataHora.toISOString(),
  local: a.local,
  qtdEnvolvidos: a.qtdEnvolvidos,
  createdAt: a.createdAt.toISOString()
});

export async function atividadeRoutes(app: FastifyInstance) {
  // ── PUBLIC: GET LIDER INFO ────────────────────────────────────────────────
  app.get('/public/lideres/:id', async (request, reply) => {
    const params = liderParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const lider = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { id: true, name: true, email: true, role: true }
    });

    if (!lider) return reply.code(404).send({ error: 'Liderança não encontrada.' });

    return {
      lider: {
        id: lider.id,
        nome: lider.name ?? lider.email
      }
    };
  });

  // ── PUBLIC: CREATE ATIVIDADE ──────────────────────────────────────────────
  app.post('/public/atividades', async (request, reply) => {
    const body = createAtividadeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    const lider = await prisma.user.findUnique({
      where: { id: body.data.liderId },
      select: { id: true }
    });
    if (!lider) return reply.code(404).send({ error: 'Liderança não encontrada.' });

    const atividade = await prisma.atividade.create({
      data: {
        liderId: body.data.liderId,
        titulo: body.data.titulo,
        descricao: body.data.descricao,
        dataHora: new Date(body.data.dataHora),
        local: body.data.local,
        qtdEnvolvidos: body.data.qtdEnvolvidos
      },
      include: atividadeInclude
    });

    return reply.code(201).send({ atividade: serializeAtividade(atividade) });
  });

  // ── PUBLIC: LIST ATIVIDADES DE UMA LIDERANÇA ──────────────────────────────
  app.get('/public/lideres/:id/atividades', async (request, reply) => {
    const params = liderParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const atividades = await prisma.atividade.findMany({
      where: { liderId: params.data.id },
      include: atividadeInclude,
      orderBy: { dataHora: 'desc' },
      take: 50
    });

    return { atividades: atividades.map(serializeAtividade) };
  });

  // ── LIST ATIVIDADES (autenticado) ─────────────────────────────────────────
  app.get('/atividades', { preHandler: app.authenticate }, async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Query inválida.' });

    const role = normalizeRole(request.user.role);
    const where: any = {};

    if (role === 'LIDER_REGIONAL') {
      where.liderId = request.user.sub;
    } else if (query.data.liderId) {
      where.liderId = query.data.liderId;
    }

    if (query.data.dataInicio || query.data.dataFim) {
      where.dataHora = {};
      if (query.data.dataInicio) where.dataHora.gte = new Date(query.data.dataInicio);
      if (query.data.dataFim) where.dataHora.lte = new Date(query.data.dataFim);
    }

    if (query.data.q) {
      const q = query.data.q;
      where.OR = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { descricao: { contains: q, mode: 'insensitive' } },
        { local: { contains: q, mode: 'insensitive' } }
      ];
    }

    const atividades = await prisma.atividade.findMany({
      where,
      include: atividadeInclude,
      orderBy: { dataHora: 'desc' }
    });

    return { atividades: atividades.map(serializeAtividade) };
  });

  // ── GET ATIVIDADE DETAIL ──────────────────────────────────────────────────
  app.get('/atividades/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const atividade = await prisma.atividade.findUnique({
      where: { id: params.data.id },
      include: atividadeInclude
    });

    if (!atividade) return reply.code(404).send({ error: 'Atividade não encontrada.' });

    const role = normalizeRole(request.user.role);
    if (role === 'LIDER_REGIONAL' && atividade.liderId !== request.user.sub) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    return { atividade: serializeAtividade(atividade) };
  });

  // ── UPDATE ATIVIDADE ──────────────────────────────────────────────────────
  app.patch('/atividades/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const body = updateAtividadeSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Dados inválidos.' });
    }

    const existing = await prisma.atividade.findUnique({
      where: { id: params.data.id },
      select: { id: true, liderId: true }
    });
    if (!existing) return reply.code(404).send({ error: 'Atividade não encontrada.' });

    const role = normalizeRole(request.user.role);
    if (role === 'LIDER_REGIONAL' && existing.liderId !== request.user.sub) {
      return reply.code(403).send({ error: 'Apenas o autor pode editar.' });
    }

    const atividade = await prisma.atividade.update({
      where: { id: params.data.id },
      data: {
        ...(body.data.titulo !== undefined && { titulo: body.data.titulo }),
        ...(body.data.descricao !== undefined && { descricao: body.data.descricao }),
        ...(body.data.dataHora !== undefined && { dataHora: new Date(body.data.dataHora) }),
        ...(body.data.local !== undefined && { local: body.data.local }),
        ...(body.data.qtdEnvolvidos !== undefined && { qtdEnvolvidos: body.data.qtdEnvolvidos })
      },
      include: atividadeInclude
    });

    return { atividade: serializeAtividade(atividade) };
  });

  // ── DELETE ATIVIDADE ──────────────────────────────────────────────────────
  app.delete('/atividades/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const role = normalizeRole(request.user.role);

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const existing = await prisma.atividade.findUnique({
      where: { id: params.data.id },
      select: { id: true, liderId: true }
    });
    if (!existing) return reply.code(404).send({ error: 'Atividade não encontrada.' });

    // Coordenador exclui qualquer; Líder só a própria
    if (role === 'LIDER_REGIONAL' && existing.liderId !== request.user.sub) {
      return reply.code(403).send({ error: 'Apenas o autor ou coordenador pode excluir.' });
    }
    if (role !== 'COORDENADOR' && role !== 'LIDER_REGIONAL') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    await prisma.atividade.delete({ where: { id: params.data.id } });
    return reply.code(204).send();
  });
}
