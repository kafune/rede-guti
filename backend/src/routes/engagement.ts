import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  canRecalculateStats,
  canViewLeaderboard,
  canViewUserEngagement,
} from '../lib/access.js';
import {
  getLeaderboard,
  getLeaderStats,
  getWeeklyLeaderboard,
  recalculateRanking,
  scanAndAlertInactiveLeaders,
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

const ledgerQuerySchema = z.object({
  userId: z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

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
  // Visível para TODOS os papéis autenticados: o placar compartilhado é o
  // que move a competição saudável entre as lideranças.
  app.get(
    '/engagement/leaderboard/weekly',
    { preHandler: app.authenticate },
    async () => {
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
  );

  // ── GET /engagement/ledger ──────────────────────────────────────────────
  // Histórico de pontos paginado. COORDENADOR pode filtrar por ?userId=;
  // demais papéis recebem apenas o próprio histórico.
  app.get('/engagement/ledger', { preHandler: app.authenticate }, async (request, reply) => {
    const query = ledgerQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Parâmetros inválidos.' });

    const targetUserId =
      canViewUserEngagement(request.user.role) && query.data.userId
        ? query.data.userId
        : request.user.sub;

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

  // ── POST /engagement/recalculate ────────────────────────────────────────
  // Recomputa LeaderStats de todos os usuários a partir dos dados-fonte.
  // Restrito a COORDENADOR (crons usam /automation/recalculate).
  app.post('/engagement/recalculate', { preHandler: app.authenticate }, async (request, reply) => {
    if (!canRecalculateStats(request.user.role)) {
      return reply.code(403).send({ error: 'Apenas coordenadores podem recalcular o ranking.' });
    }

    const recalculated = await recalculateRanking();
    return { recalculated };
  });

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

  // ── POST /engagement/scan-inactive ─────────────────────────────────────
  // Job idempotente para detectar lideranças sem atividade nos últimos 7 dias
  // e disparar leader.inactive_7_days via webhook. Pode ser chamado por cron
  // do sistema, n8n ou manualmente. Apenas COORDENADOR.
  app.post(
    '/engagement/scan-inactive',
    { preHandler: app.authenticate },
    async (request, reply) => {
      if (!canRecalculateStats(request.user.role)) {
        return reply.code(403).send({ error: 'Acesso negado.' });
      }
      const result = await scanAndAlertInactiveLeaders();
      return reply.send(result);
    }
  );
}
