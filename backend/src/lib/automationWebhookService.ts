import { config } from '../config.js';
import { prisma } from '../db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | 'leader.points_awarded'
  | 'leader.weekly_goal_reached'
  | 'leader.inactive_7_days'
  | 'leader.top_rank_changed';

export type WebhookPayload = {
  eventType: WebhookEventType;
  userId: string;
  userName: string;
  score: number;
  totalIndications: number;
  weeklyIndications: number;
  rankingPosition: number | null;
  metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Sensitive-data filter for metadata
// ---------------------------------------------------------------------------
//
// Defense-in-depth: even though our internal callers never pass secrets,
// this filter strips any key whose name suggests credentials so a future
// caller cannot accidentally exfiltrate them.

const SENSITIVE_KEY_RE = /password|passwd|pwd|secret|token|hash|jwt|auth|cookie|session|credential/i;

const sanitizeMetadata = (
  meta?: Record<string, unknown>
): Record<string, unknown> | undefined => {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEY_RE.test(k)) continue;
    if (typeof v === 'string' && v.length > 500) continue; // also drop suspiciously long strings
    out[k] = v;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Low-level dispatcher — single source of truth for the HTTP call
// ---------------------------------------------------------------------------

/**
 * Sends a single POST to ENGAGEMENT_WEBHOOK_URL.
 * - No-op when the env var is not configured.
 * - 5s default timeout (overridable via ENGAGEMENT_WEBHOOK_TIMEOUT_MS).
 * - Never throws: errors are swallowed and logged with a sanitized message.
 * - Never logs the URL or the payload body.
 */
async function dispatchWebhook(payload: WebhookPayload): Promise<void> {
  const url = config.engagementWebhookUrl;
  if (!url) return;

  // Strict allow-list: only the documented top-level fields are sent.
  // This guarantees no surprise field (e.g. an embedded user record) leaks.
  const safeBody: WebhookPayload = {
    eventType: payload.eventType,
    userId: payload.userId,
    userName: payload.userName,
    score: payload.score,
    totalIndications: payload.totalIndications,
    weeklyIndications: payload.weeklyIndications,
    rankingPosition: payload.rankingPosition,
    metadata: sanitizeMetadata(payload.metadata),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.engagementWebhookTimeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safeBody),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Log only event type + userId + status. Never the URL or body.
      console.error(
        `[automationWebhook] ${safeBody.eventType} userId=${safeBody.userId} status=${res.status}`
      );
    }
  } catch (err) {
    const reason =
      err instanceof DOMException && err.name === 'AbortError'
        ? 'timeout'
        : err instanceof Error
          ? err.name
          : 'unknown';
    console.error(
      `[automationWebhook] ${safeBody.eventType} userId=${safeBody.userId} failed=${reason}`
    );
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Internal helper: fetch the minimal user + stats snapshot needed for the
// payload. Selects only safe fields — passwordHash is never read.
// ---------------------------------------------------------------------------

async function buildUserSnapshot(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!user) return null;

  const stats = await prisma.leaderStats.findUnique({
    where: { userId },
    select: {
      score: true,
      totalIndications: true,
      weeklyIndications: true,
      rankingPosition: true,
    },
  });

  return {
    userId: user.id,
    userName: user.name ?? '(sem nome)',
    score: stats?.score ?? 0,
    totalIndications: stats?.totalIndications ?? 0,
    weeklyIndications: stats?.weeklyIndications ?? 0,
    rankingPosition: stats?.rankingPosition ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API: typed emitters per event type
// ---------------------------------------------------------------------------

/**
 * Emits leader.points_awarded after any successful point-earning action.
 * Caller passes the awarded eventType + points in metadata for traceability.
 */
export async function emitPointsAwarded(args: {
  userId: string;
  awardedEventType: string;
  points: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!config.engagementWebhookUrl) return;

  const snap = await buildUserSnapshot(args.userId);
  if (!snap) return;

  await dispatchWebhook({
    eventType: 'leader.points_awarded',
    ...snap,
    metadata: {
      ...(args.metadata ?? {}),
      awardedEventType: args.awardedEventType,
      points: args.points,
    },
  });
}

/**
 * Emits leader.weekly_goal_reached when a leader crosses the weekly indication
 * threshold for the first time in the current week.
 */
export async function emitWeeklyGoalReached(args: {
  userId: string;
  goal: number;
}): Promise<void> {
  if (!config.engagementWebhookUrl) return;

  const snap = await buildUserSnapshot(args.userId);
  if (!snap) return;

  await dispatchWebhook({
    eventType: 'leader.weekly_goal_reached',
    ...snap,
    metadata: { goal: args.goal },
  });
}

/**
 * Emits leader.inactive_7_days for a leader with no activity in the last week.
 * Intended to be called from a scheduled job (e.g. nightly cron).
 */
export async function emitInactive7Days(args: {
  userId: string;
  lastActivityAt: Date | null;
}): Promise<void> {
  if (!config.engagementWebhookUrl) return;

  const snap = await buildUserSnapshot(args.userId);
  if (!snap) return;

  await dispatchWebhook({
    eventType: 'leader.inactive_7_days',
    ...snap,
    metadata: {
      lastActivityAt: args.lastActivityAt ? args.lastActivityAt.toISOString() : null,
    },
  });
}

/**
 * Emits leader.top_rank_changed when a leader moves up in the global ranking.
 * Intended to be called from recalculateRanking() once new positions are known.
 */
export async function emitTopRankChanged(args: {
  userId: string;
  previousPosition: number | null;
  newPosition: number;
}): Promise<void> {
  if (!config.engagementWebhookUrl) return;

  const snap = await buildUserSnapshot(args.userId);
  if (!snap) return;

  await dispatchWebhook({
    eventType: 'leader.top_rank_changed',
    ...snap,
    rankingPosition: args.newPosition, // override snapshot with the just-computed value
    metadata: {
      previousPosition: args.previousPosition,
      newPosition: args.newPosition,
      direction: args.previousPosition === null
        ? 'entered'
        : args.newPosition < args.previousPosition
          ? 'up'
          : 'down',
    },
  });
}

/**
 * Convenience helper for scheduled jobs: scans all users with no activity
 * in the last 7 days and emits leader.inactive_7_days for each.
 * Returns the count of webhooks dispatched.
 */
export async function scanAndEmitInactiveLeaders(): Promise<number> {
  if (!config.engagementWebhookUrl) return 0;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const inactive = await prisma.leaderStats.findMany({
    where: {
      OR: [
        { lastActivityAt: null },
        { lastActivityAt: { lt: sevenDaysAgo } },
      ],
    },
    select: { userId: true, lastActivityAt: true },
  });

  await Promise.all(
    inactive.map((row) =>
      emitInactive7Days({ userId: row.userId, lastActivityAt: row.lastActivityAt }).catch(
        () => undefined
      )
    )
  );

  return inactive.length;
}
