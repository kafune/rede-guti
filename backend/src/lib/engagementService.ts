import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Point table — single source of truth for all event types
// ---------------------------------------------------------------------------

export const POINT_VALUES = {
  'supporter.created':          10,
  'event.indication.created':   10,
  'event.indication.confirmed': 20,
  'event.indication.present':   50,
} as const satisfies Record<string, number>;

export type EngagementEventType = keyof typeof POINT_VALUES;

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------
//
// Each event type has a "scope field" inside its metadata. If that field is
// present, we treat (eventType, scopeField, scopeValue) as a unique award:
// calling the same increment helper twice with the same scope value is a
// no-op the second time.
//
// This protects against double-pointing when, for example, a coordinator
// toggles an EventoIndicado status CONFIRMADO → INDICADO → CONFIRMADO.

const SCOPE_FIELD_BY_EVENT: Record<EngagementEventType, string> = {
  'supporter.created':          'indicationId',
  'event.indication.created':   'eventoIndicadoId',
  'event.indication.confirmed': 'eventoIndicadoId',
  'event.indication.present':   'eventoIndicadoId',
};

async function isDuplicateAward(
  userId: string,
  eventType: EngagementEventType,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (!metadata) return false;

  const scopeField = SCOPE_FIELD_BY_EVENT[eventType];
  const scopeValue = metadata[scopeField];
  if (typeof scopeValue !== 'string' || !scopeValue) return false;

  const existing = await prisma.leaderPointsLedger.findFirst({
    where: {
      userId,
      eventType,
      metadata: { path: [scopeField], equals: scopeValue },
    },
    select: { id: true },
  });

  return existing !== null;
}

// ---------------------------------------------------------------------------
// Internal helper: ensure LeaderStats row exists, then increment score
// ---------------------------------------------------------------------------

