/**
 * user-activity — a user's last REAL activity, and how many days they've
 * been away, for the push schedulers (retention, reminders, step nudges,
 * admin "inactive users" broadcasts).
 *
 * WHY (18.10.2026)
 * ────────────────
 * `users/{uid}.lastActive` is written only at signup and at the onboarding
 * sync, never on a workout or an app open. Every scheduler that read it alone
 * treated a user who trained yesterday as "inactive since onboarding", e.g.
 * retentionScheduler sent "פספסת כמה ימים?" every 48h to active users, forever.
 *
 * SIGNALS (latest one wins)
 * ─────────────────────────
 * On the user doc (already in memory wherever a scheduler reads users):
 *   - lastActive                      Timestamp (signup / onboarding; the client
 *                                     now also stamps it on workout save and app open)
 *   - progression.lastActiveDate      'YYYY-MM-DD' (UTC), stamped on workout days
 *   - running.lastWorkoutDate         ISO string, stamped on run completion
 *   - fcmTokenMeta.{token}.lastSeenAt Timestamp, stamped on every native app
 *                                     launch (src/lib/native/push.ts) = last app open
 * One indexed query (only when the doc alone says "away"):
 *   - workouts where userId == uid orderBy date desc limit 1
 *     (composite index userId ASC + date DESC, already deployed)
 *
 * The pure parts (lastActivityFromUserData, daysAwayBetween,
 * retentionMilestoneFor, nextRetentionMilestone) are unit tested; the one
 * I/O helper (resolveLastActivityMs) takes the Firestore instance as an
 * argument so it never initializes anything on import.
 */

import type * as admin from 'firebase-admin';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TZ = 'Asia/Jerusalem';

// ─── Value parsing ────────────────────────────────────────────────────────────

/** Firestore Timestamp / Date / millis / ISO string / 'YYYY-MM-DD' → millis, or null. */
export function activityToMillis(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'string') {
    // 'YYYY-MM-DD' (progression.lastActiveDate, a UTC calendar day): noon UTC
    // lands on the same Israel calendar day.
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v;
    const ms = Date.parse(dateOnly);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof v === 'object') {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') {
      const ms = t.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return null;
}

function maxOf(values: Array<number | null>): number | null {
  let best: number | null = null;
  for (const v of values) if (v !== null && (best === null || v > best)) best = v;
  return best;
}

/** Latest app open across the user's devices (fcmTokenMeta.*.lastSeenAt), or null. */
export function lastAppOpenFromUserData(data: Record<string, unknown> | undefined): number | null {
  const meta = data?.fcmTokenMeta;
  if (!meta || typeof meta !== 'object') return null;
  return maxOf(
    Object.values(meta as Record<string, unknown>).map((m) =>
      m && typeof m === 'object' ? activityToMillis((m as Record<string, unknown>).lastSeenAt) : null,
    ),
  );
}

/**
 * The latest activity signal ON THE USER DOC (no I/O). null when the doc has
 * none at all. Callers that need certainty also check the workouts collection
 * (resolveLastActivityMs).
 */
export function lastActivityFromUserData(data: Record<string, unknown> | undefined): number | null {
  const progression = data?.progression as Record<string, unknown> | undefined;
  const running = data?.running as Record<string, unknown> | undefined;
  return maxOf([
    activityToMillis(data?.lastActive),
    activityToMillis(progression?.lastActiveDate),
    activityToMillis(running?.lastWorkoutDate),
    lastAppOpenFromUserData(data),
  ]);
}

