import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import {
  getWeeklyLeaderboard,
  recalculateRanking,
  scanAndAlertInactiveLeaders,
} from '../lib/engagementService.js';

// ---------------------------------------------------------------------------
// Server-to-server endpoints consumed by scheduled jobs (n8n crons).
// All routes accept either AUTOMATION_API_TOKEN (Bearer) or a coordinator JWT.
// Payloads carry only what the automations need to compose WhatsApp messages.
// ---------------------------------------------------------------------------

const remindersQuerySchema = z.object({
  window: z.enum(['today', 'tomorrow']).default('tomorrow'),
});

const normalizePhone = (value: string | null | undefined) => {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
};

const buildConfirmacaoLink = (eventoId: string, indicadoId: string) => {
  const path = `#/eventos/${eventoId}/confirmacao?ind=${indicadoId}`;
  return config.appPublicUrl ? `${config.appPublicUrl}/${path}` : path;
};

export async function automationRoutes(app: FastifyInstance) {
  /**
   * POST /automation/recalculate
   * Rebuilds LeaderStats (weekly/monthly windows, score, ranking) from source
   * data. Schedule daily so the weekly counters stay truthful.
   */
  app.post('/automation/recalculate', { preHandler: app.requireAutomation }, async () => {
    const recalculated = await recalculateRanking();
    return { recalculated };
  });

  /**
   * POST /automation/scan-inactive
   * Fires leader.inactive_7_days webhooks for leaders without recent activity.
   * Idempotent (7-day cooldown ledger marker). Schedule daily.
   */
  app.post('/automation/scan-inactive', { preHandler: app.requireAutomation }, async () => {
    return scanAndAlertInactiveLeaders();
  });

  /**
   * GET /automation/event-reminders?window=today|tomorrow
   * Events happening in the requested window plus their APROVADO/CONFIRMADO
   * guests, ready for a reminder broadcast.
   */
  app.get('/automation/event-reminders', { preHandler: app.requireAutomation }, async (req, reply) => {
    const query = remindersQuerySchema.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: 'Parametro window invalido.' });
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (query.data.window === 'tomorrow') {
      start.setDate(start.getDate() + 1);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const eventos = await prisma.evento.findMany({
      where: {
        encerrado: false,
        data: { gte: start, lt: end },
      },
      select: {
        id: true,
        nome: true,
        data: true,
        hora: true,
        local: true,
        indicados: {
          where: { status: { in: ['APROVADO', 'CONFIRMADO'] } },
          select: {
            id: true,
            nome: true,
            telefone: true,
            status: true,
            lider: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { data: 'asc' },
    });

    return {
      window: query.data.window,
      eventos: eventos.map((evento) => ({
        id: evento.id,
        nome: evento.nome,
        data: evento.data,
        hora: evento.hora,
        local: evento.local,
        indicados: evento.indicados
          .map((ind) => ({
            id: ind.id,
            nome: ind.nome,
            telefone: normalizePhone(ind.telefone),
            status: ind.status,
            liderNome: ind.lider?.name ?? null,
            confirmacaoLink: buildConfirmacaoLink(evento.id, ind.id),
          }))
          .filter((ind) => ind.telefone),
      })),
    };
  });

  /**
   * GET /automation/weekly-leaderboard
   * Top-10 of the week (ledger points) for the coordinator summary broadcast.
   * Same shape as GET /engagement/leaderboard/weekly, but token-authenticated
   * so the n8n cron does not depend on a JWT that expires.
   */
  app.get('/automation/weekly-leaderboard', { preHandler: app.requireAutomation }, async () => {
    const items = await getWeeklyLeaderboard(10);
    return {
      items: items.map((it) => ({
        userId: it.userId,
        user: { id: it.user.id, name: it.user.name, role: it.user.role },
        weeklyPoints: it.weeklyPoints,
        rankingPosition: it.rankingPosition,
      })),
    };
  });

  /**
   * GET /automation/weekly-leader-summaries
   * One row per regional leader with a WhatsApp number: weekly points,
   * indications and ranking position — for the Monday summary broadcast.
   */
  app.get(
    '/automation/weekly-leader-summaries',
    { preHandler: app.requireAutomation },
    async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const leaders = await prisma.user.findMany({
        where: { role: 'LIDER_REGIONAL' },
        select: {
          id: true,
          name: true,
          devzappLink: true,
          leaderStats: {
            select: {
              score: true,
              rankingPosition: true,
              weeklyIndications: true,
              totalIndications: true,
            },
          },
        },
      });

      const weeklyPoints = await prisma.leaderPointsLedger.groupBy({
        by: ['userId'],
        where: {
          createdAt: { gte: weekAgo },
          userId: { in: leaders.map((l) => l.id) },
        },
        _sum: { points: true },
      });
      const pointsByUser = new Map(weeklyPoints.map((row) => [row.userId, row._sum.points ?? 0]));

      const summaries = leaders
        .map((leader) => ({
          userId: leader.id,
          userName: leader.name ?? '(sem nome)',
          phone: normalizePhone(leader.devzappLink),
          weeklyPoints: pointsByUser.get(leader.id) ?? 0,
          weeklyIndications: leader.leaderStats?.weeklyIndications ?? 0,
          totalIndications: leader.leaderStats?.totalIndications ?? 0,
          score: leader.leaderStats?.score ?? 0,
          rankingPosition: leader.leaderStats?.rankingPosition ?? null,
        }))
        .filter((summary) => summary.phone);

      return { total: summaries.length, summaries };
    }
  );
}
