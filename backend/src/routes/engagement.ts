import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  canViewLeaderboard,
  canViewUserEngagement,
} from '../lib/access.js';
import {
  getLeaderboard,
  getLeaderStats,
  getWeeklyLeaderboard,
} from '../lib/engagementService.js';

// ---------------------------------------------------------------------------
// Serializers — explicit allow-list, never return tenantId / raw timestamps
// the frontend doesn't need.
// ---------------------------------------------------------------------------

type RawStats = Awaited<ReturnType<typeof getLeaderStats>>;

const serializeStats = (s: RawStats, opts?: { includeEmail?: boolean }) => ({
  userId: s.userId,
  user: {
    id: s.user.id,
    name: s.user.name,
    role: s.user.role,
    ...(opts?.includeEmail ? { email: s.user.email } : {}),
  },
  score: s.score,
  rankingPosition: s.rankingPosition,
  totalIndications: s.totalIndications,
  weeklyIndications: s.weeklyIndications,
  monthlyIndications: s.monthlyIndications,
  totalConfirmed: s.totalConfirmed,
  totalPresent: s.totalPresent,
  currentStreak: s.currentStreak,
  lastActivityAt: s.lastActivityAt,
});

const paramsSchema = z.object({ id: z.string().min(1) });

export async function engagementRoutes(app: FastifyInstance) {
  // ── GET /engagement/me ──────────────────────────────────────────────────
  // Estatísticas do usuário logado. Cria registro com zeros se ainda não existir.
  app.get('/engagement/me', { preHandler: app.authenticate }, async (request) => {
    const stats = await getLeaderStats(request.user.sub);
    return { stats: serializeStats(stats, { includeEmail: true }) };
  });

  // ── GET /engagement/leaderboard ─────────────────────────────────────────
  // Ranking geral (top 10). COORDENADOR e VERIFICADORA veem todos;
  // LIDER_REGIONAL recebe apenas o próprio registro.
  app.get('/engagement/leaderboard', { preHandler: app.authenticate }, async (request) => {
    if (canViewLeaderboard(request.user.role)) {
      const items = await getLeaderboard(10);
      return { items: items.map((s) => serializeStats(s)) };
    }

    // LIDER_REGIONAL e demais: vê só o próprio
    const own = await getLeaderStats(request.user.sub);
    return { items: [serializeStats(own)] };
  });

  // ── GET /engagement/leaderboard/weekly ─────────────────────────────────
  // Ranking semanal (top 10) — soma de pontos dos últimos 7 dias do ledger.
  // Mesma regra de visibilidade do ranking geral.
  app.get(
    '/engagement/leaderboard/weekly',
    { preHandler: app.authenticate },
    async (request) => {
      if (canViewLeaderboard(request.user.role)) {
        const items = await getWeeklyLeaderboard(10);
        return {
          items: items.map((it) => ({
            userId: it.userId,
            user: { id: it.user.id, name: it.user.name, role: it.user.role },
            weeklyPoints: it.weeklyPoints,
            rankingPosition: it.rankingPosition,
          })),
        };
      }

      // LIDER_REGIONAL: calcula apenas o próprio total semanal
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [agg, user] = await Promise.all([
        prisma.leaderPointsLedger.aggregate({
          where: { userId: request.user.sub, createdAt: { gte: weekAgo } },
          _sum: { points: true },
        }),
        prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { id: true, name: true, role: true },
        }),
      ]);

      if (!user) return { items: [] };

      return {
        items: [
          {
            userId: user.id,
            user,
            weeklyPoints: agg._sum.points ?? 0,
            rankingPosition: null,
          },
        ],
      };
    }
  );

  // ── GET /engagement/users/:id ──────────────────────────────────────────
  // Permitido apenas para COORDENADOR ou VERIFICADORA.
  app.get('/engagement/users/:id', { preHandler: app.authenticate }, async (request, reply) => {
    if (!canViewUserEngagement(request.user.role)) {
      return reply.code(403).send({ error: 'Acesso negado.' });
    }

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID inválido.' });

    const userExists = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { id: true },
    });
    if (!userExists) return reply.code(404).send({ error: 'Usuário não encontrado.' });

    const stats = await getLeaderStats(params.data.id);
    return { stats: serializeStats(stats, { includeEmail: true }) };
  });
}
