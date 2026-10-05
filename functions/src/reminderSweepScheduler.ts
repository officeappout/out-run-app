/**
 * reminderSweepScheduler — Scheduled Cloud Function.
 *
 * PURPOSE
 * ───────
 * Part B of the workout-reminders build (scheduling-capability-audit.md +
 * the follow-up "cheap path" decision). Sends a push to users who configured
 * a reminder slot via the SettingsModal "תזכורות אימון" accordion — a
 * per-weekday {day, time} preference, NOT the per-date userSchedule
 * entries the existing hourly `trainingReminderScheduler` already serves.
 * Deliberately NOT unified with that scheduler — two separate systems by
 * explicit decision; de-dup across them is a later call.
 *
 * DATA SOURCE
 * ───────────
 * `users/{uid}.lifestyle.reminders.schedule` — ReminderSlot[], each
 * `{ day: 'sunday'|...|'saturday', time: 'HH:MM' }` on a 5-minute grid
 * (src/features/user/core/types/user.types.ts).
 *
 * SCHEDULE — 5-MINUTE GRID
 * ─────────────────────────
 * Runs every 5 minutes, Asia/Jerusalem (see the `schedule` string in the
 * export below — NOT repeated here as a literal cron expression, since
 * its "star slash 5" shape would prematurely close this very comment
 * block), aligned to the same grid the DrumTimePicker offers
 * (:00/:05/:10/…/:55) — a slot set at 18:00 fires within this run's
 * 5-minute window, not rounded to the hour like the sibling scheduler.
 *
 * MATCH QUERY
 * ───────────
 * `users` where `lifestyle.reminders.schedule array-contains { day, time }`
 * — an exact-shape match against the CURRENT weekday + 5-min-floored time.
 * Cheap (single array-contains condition, Firestore auto-indexes array
 * fields), but genuinely new in this codebase: array-contains against an
 * OBJECT value requires every field to match exactly — if ReminderSlot ever
 * gains a field, this silently stops matching. Covered by
 * reminderSweepScheduler.emulator.test.ts against a REAL Firestore
 * emulator, not just a fake-db mock, specifically because of that risk
 * (axiom §31's lesson — a fake db can't catch a real query-shape bug).
 *
 * IDEMPOTENCY
 * ───────────
 * `reminder_fired/{uid}_{YYYY-MM-DD}_{HHMM}` — claimed via `.create()`
 * (atomic test-and-set: throws ALREADY_EXISTS if present) BEFORE sending.
 * Scoped to the calendar date (not just day-of-week) so next week's
 * occurrence of the same slot isn't blocked. Mirrors the `xpReversed`
 * marker pattern (axiom §2) and trainingReminderScheduler's own
 * once-per-day guard philosophy: claimed the moment a slot is evaluated,
 * regardless of whether sendPush ultimately delivers, suppresses, or
 * fails — there's no correct time to retry at.
 *
 * SAFEGUARDS
 * ──────────
 * - Flag-gated: app_config/feature_flags.enableReminderSweepPush, default
 *   false/absent — fails CLOSED (abort) on a read error too, same posture
 *   as onPlannedActivityCreated.ts.
 * - Channel preference + daily engagement cap: NOT reimplemented here —
 *   sendPush() already applies both (push.service.ts's documented
 *   pipeline step 1 + Stage 2 daily cap) for the `training_reminder`
 *   channel, same channel the sibling scheduler uses (one user-facing
 *   toggle governs both systems).
 * - Distinct funnel category (`measurement.category: 'ReminderSweep'`) —
 *   by explicit decision, NOT de-duped against the sibling scheduler's
 *   'ScheduledWorkout' category. A user who happens to have both a
 *   userSchedule entry and a reminders.schedule slot near the same time
 *   can get two pushes; this makes that visible in the panel rather than
 *   silently merging two different systems.
 *
 * ENVIRONMENT VARIABLES (optional overrides for testing)
 * ───────────────────────────────────────────────────────
 *   REMINDER_SWEEP_BATCH      — max matched docs to process per run (default 500)
 *   REMINDER_SWEEP_TEST_MODE  — if 'true', logs intent, skips the idempotency
 *                               claim + FCM send entirely
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const FEATURE_FLAGS_DOC = 'app_config/feature_flags';

const BATCH_LIMIT = (() => {
  const raw = Number(process.env.REMINDER_SWEEP_BATCH);
  return Number.isFinite(raw) && raw > 0 && raw <= 1000 ? raw : 500;
})();

const TEST_MODE = process.env.REMINDER_SWEEP_TEST_MODE === 'true';

type ReminderWeekday = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

const WEEKDAY_BY_INDEX: ReminderWeekday[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/** Current {day, time, dateStr, slotKey} in Asia/Jerusalem, time floored to the 5-min grid. */
function resolveCurrentSlot(): { day: ReminderWeekday; time: string; dateStr: string; slotKey: string } {
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = WEEKDAY_BY_INDEX[nowIST.getDay()];
  const flooredMinutes = Math.floor(nowIST.getMinutes() / 5) * 5;
  const time = `${String(nowIST.getHours()).padStart(2, '0')}:${String(flooredMinutes).padStart(2, '0')}`;
  const dateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jerusalem' });
  const slotKey = time.replace(':', '');
  return { day, time, dateStr, slotKey };
}

