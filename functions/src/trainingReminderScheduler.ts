/**
 * trainingReminderScheduler — Scheduled Cloud Function.
 *
 * PURPOSE
 * ───────
 * Sends a morning reminder to users who have a training session scheduled
 * for today but have not yet completed it.
 *
 * DATA SOURCE
 * ───────────
 * Collection: `userSchedule`
 * Doc ID format: `{uid}_{YYYY-MM-DD}`
 * Doc shape: { userId, date, entries: UserScheduleEntry[], updatedAt }
 *
 * The reminder content is derived from the scheduled entry's `scheduledCategories`
 * field (already denormalised on the doc) so we don't need to fetch the full
 * program document. This fulfils the requirement to connect content to the actual
 * workout ("הכל קשור להכל").
 *
 * Category → Hebrew label mapping:
 *   strength    → "אימון כוח"
 *   cardio      → "ריצה"
 *   maintenance → "תרגול החזקה"
 *   walking     → "הליכה"
 *   (none)      → "אימון"
 *
 * SCHEDULE — PERSONALIZED PER-USER HOUR (was: single fixed 07:30 cron)
 * ──────────────────────────────────────────────────────────────────
 * Runs HOURLY, on the hour, Asia/Jerusalem. Each run only targets users
 * whose preferred hour matches THIS run's hour:
 *   - Preferred hour = the HOUR component of users/{uid}.lifestyle.reminders.
 *     runningTime ('HH:MM', set during onboarding's RunningScheduleStep).
 *     Matching is hour-bucketed — "18:05" and "18:55" both match the 18:00
 *     run; that's the tolerance window, inherent to hourly granularity
 *     rather than a separate ±minutes check.
 *   - No runningTime set → falls back to DEFAULT_HOUR (7), preserving the
 *     original 07:30-ish morning slot so nobody who never set a preference
 *     silently stops receiving reminders. (The exact minute shifts from
 *     :30 to :00 as a side effect of the clean hourly cron — the hour
 *     itself, 07, is unchanged.)
 *
 * Because targeting is now per-user-hour instead of one blanket safe-hour
 * (07:30), quiet hours are no longer bypassed (skipQuietHours: false) — a
 * user who set e.g. 02:00 as their preferred hour must not be pushed then.
 * push.service.ts's real quiet-hours check (22:00–07:00 Asia/Jerusalem)
 * applies exactly like any other event-driven push. This also means a
 * quiet-hour preference simply gets no reminder that day, rather than
 * being deferred or rerouted to a different hour — same "suppress, never
 * defer" behavior as every other channel in this system.
 *
 * ONCE-PER-DAY GUARD
 * ──────────────────
 * Since this now runs 24×/day against the SAME today's userSchedule query,
 * an explicit guard (independent of the channel's own 22h rate cap, which
 * is a rolling window, not a calendar-day one) stamps
 * `push_rate/{uid}.trainingReminderSentDate` ('YYYY-MM-DD', Asia/Jerusalem)
 * the moment a uid is selected for this run's send batch — before we even
 * know whether push.service.ts's own checks (quiet hours / prefs / rate
 * cap) end up delivering it. That's deliberate: once a user's designated
 * hour has been evaluated for today (delivered, or legitimately
 * suppressed), there's no correct fallback hour to retry at — retrying
 * later would defeat the whole point of a personalized hour.
 *
 * ENVIRONMENT VARIABLES (optional overrides for testing)
 * ───────────────────────────────────────────────────────
 *   TRAINING_REMINDER_BATCH    — max docs to process per run (default 500)
 *   TRAINING_REMINDER_TEST_MODE — if 'true', logs intent, skips FCM + writes
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

const BATCH_LIMIT = (() => {
  const raw = Number(process.env.TRAINING_REMINDER_BATCH);
  return Number.isFinite(raw) && raw > 0 && raw <= 1000 ? raw : 500;
})();

const TEST_MODE = process.env.TRAINING_REMINDER_TEST_MODE === 'true';

/** Fallback hour for users who never set lifestyle.reminders.runningTime — matches the original fixed cron's hour. */
const DEFAULT_HOUR = 7;

const USER_FETCH_BATCH = 100; // Firestore getAll() limit, same convention as push.service.ts
const RATE_FETCH_BATCH = 100;
const GUARD_WRITE_BATCH = 400; // mirrors push.service.ts's PRUNE_BATCH_SIZE

// ─── Category → label ─────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'אימון כוח',
  cardio: 'ריצה',
  maintenance: 'תרגול החזקה',
  walking: 'הליכה',
};

function categoryLabel(categories: string[] | undefined): string {
  if (!categories || categories.length === 0) return 'אימון';
  const labels = categories
    .map((c) => CATEGORY_LABEL[c])
    .filter(Boolean);
  return labels.length > 0 ? labels.join(' + ') : 'אימון';
}

