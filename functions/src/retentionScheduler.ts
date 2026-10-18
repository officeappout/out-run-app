/**
 * retentionScheduler — Scheduled Cloud Function (v2 scheduler).
 *
 * PURPOSE
 * ───────
 * Re-engage users who completed onboarding but have stopped working out.
 * This complements onboardingDropoffDispatcher (which targets users who never
 * finished onboarding). Together the two functions cover the full lifecycle:
 *
 *   onboardingDropoffDispatcher  →  ghost users (onboardingStatus IN_PROGRESS)
 *   retentionScheduler           →  churning users (onboardingStatus COMPLETED,
 *                                   but no workout in INACTIVITY_THRESHOLD_DAYS)
 *
 * DETECTION
 * ─────────
 * A user is a retention candidate when ALL are true:
 *   1. onboardingStatus === 'COMPLETED'
 *   2. lastActive <= (now − INACTIVITY_THRESHOLD_DAYS)
 *      Users with NO lastActive are skipped (before 17.10.2026 they were
 *      treated as inactive forever and nudged every 48h regardless).
 *   3. settings.pushEnabled !== false
 *   4. settings.notificationPrefs.retention !== false (or absent — opt-out model)
 *   5. push_rate/{uid}.retention_lastSentAt older than COOLDOWN_HOURS
 *      (enforced by push.service.ts rate cap, not duplicated here)
 *
 * QUERY
 * ─────
 * where(onboardingStatus == COMPLETED) + where(lastActive <= cutoff),
 * orderBy(lastActive desc) — most recently churned first — cursor-paginated
 * in pages of RETENTION_BATCH_LIMIT, at most RETENTION_MAX_PAGES pages per run.
 * Composite index: onboardingStatus ASC + lastActive DESC. (Before 17.10.2026
 * this read 200 arbitrary COMPLETED users and filtered inactivity in memory,
 * so most inactive users were never reached.)
 *
 * MESSAGE
 * ───────
 * One sendPush() per user, with that user's own name and days-since in the
 * copy (before 17.10.2026 one title built from the first user's name was
 * multicast to the whole variant group).
 *
 * SCHEDULE
 * ────────
 * Runs daily at 10:00 Asia/Jerusalem. Quiet hours are NOT bypassed (10:00 is
 * an active window anyway — one uniform policy). On Shabbat/yom tov (opt-in
 * since 18.10.2026) only Shabbat observers (settings.shabbatObserver === true)
 * are skipped — in toRetentionCandidate(), from the doc already in memory;
 * sendPush() would drop them anyway. Everyone else runs as on any day.
 *
 * ENVIRONMENT VARIABLES (optional overrides for testing)
 * ───────────────────────────────────────────────────────
 *   RETENTION_INACTIVITY_DAYS  — days of inactivity before user is eligible (default 7)
 *   RETENTION_BATCH_LIMIT      — page size of the candidate query (default 200)
 *   RETENTION_MAX_PAGES        — max pages per run (default 10 → 2000 users)
 *   RETENTION_TEST_MODE        — if 'true', logs intent but skips FCM + Firestore writes
 *
 * COPY TEMPLATE
 * ─────────────
 * {days_since} placeholder is interpolated with the actual days-since-last-workout.
 * Messages rotate deterministically by uid to reduce repetition.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { isShabbatObserver, isShabbatOrYomTov } from './services/shabbat.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ─── Config ───────────────────────────────────────────────────────────────────

const INACTIVITY_DAYS = (() => {
  const raw = Number(process.env.RETENTION_INACTIVITY_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
})();

const BATCH_LIMIT = (() => {
  const raw = Number(process.env.RETENTION_BATCH_LIMIT);
  return Number.isFinite(raw) && raw > 0 && raw <= 500 ? raw : 200;
})();

const MAX_PAGES = (() => {
  const raw = Number(process.env.RETENTION_MAX_PAGES);
  return Number.isFinite(raw) && raw > 0 && raw <= 50 ? raw : 10;
})();

/** Parallel per-user sendPush() calls (each is a handful of reads + one FCM call). */
const SEND_CONCURRENCY = 10;

const TEST_MODE = process.env.RETENTION_TEST_MODE === 'true';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Message variants ─────────────────────────────────────────────────────────
// {days_since} — interpolated; {name} — interpolated if available.

const VARIANTS: Array<{ title: string; body: string }> = [
  {
    title: '💪 {name}, {days_since} ימים בלי אימון',
    body: 'הגוף שלך מחכה לך. אפילו 15 דקות ישנו את מצב הרוח שלך.',
  },
  {
    title: '🏃 {name}, הרצף שלך מחכה',
    body: 'עברו {days_since} ימים — לא מאוחר. צא לאימון אחד ותחזור לקצב.',
  },
  {
    title: '🔥 {name}, חזרת לאימון היום?',
    body: '{days_since} ימים אחרי — הפארק שלך מחכה. 10 דקות שמורות לך.',
  },
  {
    title: '⚡ {days_since} ימים — תפסיק את הנשירה',
    body: 'משתמשים שחוזרים אחרי הפסקה מגיעים לרמות גבוהות יותר. בוא נחזיר אותך.',
  },
];

