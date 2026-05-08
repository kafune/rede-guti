import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import {
  emitInactive7Days,
  emitPointsAwarded,
  emitTopRankChanged,
  emitWeeklyGoalReached,
} from './automationWebhookService.js';

// ---------------------------------------------------------------------------
// Point table — single source of truth for all event types
// ---------------------------------------------------------------------------

export const POINT_VALUES = {
  'supporter.created':          10,
  'event.indication.created':   10,
  'event.indication.confirmed': 20,
  'event.indication.present':   50,
} as const satisfies Record<string, number>;

export const WEEKLY_INDICATION_GOAL = 5;

type EngagementMetadata = Prisma.InputJsonObject;

// Fire-and-forget wrappers: webhooks must never break the engagement flow.
const fireAwarded = (
  userId: string,
  eventType: string,
  points: number,
  metadata?: EngagementMetadata
) =>
  void emitPointsAwarded({ userId, awardedEventType: eventType, points, metadata }).catch(
    () => undefined
  );

const fireWeeklyGoal = (userId: string) =>
  void emitWeeklyGoalReached({ userId, goal: WEEKLY_INDICATION_GOAL }).catch(() => undefined);

const fireRankChanged = (
  userId: string,
  previousPosition: number | null,
  newPosition: number
) =>
  void emitTopRankChanged({ userId, previousPosition, newPosition }).catch(() => undefined);

export type EngagementEventType = keyof typeof POINT_VALUES;