// ─── Body templates ───────────────────────────────────────────────────────────
// Rotated once per day (not per-user) so the copy stays fresh day-to-day while
// preserving same-day batching (all users on a given day share one message key).
const BODY_VARIANTS: string[] = [
  'האימון שלך מחכה — פתח את האפליקציה ותתחיל.',
  'הזמן שלך להתאמן הגיע. אפילו 15 דקות עושות את ההבדל 💪',
  'רגע קטן לעצמך היום — האימון שלך מוכן ומחכה בפארק.',
];

/** Deterministic day-of-year index so every user in a single run gets the same body. */
function pickBody(): string {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return BODY_VARIANTS[dayOfYear % BODY_VARIANTS.length];
}

/** Build push content from a scheduled entry's categories. */
function buildMessage(workoutLabel: string, startTime?: string): { title: string; body: string } {
  const timeHint = startTime ? ` ב-${startTime}` : ' היום';
  return {
    title: `📅 ${workoutLabel}${timeHint}`,
    body: pickBody(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return today's ISO date string in Israel timezone (YYYY-MM-DD). */
function todayISO(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
}

/** Return the current hour (0-23) in Israel timezone. */
function currentHourIST(): number {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getHours();
}

/**
 * Parse the HOUR component out of a 'HH:MM' preference string. Returns null
 * for anything absent/malformed, so callers can fall back to DEFAULT_HOUR
 * without conflating "no preference" with "preference is hour 0".
 */
function parsePreferredHour(runningTime: unknown): number | null {
  if (typeof runningTime !== 'string') return null;
  const match = runningTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
  return hh;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const trainingReminderScheduler = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    const dateStr = todayISO();
    const currentHour = currentHourIST();
    logger.info(
      `[training-reminder] Starting run for date=${dateStr} hour=${currentHour} ` +
        `batchLimit=${BATCH_LIMIT} testMode=${TEST_MODE}`,
    );

    // Query all userSchedule docs for today.
    let docs: admin.firestore.QueryDocumentSnapshot[];
    try {
      const snap = await db
        .collection('userSchedule')
        .where('date', '==', dateStr)
        .limit(BATCH_LIMIT)
        .get();
      docs = snap.docs;
    } catch (err: unknown) {
      logger.error('[training-reminder] Firestore query failed', err);
      return;
    }

    logger.info(`[training-reminder] ${docs.length} schedule doc(s) found for ${dateStr}`);

    // ── Pass 1: find candidates with an uncompleted training entry today ───
    interface Candidate {
      uid: string;
      workoutLabel: string;
      startTime?: string;
    }

    const candidates: Candidate[] = [];

    for (const doc of docs) {
      const data = doc.data() as {
        userId?: string;
        entries?: Array<{
          type?: string;
          completed?: boolean;
          scheduledCategories?: string[];
          startTime?: string;
        }>;
      };

      const uid = data.userId;
      if (!uid) continue;

      const entries = Array.isArray(data.entries) ? data.entries : [];
      // Find first uncompleted training entry for today
      const trainEntry = entries.find(
        (e) => e.type === 'training' && e.completed !== true,
      );
      if (!trainEntry) continue;

      // Skip if the workout's startTime has already passed (no point reminding after the fact)
      if (trainEntry.startTime) {
        const [hh, mm] = trainEntry.startTime.split(':').map(Number);
        if (Number.isFinite(hh) && Number.isFinite(mm)) {
          const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
          if (hh * 60 + mm <= nowIST.getHours() * 60 + nowIST.getMinutes()) continue;
        }
      }

      candidates.push({
        uid,
        workoutLabel: categoryLabel(trainEntry.scheduledCategories),
        startTime: trainEntry.startTime,
      });
    }

    logger.info(`[training-reminder] ${candidates.length} candidate(s) with uncompleted training today`);

    if (candidates.length === 0) return;

    // ── Pass 2: resolve each candidate's preferred hour, keep only this run's hour ──
    const preferredHourByUid = new Map<string, number>();
    for (let i = 0; i < candidates.length; i += USER_FETCH_BATCH) {
      const slice = candidates.slice(i, i + USER_FETCH_BATCH);
      const refs = slice.map((c) => db.collection('users').doc(c.uid));
      let userDocs: admin.firestore.DocumentSnapshot[];
      try {
        userDocs = await db.getAll(...refs);
      } catch (err: unknown) {
        logger.warn('[training-reminder] users getAll failed for a batch, defaulting hour', err);
        slice.forEach((c) => preferredHourByUid.set(c.uid, DEFAULT_HOUR));
        continue;
      }
      userDocs.forEach((snap, idx) => {
        const uid = slice[idx].uid;
        const runningTime = snap.exists
          ? (snap.data() as Record<string, any>)?.lifestyle?.reminders?.runningTime
          : undefined;
        const parsed = parsePreferredHour(runningTime);
        preferredHourByUid.set(uid, parsed ?? DEFAULT_HOUR);
      });
    }

    const hourMatched = candidates.filter(
      (c) => preferredHourByUid.get(c.uid) === currentHour,
    );

    logger.info(`[training-reminder] ${hourMatched.length} candidate(s) match this run's hour=${currentHour}`);

    if (hourMatched.length === 0) return;

    // ── Pass 3: once-per-day guard — skip anyone already handled today ─────
    const alreadySentToday = new Set<string>();
    for (let i = 0; i < hourMatched.length; i += RATE_FETCH_BATCH) {
      const slice = hourMatched.slice(i, i + RATE_FETCH_BATCH);
      const refs = slice.map((c) => db.collection('push_rate').doc(c.uid));
      let rateDocs: admin.firestore.DocumentSnapshot[];
      try {
        rateDocs = await db.getAll(...refs);
      } catch (err: unknown) {
        logger.warn('[training-reminder] push_rate getAll failed for a batch, assuming not-yet-sent', err);
        continue;
      }
      rateDocs.forEach((snap, idx) => {
        if (!snap.exists) return;
        const data = snap.data() as Record<string, unknown>;
        if (data.trainingReminderSentDate === dateStr) {
          alreadySentToday.add(slice[idx].uid);
        }
      });
    }

    const targets = hourMatched.filter((c) => !alreadySentToday.has(c.uid));

    logger.info(
      `[training-reminder] ${targets.length} target(s) after once-per-day guard ` +
        `(${alreadySentToday.size} already handled today)`,
    );

    if (targets.length === 0) return;

    if (TEST_MODE) {
      targets.forEach((t) =>
        logger.warn(
          `[training-reminder] TEST_MODE — would push uid=${t.uid} ` +
            `workout="${t.workoutLabel}" startTime=${t.startTime ?? 'none'} hour=${currentHour}`,
        ),
      );
      return;
    }

    // ── Group by message so we batch-send identical content together ──────
    // Key = "title|body" to allow reuse of same sendPush call for same workout type
    const byMessage = new Map<string, { uids: string[]; title: string; body: string }>();

    for (const t of targets) {
      const msg = buildMessage(t.workoutLabel, t.startTime);
      const key = `${msg.title}|${msg.body}`;
      if (!byMessage.has(key)) {
        byMessage.set(key, { uids: [], title: msg.title, body: msg.body });
      }
      byMessage.get(key)!.uids.push(t.uid);
    }

    let totalDelivered = 0;

    for (const [, { uids, title, body }] of Array.from(byMessage.entries()) as [string, { uids: string[]; title: string; body: string }][]) {
      try {
        const result = await sendPush({
          toUids: uids,
          channel: 'training_reminder',
          title,
          body,
          deepLink: '/',
          data: { triggerType: 'ScheduledWorkout', date: dateStr },
          rateCapHours: 22, // ~1 per day — slightly under 24h to avoid drift
          // Personalized-hour sends must respect quiet hours — unlike the old
          // single blanket 07:30 run (always safely outside 22:00-07:00), a
          // user-chosen hour can legitimately fall inside the quiet window.
          skipQuietHours: false,
        });
        totalDelivered += result.delivered;
        logger.info(
          `[training-reminder] "${title}" uids=${uids.length} ` +
            `result=${JSON.stringify(result)}`,
        );
      } catch (err: unknown) {
        logger.error(`[training-reminder] sendPush failed for "${title}"`, err);
      }
    }

    // ── Stamp the once-per-day guard for every uid this run decided to
    // handle — regardless of whether sendPush ultimately delivered,
    // suppressed (quiet hours/prefs), or failed. This hour's decision for
    // these users is final for today; there's no correct hour to retry at. ──
    for (let i = 0; i < targets.length; i += GUARD_WRITE_BATCH) {
      const slice = targets.slice(i, i + GUARD_WRITE_BATCH);
      const batch = db.batch();
      slice.forEach((t) => {
        batch.set(
          db.collection('push_rate').doc(t.uid),
          { trainingReminderSentDate: dateStr },
          { merge: true },
        );
      });
      try {
        await batch.commit();
      } catch (err: unknown) {
        logger.warn('[training-reminder] once-per-day guard write failed for a batch', err);
      }
    }

    logger.info(
      `[training-reminder] Run complete — hour=${currentHour} targets=${targets.length} delivered=${totalDelivered}`,
    );
  },
);