function variantIndex(uid: string): number {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = ((hash << 5) - hash + uid.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % VARIANTS.length;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export interface RetentionCandidate {
  uid: string;
  name: string;
  daysSince: number;
}

/**
 * The push for ONE user — their own name (fallback 'חבר', as before) and
 * their own days-since. Exported for tests.
 */
export function buildRetentionMessage(c: RetentionCandidate): {
  variant: number;
  title: string;
  body: string;
} {
  const variant = variantIndex(c.uid);
  const vars = { name: c.name.trim() || 'חבר', days_since: String(c.daysSince) };
  return {
    variant,
    title: interpolate(VARIANTS[variant].title, vars),
    body: interpolate(VARIANTS[variant].body, vars),
  };
}

/**
 * Inactivity candidate from a users/{uid} doc, or null when the user should
 * be skipped (push/retention opted out, no usable lastActive, active more
 * recently than INACTIVITY_DAYS, or a Shabbat observer while
 * `inShabbatWindow`). Exported for tests.
 */
export function toRetentionCandidate(
  uid: string,
  data: Record<string, unknown>,
  nowMs: number = Date.now(),
  inShabbatWindow: boolean = false,
): RetentionCandidate | null {
  const settings = data?.settings as Record<string, unknown> | undefined;
  if (settings?.pushEnabled === false) return null;
  if (inShabbatWindow && isShabbatObserver(settings)) return null;
  const prefs = settings?.notificationPrefs as Record<string, unknown> | undefined;
  if (prefs?.retention === false) return null;

  // No lastActive → skip (never treated as "inactive forever").
  const lastMs = toMillis(data?.lastActive);
  if (lastMs === null) return null;
  const daysSince = Math.floor((nowMs - lastMs) / MS_PER_DAY);
  if (daysSince < INACTIVITY_DAYS) return null;

  return {
    uid,
    name: String((data?.core as Record<string, unknown> | undefined)?.name ?? ''),
    daysSince,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const retentionScheduler = onSchedule(
  {
    schedule: '0 10 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    logger.info(
      `[retention] Starting run — inactivityDays=${INACTIVITY_DAYS} ` +
        `batchLimit=${BATCH_LIMIT} testMode=${TEST_MODE}`,
    );

    // Shabbat/yom tov: observers only — filtered per user below.
    const inShabbatWindow = isShabbatOrYomTov();

    const nowMs = Date.now();
    const cutoff = admin.firestore.Timestamp.fromMillis(nowMs - INACTIVITY_DAYS * MS_PER_DAY);

    // Candidates = COMPLETED users whose lastActive <= cutoff, most recently
    // churned first, cursor-paginated. Users with no lastActive never match.
    // Composite index: onboardingStatus ASC + lastActive DESC.
    const candidates: RetentionCandidate[] = [];
    let fetched = 0;
    let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        let q = db
          .collection('users')
          .where('onboardingStatus', '==', 'COMPLETED')
          .where('lastActive', '<=', cutoff)
          .orderBy('lastActive', 'desc')
          .limit(BATCH_LIMIT);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        fetched += snap.docs.length;
        for (const doc of snap.docs) {
          const c = toRetentionCandidate(
            doc.id,
            doc.data() as Record<string, unknown>,
            nowMs,
            inShabbatWindow,
          );
          if (c) candidates.push(c);
        }
        if (snap.docs.length < BATCH_LIMIT) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
    } catch (err: unknown) {
      logger.error('[retention] Firestore query failed', err);
      if (candidates.length === 0) return;
      // Partial pages already read are still valid — send to those.
    }

    logger.info(
      `[retention] ${fetched} inactive COMPLETED user(s) fetched, ` +
        `${candidates.length} candidate(s) after pref filter`,
    );

    if (candidates.length === 0) return;

    if (TEST_MODE) {
      candidates.forEach((c) =>
        logger.warn(
          `[retention] TEST_MODE — would push uid=${c.uid} name="${c.name}" daysSince=${c.daysSince}`,
        ),
      );
      return;
    }

    // One send per user — each gets their own name + days-since.
    // push.service.ts rate cap (48h) prevents double-sending across runs.
    let totalDelivered = 0;
    let totalSkipped = 0;

    const sendOne = async (c: RetentionCandidate): Promise<void> => {
      const { variant, title, body } = buildRetentionMessage(c);
      try {
        const result = await sendPush({
          toUids: [c.uid],
          channel: 'retention',
          title,
          body,
          deepLink: '/',
          data: { triggerType: 'Inactivity', daysSince: String(c.daysSince) },
          rateCapHours: 48,
        });
        totalDelivered += result.delivered;
        totalSkipped +=
          result.skippedRateCap + result.skippedPrefs + result.skippedDailyCap +
          result.skippedQuietHours + result.skippedShabbat + result.skippedGlobalKill;
      } catch (err: unknown) {
        logger.error(`[retention] sendPush failed for uid=${c.uid} variant=${variant}`, err);
      }
    };

    for (let i = 0; i < candidates.length; i += SEND_CONCURRENCY) {
      await Promise.all(candidates.slice(i, i + SEND_CONCURRENCY).map(sendOne));
    }

    logger.info(
      `[retention] Run complete — candidates=${candidates.length} ` +
        `delivered=${totalDelivered} skipped=${totalSkipped}`,
    );
  },
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMillis(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null) {
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
  }
  return null;
}