async function upsertScore(
  userId: string,
  deltaScore: number,
  extraCreate: Record<string, unknown> = {},
  extraUpdate: Record<string, unknown> = {}
) {
  const now = new Date();
  await prisma.leaderStats.upsert({
    where: { userId },
    create: {
      userId,
      score: deltaScore,
      lastActivityAt: now,
      ...extraCreate,
    },
    update: {
      score: { increment: deltaScore },
      lastActivityAt: now,
      ...extraUpdate,
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records a generic point event in LeaderPointsLedger and updates the user's
 * score in LeaderStats (created automatically if absent).
 *
 * Use this for one-off or future event types. For the three standard
 * indication flows, prefer the typed helpers below.
 */
export async function awardPoints(
  userId: string,
  eventType: string,
  points: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await prisma.$transaction([
    prisma.leaderPointsLedger.create({
      data: {
        userId,
        eventType,
        points,
        ...(metadata !== undefined && { metadata }),
      },
    }),
    prisma.leaderStats.upsert({
      where: { userId },
      create: { userId, score: points, lastActivityAt: new Date() },
      update: { score: { increment: points }, lastActivityAt: new Date() },
    }),
  ]);
}

/**
 * Called when a new Indication (supporter) or EventoIndicado is created by a
 * leader. Increments totalIndications / weeklyIndications / monthlyIndications
 * and awards points.
 *
 * Default eventType is 'supporter.created'. Pass 'event.indication.created'
 * when the indication originates from an event form.
 */
export async function incrementLeaderIndication(
  userId: string,
  eventType: EngagementEventType = 'supporter.created',
  metadata?: Record<string, unknown>
): Promise<void> {
  if (await isDuplicateAward(userId, eventType, metadata)) return;

  const points = POINT_VALUES[eventType];
  const now = new Date();

  await prisma.$transaction([
    prisma.leaderPointsLedger.create({
      data: {
        userId,
        eventType,
        points,
        ...(metadata !== undefined && { metadata }),
      },
    }),
    prisma.leaderStats.upsert({
      where: { userId },
      create: {
        userId,
        totalIndications: 1,
        weeklyIndications: 1,
        monthlyIndications: 1,
        score: points,
        lastActivityAt: now,
      },
      update: {
        totalIndications: { increment: 1 },
        weeklyIndications: { increment: 1 },
        monthlyIndications: { increment: 1 },
        score: { increment: points },
        lastActivityAt: now,
      },
    }),
  ]);
}

/**
 * Called when an EventoIndicado transitions to CONFIRMADO for the first time.
 * Increments totalConfirmed and awards 'event.indication.confirmed' points.
 *
 * Guard against double-awarding: call only when previous status !== CONFIRMADO
 * and !== PRESENTE.
 */
export async function incrementLeaderConfirmed(
  userId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (await isDuplicateAward(userId, 'event.indication.confirmed', metadata)) return;

  const points = POINT_VALUES['event.indication.confirmed'];
  const now = new Date();

  await prisma.$transaction([
    prisma.leaderPointsLedger.create({
      data: {
        userId,
        eventType: 'event.indication.confirmed',
        points,
        ...(metadata !== undefined && { metadata }),
      },
    }),
    prisma.leaderStats.upsert({
      where: { userId },
      create: { userId, totalConfirmed: 1, score: points, lastActivityAt: now },
      update: { totalConfirmed: { increment: 1 }, score: { increment: points }, lastActivityAt: now },
    }),
  ]);
}

/**
 * Called when an EventoIndicado transitions to PRESENTE for the first time
 * (via check-in or manual status update).
 * Increments totalPresent and awards 'event.indication.present' points.
 *
 * Guard against double-awarding: call only when previous status !== PRESENTE.
 */
export async function incrementLeaderPresent(
  userId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (await isDuplicateAward(userId, 'event.indication.present', metadata)) return;

  const points = POINT_VALUES['event.indication.present'];
  const now = new Date();

  await prisma.$transaction([
    prisma.leaderPointsLedger.create({
      data: {
        userId,
        eventType: 'event.indication.present',
        points,
        ...(metadata !== undefined && { metadata }),
      },
    }),
    prisma.leaderStats.upsert({
      where: { userId },
      create: { userId, totalPresent: 1, score: points, lastActivityAt: now },
      update: { totalPresent: { increment: 1 }, score: { increment: points }, lastActivityAt: now },
    }),
  ]);
}

/**
 * Full recalculation of LeaderStats for all users from source data.
 * Overwrites counters and score; does NOT touch the ledger.
 * Reassigns rankingPosition in score-descending order.
 *
 * Use after bulk imports or as a nightly cron.
 */
export async function recalculateRanking(): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } });

  const now = new Date();
  const weekAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const results = await Promise.all(
    users.map(async (u) => {
      const [totalInd, weeklyInd, monthlyInd, totalConfirmed, totalPresent] =
        await Promise.all([
          prisma.indication.count({ where: { createdById: u.id } }),
          prisma.indication.count({ where: { createdById: u.id, createdAt: { gte: weekAgo } } }),
          prisma.indication.count({ where: { createdById: u.id, createdAt: { gte: monthAgo } } }),
          prisma.eventoIndicado.count({ where: { liderId: u.id, status: 'CONFIRMADO' } }),
          prisma.eventoIndicado.count({ where: { liderId: u.id, status: 'PRESENTE' } }),
        ]);

      const score =
        totalInd       * POINT_VALUES['supporter.created'] +
        totalConfirmed * POINT_VALUES['event.indication.confirmed'] +
        totalPresent   * POINT_VALUES['event.indication.present'];

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

  // Rewrite ranking_position in score-descending order
  const sorted = [...results].sort((a, b) => b.score - a.score);
  await Promise.all(
    sorted.map((s, idx) =>
      prisma.leaderStats.update({
        where: { id: s.id },
        data: { rankingPosition: idx + 1 },
      })
    )
  );

  return results.length;
}

/**
 * Returns the LeaderStats row for a user, creating it with zeros if absent.
 */
export async function getLeaderStats(userId: string) {
  return prisma.leaderStats.upsert({
    where: { userId },
    create: { userId },
    update: {},
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

/**
 * Returns the top-N leaders ordered by score descending.
 * Defaults to top 50.
 */
export async function getLeaderboard(limit = 50) {
  return prisma.leaderStats.findMany({
    orderBy: { score: 'desc' },
    take: limit,
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}
