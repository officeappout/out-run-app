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
 *      OR lastActive is absent (user never logged a workout)
 *   3. settings.pushEnabled !== false
 *   4. settings.notificationPrefs.retention !== false (or absent — opt-out model)
 *   5. push_rate/{uid}.retention_lastSentAt older than COOLDOWN_HOURS
 *      (enforced by push.service.ts rate cap, not duplicated here)
 *
 * SCHEDULE
 * ────────
 * Runs daily at 10:00 Asia/Jerusalem. push.service.ts quiet-hours check is
 * bypassed (skipQuietHours=true) because 10:00 is always an active window.
 *
 * ENVIRONMENT VARIABLES (optional overrides for testing)
 * ───────────────────────────────────────────────────────
 *   RETENTION_INACTIVITY_DAYS  — days of inactivity before user is eligible (default 7)
 *   RETENTION_BATCH_LIMIT      — max users per run (default 200)
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

    const cutoff = admin.firestore.Timestamp.fromMillis(
      Date.now() - INACTIVITY_DAYS * MS_PER_DAY,
    );

    // Query completed-onboarding users who haven't been active recently.
    // NOTE: Users with no `lastActive` field are also candidates (never logged
    // a workout). We handle them by fetching all COMPLETED users and filtering
    // client-side, because Firestore doesn't support "field absent OR field < X"
    // in a single query.
    let docs: admin.firestore.QueryDocumentSnapshot[];
    try {
      const snap = await db
        .collection('users')
        .where('onboardingStatus', '==', 'COMPLETED')
        .limit(BATCH_LIMIT)
        .get();
      docs = snap.docs;
    } catch (err: unknown) {
      logger.error('[retention] Firestore query failed', err);
      return;
    }

    logger.info(`[retention] ${docs.length} COMPLETED user(s) fetched`);

    // Filter to inactivity candidates client-side.
    interface Candidate { uid: string; name: string; daysSince: number }
    const candidates: Candidate[] = [];

    for (const doc of docs) {
      const data = doc.data() as Record<string, unknown>;

      // Skip if push globally disabled
      const pushEnabled = (data?.settings as Record<string, unknown> | undefined)?.pushEnabled;
      if (pushEnabled === false) continue;

      // Skip if retention channel disabled
      const retentionPref = (
        (data?.settings as Record<string, unknown> | undefined)
          ?.notificationPrefs as Record<string, unknown> | undefined
      )?.retention;
      if (retentionPref === false) continue;

      // Check inactivity
      const lastActive = data?.lastActive;
      let daysSince: number;
      if (!lastActive) {
        daysSince = INACTIVITY_DAYS; // treat missing as inactive
      } else {
        const lastMs = toMillis(lastActive);
        if (lastMs === null) {
          daysSince = INACTIVITY_DAYS;
        } else {
          daysSince = Math.floor((Date.now() - lastMs) / MS_PER_DAY);
        }
      }

      if (daysSince < INACTIVITY_DAYS) continue;

      candidates.push({
        uid: doc.id,
        name: String((data?.core as Record<string, unknown> | undefined)?.name ?? ''),
        daysSince,
      });
    }

    logger.info(`[retention] ${candidates.length} inactivity candidate(s) after filter`);

    if (candidates.length === 0) return;

    if (TEST_MODE) {
      candidates.forEach((c) =>
        logger.warn(
          `[retention] TEST_MODE — would push uid=${c.uid} name="${c.name}" daysSince=${c.daysSince}`,
        ),
      );
      return;
    }

    // Group candidates by variant so we can batch-send per message text.
    // push.service.ts rate cap (24h) prevents double-sending across runs.
    const byVariant = new Map<number, Candidate[]>();
    candidates.forEach((c) => {
      const idx = variantIndex(c.uid);
      if (!byVariant.has(idx)) byVariant.set(idx, []);
      byVariant.get(idx)!.push(c);
    });

    let totalDelivered = 0;
    let totalSkipped = 0;

    for (const [idx, group] of Array.from(byVariant.entries()) as [number, Candidate[]][]) {
      const variant = VARIANTS[idx];

      // Use the first candidate's daysSince for the batch title/body
      // (all share the same template structure; individual days differ slightly,
      // but for broadcast efficiency we pick the group median).
      const medianDays = group[Math.floor(group.length / 2)].daysSince;
      const sampleName = group[0].name || 'חבר';

      const title = interpolate(variant.title, {
        name: sampleName,
        days_since: String(medianDays),
      });
      const body = interpolate(variant.body, {
        name: sampleName,
        days_since: String(medianDays),
      });

      const uids = group.map((c) => c.uid);

      try {
        const result = await sendPush({
          toUids: uids,
          channel: 'retention',
          title,
          body,
          deepLink: '/',
          data: { triggerType: 'Inactivity', daysSince: String(medianDays) },
          rateCapHours: 48,
          skipQuietHours: true,
        });
        totalDelivered += result.delivered;
        totalSkipped += result.skippedRateCap + result.skippedPrefs;
        logger.info(`[retention] variant=${idx} uids=${uids.length} result=${JSON.stringify(result)}`);
      } catch (err: unknown) {
        logger.error(`[retention] sendPush failed for variant=${idx}`, err);
      }
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
