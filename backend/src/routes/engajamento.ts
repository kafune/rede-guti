import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  canRecalculateStats,
  canViewFullRanking,
  visibleLeaderStatsWhere,
} from '../lib/access.js';
import {
  getLeaderboard,
  getLeaderStats,
  recalculateRanking,
} from '../lib/engagementService.js';

const rankingQuerySchema = z.object({
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const ledgerQuerySchema = z.object({
  userId: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function engajamentoRoutes(app: FastifyInstance) {
  /**
   * GET /engajamento/ranking
   * COORDENADOR → todos; demais papéis → apenas o próprio registro.
   */
  app.get('/engajamento/ranking', { preHandler: app.authenticate }, async (req, reply) => {
    const query = rankingQuerySchema.safeParse(req.query);
    if (!query.success) return reply.badRequest(query.error.message);

    const actor = req.user;
    const where = visibleLeaderStatsWhere(actor);

    if (canViewFullRanking(actor.role) && query.data.offset === 0) {
      // Fast path for coordinator first page: use the service helper
      const items = await getLeaderboard(query.data.limit);
      const total = await prisma.leaderStats.count({ where });
      return { total, items };
    }

    const [items, total] = await Promise.all([
      prisma.leaderStats.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { score: 'desc' },
        take: query.data.limit,
        skip: query.data.offset,
      }),
      prisma.leaderStats.count({ where }),
    ]);

    return { total, items };
  });

  /**
   * GET /engajamento/me
   * Retorna (ou cria com zeros) o LeaderStats do usuário autenticado.
   */
  app.get('/engajamento/me', { preHandler: app.authenticate }, async (req) => {
    return getLeaderStats(req.user.sub);
  });

  /**
   * GET /engajamento/stats/:userId
   * COORDENADOR pode consultar qualquer userId.
   * Outros papéis só podem consultar o próprio id.
   */
  app.get('/engajamento/stats/:userId', { preHandler: app.authenticate }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const actor = req.user;

    if (!canViewFullRanking(actor.role) && userId !== actor.sub) {
      return reply.forbidden('Acesso negado.');
    }

    return getLeaderStats(userId);
  });

  /**
   * GET /engajamento/ledger
   * Histórico de pontos paginado.
   * COORDENADOR pode filtrar por ?userId=. Outros recebem só o próprio.
   */
  app.get('/engajamento/ledger', { preHandler: app.authenticate }, async (req, reply) => {
    const query = ledgerQuerySchema.safeParse(req.query);
    if (!query.success) return reply.badRequest(query.error.message);

    const actor = req.user;
    const targetUserId =
      canViewFullRanking(actor.role) && query.data.userId
        ? query.data.userId
        : actor.sub;

    const [items, total] = await Promise.all([
      prisma.leaderPointsLedger.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: query.data.limit,
        skip: query.data.offset,
      }),
      prisma.leaderPointsLedger.count({ where: { userId: targetUserId } }),
    ]);

    return { total, items };
  });

  /**
   * POST /engajamento/recalculate
   * Recomputa LeaderStats de todos os usuários a partir dos dados-fonte.
   * Restrito a COORDENADOR.
   */
  app.post('/engajamento/recalculate', { preHandler: app.authenticate }, async (req, reply) => {
    if (!canRecalculateStats(req.user.role)) {
      return reply.forbidden('Apenas coordenadores podem recalcular o ranking.');
    }

    const recalculated = await recalculateRanking();
    return { recalculated };
  });
}