// Generic — this reminder slot carries no specific workout detail (unlike
// trainingReminderScheduler's userSchedule entries, which know a category).
// Rotated by day-of-year, same pattern as the sibling scheduler.
const BODY_VARIANTS: string[] = [
  'הזמן שקבעת לאימון הגיע — בוא נזוז 💪',
  'תזכורת: זה הזמן שלך להתאמן.',
  'רגע קטן לעצמך — האימון שקבעת מחכה.',
];

function pickBody(): string {
  const now = new Date();
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  return BODY_VARIANTS[dayOfYear % BODY_VARIANTS.length];
}

export const reminderSweepScheduler = onSchedule(
  {
    schedule: '*/5 * * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();

    // ── Flag gate — fail closed on a read error, same posture as
    // onPlannedActivityCreated.ts: a broken flag read must not silently
    // let a not-yet-approved sender start firing. ─────────────────────────
    let flagsData: Record<string, unknown> = {};
    try {
      const flagsSnap = await db.doc(FEATURE_FLAGS_DOC).get();
      flagsData = flagsSnap.exists ? (flagsSnap.data() as Record<string, unknown>) : {};
    } catch (err) {
      logger.error('[reminder-sweep] feature_flags read failed, aborting', err);
      return;
    }
    if (flagsData.enableReminderSweepPush !== true) {
      logger.info('[reminder-sweep] enableReminderSweepPush !== true, skipping');
      return;
    }

    const { day, time, dateStr, slotKey } = resolveCurrentSlot();
    logger.info(`[reminder-sweep] Starting run for day=${day} time=${time} date=${dateStr} batchLimit=${BATCH_LIMIT} testMode=${TEST_MODE}`);

    // ── Match query ─────────────────────────────────────────────────────
    let matchedUids: string[];
    try {
      const snap = await db
        .collection('users')
        .where('lifestyle.reminders.schedule', 'array-contains', { day, time })
        .limit(BATCH_LIMIT)
        .get();
      matchedUids = snap.docs.map((d) => d.id);
    } catch (err) {
      logger.error('[reminder-sweep] users query failed', err);
      return;
    }

    logger.info(`[reminder-sweep] ${matchedUids.length} user(s) matched day=${day} time=${time}`);
    if (matchedUids.length === 0) return;

    if (TEST_MODE) {
      matchedUids.forEach((uid) => logger.warn(`[reminder-sweep] TEST_MODE — would claim+push uid=${uid} day=${day} time=${time}`));
      return;
    }

    // ── Idempotency claim — atomic per-uid, BEFORE sending ─────────────
    const claimedUids: string[] = [];
    for (const uid of matchedUids) {
      const markerRef = db.collection('reminder_fired').doc(`${uid}_${dateStr}_${slotKey}`);
      try {
        await markerRef.create({
          uid,
          day,
          time,
          date: dateStr,
          firedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        claimedUids.push(uid);
      } catch (err: any) {
        if (err?.code === 6 || /ALREADY_EXISTS/i.test(String(err?.message))) {
          // Already fired this exact slot today (e.g. a retried/overlapping run) — expected, not an error.
          continue;
        }
        logger.warn(`[reminder-sweep] idempotency claim failed for uid=${uid}, skipping to be safe`, err);
      }
    }

    logger.info(`[reminder-sweep] ${claimedUids.length}/${matchedUids.length} uid(s) claimed (not already fired today)`);
    if (claimedUids.length === 0) return;

    const title = '⏰ זמן להתאמן';
    const body = pickBody();

    try {
      const result = await sendPush({
        toUids: claimedUids,
        channel: 'training_reminder',
        title,
        body,
        deepLink: '/',
        data: { triggerType: 'ReminderSweep', day, time },
        rateCapHours: 22, // same tolerance as trainingReminderScheduler
        skipQuietHours: false, // a user-chosen slot can legitimately fall in quiet hours — suppress, don't reroute
        measurement: {
          variantId: title,
          category: 'ReminderSweep', // distinct from trainingReminderScheduler's 'ScheduledWorkout' — by explicit decision, not de-duped
          persona: 'generic',
        },
      });
      logger.info(`[reminder-sweep] day=${day} time=${time} claimed=${claimedUids.length} result=${JSON.stringify(result)}`);
    } catch (err) {
      logger.error('[reminder-sweep] sendPush failed', err);
    }
  },
);