// ─── Days away ────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' of an instant, in Israel. */
export function israelDateKey(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Whole Israel calendar days between the last activity and now: trained
 * Monday (any hour) → Tuesday = 1, next Monday = 7. Never negative (a clock
 * skewed future timestamp counts as today).
 */
export function daysAwayBetween(lastActivityMs: number, nowMs: number): number {
  const a = Date.parse(`${israelDateKey(lastActivityMs)}T00:00:00Z`);
  const b = Date.parse(`${israelDateKey(nowMs)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
}

// ─── Workouts lookup ──────────────────────────────────────────────────────────

/** Latest workouts.date for a user (indexed: userId ASC + date DESC), or null when none. Throws on query failure. */
export async function latestWorkoutMs(db: admin.firestore.Firestore, uid: string): Promise<number | null> {
  const snap = await db
    .collection('workouts')
    .where('userId', '==', uid)
    .orderBy('date', 'desc')
    .limit(1)
    .select('date')
    .get();
  if (snap.empty || snap.docs.length === 0) return null;
  return activityToMillis((snap.docs[0].data() as Record<string, unknown> | undefined)?.date);
}

/**
 * The user's last real activity: the user-doc signals, plus — only when the
 * doc alone says they've been away at least `queryWorkoutsIfAwayDays` days —
 * one indexed workouts query. Throws if that query fails, so callers can fail
 * SAFE (not send) rather than treat an unknown user as lapsed.
 */
export async function resolveLastActivityMs(
  db: admin.firestore.Firestore,
  uid: string,
  data: Record<string, unknown> | undefined,
  nowMs: number,
  queryWorkoutsIfAwayDays: number,
): Promise<number | null> {
  const fromDoc = lastActivityFromUserData(data);
  if (fromDoc !== null && daysAwayBetween(fromDoc, nowMs) < queryWorkoutsIfAwayDays) return fromDoc;
  const fromWorkouts = await latestWorkoutMs(db, uid);
  return maxOf([fromDoc, fromWorkouts]);
}

// ─── Retention milestones (owner-approved cadence, 18.10.2026) ───────────────

/**
 * One retention push per milestone per absence, then silence:
 *   d4  days 4–6   (one, a light check-in)
 *   d7  days 7–13  ("new week" framing)
 *   d14 days 14–29
 *   d30 day 30     (the last one, "the door is open")
 *   31+            nothing, until they train or open the app again
 * The windows (instead of exact days) let a milestone that was skipped
 * (rate cap, daily cap, Shabbat, a failed run) go out the next day. d30 is a
 * single day on purpose: nothing ever goes out after day 30.
 */
export type RetentionMilestone = 'd4' | 'd7' | 'd14' | 'd30';

export const RETENTION_MILESTONES: ReadonlyArray<{ id: RetentionMilestone; from: number; to: number }> = [
  { id: 'd4', from: 4, to: 6 },
  { id: 'd7', from: 7, to: 13 },
  { id: 'd14', from: 14, to: 29 },
  { id: 'd30', from: 30, to: 30 },
];

/** First day any retention push can go out under the cadence. */
export const RETENTION_FIRST_DAY = 4;
/** After this many days away: no retention, and (suppression flag) no reminders/step nudges. */
export const RETENTION_LAST_DAY = 30;

export function retentionMilestoneFor(daysAway: number): RetentionMilestone | null {
  for (const m of RETENTION_MILESTONES) if (daysAway >= m.from && daysAway <= m.to) return m.id;
  return null;
}

/** What `push_rate/{uid}` records about the current absence. */
export interface RetentionSentLog {
  /** lastActivityMs the absence is measured from — a new activity starts a new absence. */
  anchor: number | null;
  sent: RetentionMilestone[];
}

export function retentionSentLogFrom(rateData: Record<string, unknown> | undefined): RetentionSentLog {
  const anchor = typeof rateData?.retention_absenceAnchor === 'number' ? rateData.retention_absenceAnchor : null;
  const raw = rateData?.retention_milestonesSent;
  const sent = Array.isArray(raw)
    ? (raw.filter((m) => RETENTION_MILESTONES.some((x) => x.id === m)) as RetentionMilestone[])
    : [];
  return { anchor, sent };
}

/**
 * The milestone to send now, or null: none due today, or already sent during
 * THIS absence (same anchor). A different anchor (they came back and lapsed
 * again) resets the log.
 */
export function nextRetentionMilestone(
  daysAway: number,
  anchorMs: number,
  log: RetentionSentLog,
): RetentionMilestone | null {
  const m = retentionMilestoneFor(daysAway);
  if (!m) return null;
  if (log.anchor === anchorMs && log.sent.includes(m)) return null;
  return m;
}

/** The sent log after sending `m` for the absence anchored at `anchorMs`. */
export function recordRetentionMilestone(
  anchorMs: number,
  log: RetentionSentLog,
  m: RetentionMilestone,
): RetentionSentLog {
  const prior = log.anchor === anchorMs ? log.sent : [];
  return { anchor: anchorMs, sent: prior.includes(m) ? prior : [...prior, m] };
}

// ─── Feature flags (app_config/feature_flags) ────────────────────────────────

/**
 * retentionRealActivityGuard — default ON (absent = on; only an explicit
 *   false turns it off). Pure bug fix: retention is sent only when the REAL
 *   last activity is >= the inactivity threshold.
 * retentionMilestoneCadence — default OFF. The d4/d7/d14/d30 cadence above.
 * lapsedPushSuppression — default OFF. Training reminders + step nudges skip
 *   users away > 30 days, and anyone who got a retention push today.
 */
export interface ActivityFlags {
  realActivityGuard: boolean;
  milestoneCadence: boolean;
  lapsedSuppression: boolean;
}

export function activityFlagsFrom(flags: Record<string, unknown> | undefined): ActivityFlags {
  return {
    realActivityGuard: flags?.retentionRealActivityGuard !== false,
    milestoneCadence: flags?.retentionMilestoneCadence === true,
    lapsedSuppression: flags?.lapsedPushSuppression === true,
  };
}

/** Whether a retention push already went out to this user today (Israel date). */
export function retentionSentToday(rateData: Record<string, unknown> | undefined, nowMs: number): boolean {
  const last = activityToMillis(rateData?.retention_lastSentAt);
  return last !== null && israelDateKey(last) === israelDateKey(nowMs);
}

/**
 * app_config/feature_flags → ActivityFlags, cached for 60s per instance (the
 * reminder senders call sendPush once per user or copy group). A read failure
 * returns the defaults (guard on, cadence off, suppression off).
 */
const FLAGS_TTL_MS = 60_000;
let flagsCache: { at: number; flags: ActivityFlags } | null = null;

export async function readActivityFlags(db: admin.firestore.Firestore, nowMs: number = Date.now()): Promise<ActivityFlags> {
  if (flagsCache && nowMs - flagsCache.at < FLAGS_TTL_MS) return flagsCache.flags;
  let flags = activityFlagsFrom(undefined);
  try {
    const snap = await db.doc('app_config/feature_flags').get();
    flags = activityFlagsFrom(snap.data() as Record<string, unknown> | undefined);
  } catch {
    // keep the defaults
  }
  flagsCache = { at: nowMs, flags };
  return flags;
}

/** Test hook. */
export function resetActivityFlagsCache(): void {
  flagsCache = null;
}

/**
 * Why a training reminder / step nudge should be held back for this user
 * (suppression flag on), or null to send. Pure — `lastActivityMs` is the
 * user's real last activity (null = unknown → never suppressed).
 */
export function lapsedSuppressionReason(
  lastActivityMs: number | null,
  rateData: Record<string, unknown> | undefined,
  nowMs: number,
): 'retention_today' | 'lapsed_30' | null {
  if (retentionSentToday(rateData, nowMs)) return 'retention_today';
  if (lastActivityMs !== null && daysAwayBetween(lastActivityMs, nowMs) > RETENTION_LAST_DAY) return 'lapsed_30';
  return null;
}