// ---------------------------------------------------------------------------
// ISO week helper — returns "YYYY-Www" for any date, e.g. "2026-W19"
// Used to scope the weekly_goal_reached dedup key.
// ---------------------------------------------------------------------------

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Sunday → 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // shift to nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

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
  metadata?: EngagementMetadata
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
  metadata?: EngagementMetadata
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

  fireAwarded(userId, eventType, points, metadata);
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
  metadata?: EngagementMetadata
): Promise<void> {
  if (await isDuplicateAward(userId, eventType, metadata)) return;

  const points = POINT_VALUES[eventType];
  const now = new Date();

  // Snapshot weeklyIndications before mutation so we can detect the
  // cross-the-threshold transition for the weekly_goal_reached webhook.
  const before = await prisma.leaderStats.findUnique({
    where: { userId },
    select: { weeklyIndications: true },
  });
  const previousWeekly = before?.weeklyIndications ?? 0;

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

  fireAwarded(userId, eventType, points, metadata);

  // Fire weekly_goal_reached only on the exact crossing, and at most once per
  // ISO week. A 0-point ledger entry (eventType='weekly_goal_reached') acts as
  // the dedup marker so a weekly counter reset cannot trigger a second dispatch.
  if (previousWeekly < WEEKLY_INDICATION_GOAL && previousWeekly + 1 >= WEEKLY_INDICATION_GOAL) {
    const weekKey = isoWeekKey(now);
    const alreadyFired = await prisma.leaderPointsLedger.findFirst({
      where: {
        userId,
        eventType: 'weekly_goal_reached',
        metadata: { path: ['weekKey'], equals: weekKey },
      },
      select: { id: true },
    });

    if (!alreadyFired) {
      await prisma.leaderPointsLedger.create({
        data: { userId, eventType: 'weekly_goal_reached', points: 0, metadata: { weekKey } },
      });
      fireWeeklyGoal(userId);
    }
  }
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
  metadata?: EngagementMetadata
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

  fireAwarded(userId, 'event.indication.confirmed', points, metadata);
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
  metadata?: EngagementMetadata
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

  fireAwarded(userId, 'event.indication.present', points, metadata);
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

  // Snapshot previous ranking positions for the top_rank_changed webhook.
  const previousPositions = new Map<string, number | null>();
  const beforeRows = await prisma.leaderStats.findMany({
    select: { userId: true, rankingPosition: true },
  });
  for (const row of beforeRows) previousPositions.set(row.userId, row.rankingPosition);

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

  // Emit leader.top_rank_changed for users who entered top 10 or moved up
  // within top 10. Avoids spamming webhooks for tail-rank reshuffles.
  const TOP_THRESHOLD = 10;
  for (let idx = 0; idx < sorted.length; idx++) {
    const newPos = idx + 1;
    if (newPos > TOP_THRESHOLD) break;
    const userId = sorted[idx].userId;
    const prevPos = previousPositions.get(userId) ?? null;
    const movedUp =
      prevPos === null ||
      prevPos > TOP_THRESHOLD ||
      newPos < prevPos;
    if (movedUp) fireRankChanged(userId, prevPos, newPos);
  }

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

// ---------------------------------------------------------------------------
// Inactive-leader scan
// ---------------------------------------------------------------------------
//
// Daily job (cron / n8n / protected endpoint) that detects leaders with no
// activity in the last INACTIVE_THRESHOLD_DAYS days, filters out those with
// no WhatsApp link cadastrado (devzappLink), dedupes against a 7-day cooldown
// window using the ledger, fires leader.inactive_7_days, and writes a
// 0-point ledger marker so the same leader is not alerted again until the
// cooldown elapses.

const INACTIVE_THRESHOLD_DAYS = 7;
const INACTIVE_ALERT_COOLDOWN_DAYS = 7;
const INACTIVE_ALERT_EVENT = 'inactive_alert_sent';

export type InactiveScanResult = {
  scanned: number;
  alerted: number;
  skippedNoPhone: number;
  skippedDeduped: number;
  skippedRoles: number;
};

export async function scanAndAlertInactiveLeaders(): Promise<InactiveScanResult> {
  const now = new Date();
  const inactiveBefore = new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const cooldownStart  = new Date(now.getTime() - INACTIVE_ALERT_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.leaderStats.findMany({
    where: {
      OR: [
        { lastActivityAt: null },
        { lastActivityAt: { lt: inactiveBefore } },
      ],
    },
    select: {
      userId: true,
      lastActivityAt: true,
      user: { select: { id: true, role: true, devzappLink: true } },
    },
  });

  let alerted = 0;
  let skippedNoPhone = 0;
  let skippedDeduped = 0;
  let skippedRoles = 0;

  for (const c of candidates) {
    // Only LIDER_REGIONAL is a target for inactivity alerts.
    if (c.user.role !== 'LIDER_REGIONAL') {
      skippedRoles++;
      continue;
    }

    const link = c.user.devzappLink?.trim();
    if (!link) {
      skippedNoPhone++;
      continue;
    }

    const recent = await prisma.leaderPointsLedger.findFirst({
      where: {
        userId: c.userId,
        eventType: INACTIVE_ALERT_EVENT,
        createdAt: { gte: cooldownStart },
      },
      select: { id: true },
    });
    if (recent) {
      skippedDeduped++;
      continue;
    }

    // Insert the dedup marker BEFORE firing the webhook so a crash mid-flight
    // never causes a double alert. Worst case: webhook fails and the leader
    // misses one cycle — preferable to spamming.
    await prisma.leaderPointsLedger.create({
      data: {
        userId: c.userId,
        eventType: INACTIVE_ALERT_EVENT,
        points: 0,
        metadata: {
          alertedAt: now.toISOString(),
          lastActivityAt: c.lastActivityAt ? c.lastActivityAt.toISOString() : null,
          cooldownDays: INACTIVE_ALERT_COOLDOWN_DAYS,
        },
      },
    });

    await emitInactive7Days({
      userId: c.userId,
      lastActivityAt: c.lastActivityAt,
      extraMetadata: { devzappLink: link },
    }).catch(() => undefined);

    alerted++;
  }

  return {
    scanned: candidates.length,
    alerted,
    skippedNoPhone,
    skippedDeduped,
    skippedRoles,
  };
}

/**
 * Returns the top-N leaders ranked by points earned in the last 7 days,
 * computed live from LeaderPointsLedger (independent of LeaderStats).
 * Defaults to top 10.
 */
export async function getWeeklyLeaderboard(limit = 10) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const grouped = await prisma.leaderPointsLedger.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: weekAgo } },
    _sum: { points: true },
    orderBy: { _sum: { points: 'desc' } },
    take: limit,
  });

  if (grouped.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, name: true, email: true, role: true },
  });

  const userById = new Map(users.map((u) => [u.id, u]));

  return grouped
    .map((g, idx) => {
      const user = userById.get(g.userId);
      if (!user) return null;
      return {
        userId: g.userId,
        weeklyPoints: g._sum.points ?? 0,
        rankingPosition: idx + 1,
        user,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
