import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  canRecalculateStats,
  canViewFullRanking,
  visibleLeaderStatsWhere,
} from '../lib/access.js';

const POINT_VALUES: Record<string, number> = {
  INDICATION_CREATED: 10,
  INDICATION_CONFIRMED: 20,
  EVENTO_PRESENTE: 30,
};

const rankingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const ledgerQuerySchema = z.object({
  userId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function engajamentoRoutes(app: FastifyInstance) {
  /**
   * GET /engajamento/ranking
   * Lista líderes ordenados por score descendente.
   * COORDENADOR vê todos; outros papéis veem apenas si mesmos.
   */
  app.get('/engajamento/ranking', async (req, reply) => {
    await req.jwtVerify();
    const actor = req.user as { sub: string; role: string };
    const query = rankingQuerySchema.safeParse(req.query);
    if (!query.success) return reply.badRequest(query.error.message);

    const where = visibleLeaderStatsWhere(actor);

    const [stats, total] = await Promise.all([
      prisma.leaderStats.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { score: 'desc' },
        take: query.data.limit,
        skip: query.data.offset,
      }),
      prisma.leaderStats.count({ where }),
    ]);

    return { total, items: stats };
  });

  /**
   * GET /engajamento/me
   * Stats do usuário autenticado. Cria registro com zeros se ainda não existir.
   */
  app.get('/engajamento/me', async (req, reply) => {
    await req.jwtVerify();
    const actor = req.user as { sub: string; role: string };

    const stats = await prisma.leaderStats.upsert({
      where: { userId: actor.sub },
      create: { userId: actor.sub },
      update: {},
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    return stats;
  });

  /**
   * GET /engajamento/ledger
   * Histórico de pontos.
   * COORDENADOR pode consultar qualquer userId via query param.
   * Outros papéis sempre recebem apenas o próprio ledger.
   */
  app.get('/engajamento/ledger', async (req, reply) => {
    await req.jwtVerify();
    const actor = req.user as { sub: string; role: string };
    const query = ledgerQuerySchema.safeParse(req.query);
    if (!query.success) return reply.badRequest(query.error.message);

    const targetUserId =
      canViewFullRanking(actor.role) && query.data.userId
        ? query.data.userId
        : actor.sub;

    const [entries, total] = await Promise.all([
      prisma.leaderPointsLedger.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: query.data.limit,
        skip: query.data.offset,
      }),
      prisma.leaderPointsLedger.count({ where: { userId: targetUserId } }),
    ]);

    return { total, items: entries };
  });

  /**
   * POST /engajamento/recalculate
   * Recalcula LeaderStats de todos os usuários a partir dos dados existentes.
   * Restrito a COORDENADOR.
   * Emite um ponto por indicação criada, por confirmação e por presença em evento.
   */
  app.post('/engajamento/recalculate', async (req, reply) => {
    await req.jwtVerify();
    const actor = req.user as { sub: string; role: string };

    if (!canRecalculateStats(actor.role)) {
      return reply.forbidden('Apenas coordenadores podem recalcular o ranking.');
    }

    const users = await prisma.user.findMany({ select: { id: true } });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      users.map(async (u) => {
        const [totalInd, weeklyInd, monthlyInd, totalConfirmed, totalPresent] =
          await Promise.all([
            prisma.indication.count({ where: { createdById: u.id } }),
            prisma.indication.count({
              where: { createdById: u.id, createdAt: { gte: weekAgo } },
            }),
            prisma.indication.count({
              where: { createdById: u.id, createdAt: { gte: monthAgo } },
            }),
            prisma.eventoIndicado.count({
              where: { liderId: u.id, status: 'CONFIRMADO' },
            }),
            prisma.eventoIndicado.count({
              where: { liderId: u.id, status: 'PRESENTE' },
            }),
          ]);

        const score =
          totalInd * POINT_VALUES.INDICATION_CREATED +
          totalConfirmed * POINT_VALUES.INDICATION_CONFIRMED +
          totalPresent * POINT_VALUES.EVENTO_PRESENTE;

        return prisma.leaderStats.upsert({
          where: { userId: u.id },
          create: {
            userId: u.id,
            totalIndications: totalInd,
            weeklyIndications: weeklyInd,
            monthlyIndications: monthlyInd,
            totalConfirmed,
            totalPresent,
            score,
            lastActivityAt: now,
          },
          update: {
            totalIndications: totalInd,
            weeklyIndications: weeklyInd,
            monthlyIndications: monthlyInd,
            totalConfirmed,
            totalPresent,
            score,
            lastActivityAt: now,
          },
        });
      })
    );

    // Atualiza ranking_position ordenando por score desc
    const sorted = [...results].sort((a, b) => b.score - a.score);
    await Promise.all(
      sorted.map((s, idx) =>
        prisma.leaderStats.update({
          where: { id: s.id },
          data: { rankingPosition: idx + 1 },
        })
      )
    );

    return { recalculated: results.length };
  });
}
