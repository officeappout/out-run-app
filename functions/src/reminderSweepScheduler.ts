/**
 * reminderSweepScheduler — Scheduled Cloud Function.
 *
 * PURPOSE
 * ───────
 * Part B of the workout-reminders build (scheduling-capability-audit.md +
 * the follow-up "cheap path" decision). Runs TWO independent passes every
 * tick, each with its own flag gate, idempotency namespace, and funnel
 * category — neither pass's early-return affects the other:
 *
 *   1. SETTINGS-SLOT PASS (original, v1) — sends a push to users who
 *      configured a reminder slot via the SettingsModal "תזכורות אימון"
 *      accordion — a per-weekday {day, time} preference, source
 *      `users/{uid}.lifestyle.reminders.schedule` (ReminderSlot[],
 *      src/features/user/core/types/user.types.ts).
 *   2. WORKOUT-ENTRY PASS (v2, 06.10.2026) — fires a precise reminder
 *      ~leadMinutes before a scheduled userSchedule workout's own
 *      `startTime`, instead of leaving those entries to the sibling
 *      `trainingReminderScheduler`'s coarse per-user-hour reminder.
 *      Flag-gated OFF by default; when enabled, `trainingReminderScheduler`
 *      is gated (not removed) to stop double-sending for the same entry —
 *      see that file's own header for the reversible-via-flag mechanics.
 *
 * SCHEDULE — 5-MINUTE GRID
 * ─────────────────────────
 * Runs every 5 minutes, Asia/Jerusalem (see the `schedule` string in the
 * export below — NOT repeated here as a literal cron expression, since
 * its "star slash 5" shape would prematurely close this very comment
 * block), aligned to the same grid the DrumTimePicker offers
 * (:00/:05/:10/…/:55). Both passes share this one cron trigger — "reuse
 * the existing sweep, don't build a parallel scheduler" (David,
 * 06.10.2026) — rather than each owning a separate `onSchedule` export.
 *
 * PASS 1 — MATCH QUERY
 * ─────────────────────
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
 * PASS 2 — MATCH QUERY
 * ─────────────────────
 * `userSchedule` where `date == today` (same query shape
 * trainingReminderScheduler already uses) — then, in-memory, for every
 * uncompleted training entry with a `startTime`, floor
 * (startTime − leadMinutes) to the 5-minute grid and compare to the
 * current floored slot. Not expressible as a single Firestore query (the
 * lead-time subtraction is per-entry arithmetic) — same "fetch today,
 * filter in memory" shape the sibling scheduler already uses, just every
 * 5 minutes instead of hourly. `leadMinutes` is read from
 * `app_config/feature_flags.reminderSweepLeadMinutes` (default 10 when
 * absent/invalid).
 *
 * IDEMPOTENCY
 * ───────────
 * Two structurally DIFFERENT key shapes — chosen specifically so the two
 * passes can never collide or dedupe against each other, stronger than a
 * shared `kind` field would give:
 *   - Pass 1 (settings-slot): `reminder_fired/{uid}_{YYYY-MM-DD}_{HHMM}`
 *     (unchanged from v1).
 *   - Pass 2 (workout-entry): `reminder_fired/{uid}_{YYYY-MM-DD}_{HHMM}_workout_{entryId}`
 *     — a user can have multiple training entries the same day, so the
 *     entry id disambiguates, not just uid+date+time.
 * Both claimed via `.create()` (atomic test-and-set: throws ALREADY_EXISTS
 * if present) BEFORE sending, scoped to the calendar date (not just
 * day-of-week/recurrence) so a future occurrence of the same slot isn't
 * blocked. Mirrors the `xpReversed` marker pattern (axiom §2) and
 * trainingReminderScheduler's own once-per-day guard philosophy: claimed
 * the moment a slot is evaluated, regardless of whether sendPush
 * ultimately delivers, suppresses, or fails — there's no correct time to
 * retry at.
 *
 * SAFEGUARDS
 * ──────────
 * - Flag-gated: app_config/feature_flags.enableReminderSweepPush (master,
 *   gates the WHOLE function — both passes) and
 *   .reminderSweepWorkoutEntriesEnabled (pass 2 only), both default
 *   false/absent — fails CLOSED (abort pass 1, skip pass 2) on a read
 *   error, same posture as onPlannedActivityCreated.ts. (Note the sibling
 *   trainingReminderScheduler's OWN read of the same v2 flag fails OPEN
 *   instead — see that file's header for why the posture differs there.)
 * - Channel preference + rate cap + daily engagement cap: NOT
 *   reimplemented here — sendPush() already applies all three
 *   (push.service.ts's documented pipeline) for the `training_reminder`
 *   channel, same channel the sibling scheduler AND pass 2 use (one
 *   user-facing toggle governs all three senders). Verified empirically
 *   (reminderSweepScheduler.emulator.test.ts), NOT just assumed: because
 *   the rate cap (push_rate/{uid}.training_reminder_lastSentAt, 22h) is
 *   uid+channel scoped, not sender-scoped, if pass 1 and pass 2 BOTH match
 *   the same uid in the same tick, pass 1 (which runs first) sends and
 *   updates the cap, and pass 2's send is then correctly rate-capped to
 *   an empty token list before it ever reaches FCM — so in practice at
 *   most one of the two actually delivers within that window, even though
 *   each pass independently claims its own idempotency marker (an earlier
 *   draft of this comment claimed "both fire"; the emulator test
 *   disproved that and this was corrected to match).
 * - Distinct funnel categories per pass (`measurement.category`:
 *   'ReminderSweep' for pass 1, 'ReminderSweepWorkout' for pass 2, vs. the
 *   sibling scheduler's 'ScheduledWorkout') — so the panel can see each
 *   source separately even though the rate cap above means they don't
 *   usually BOTH deliver to the same uid in the same window. Pass 2 IS
 *   the sibling scheduler's gated replacement for entries with a
 *   startTime, by design.
 *
 * ENVIRONMENT VARIABLES (optional overrides for testing)
 * ───────────────────────────────────────────────────────
 *   REMINDER_SWEEP_BATCH      — max matched docs to process per run (default 500)
 *   REMINDER_SWEEP_TEST_MODE  — if 'true', logs intent, skips the idempotency
 *                               claim + FCM send entirely, for BOTH passes
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { categoryLabel, buildMessage } from './trainingReminderScheduler';

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

/** Fallback lead-time (minutes) when reminderSweepLeadMinutes is absent/invalid. */
const DEFAULT_LEAD_MINUTES = 10;

/**
 * Pass 2 helper: floors (startTime − leadMinutes) to the 5-minute grid, as
 * an 'HH:MM' string — the slot this entry's reminder should fire in.
 * Returns null for a malformed startTime or when the result would fall
 * before 00:00 — a lead time larger than the workout's own time-of-day is
 * a vanishingly rare edge case this sweep doesn't attempt to resolve
 * across a day boundary; the entry is simply never matched, never
 * crashes, never fires at the wrong time.
 */
function computeLeadTargetSlot(startTime: string, leadMinutes: number): string | null {
  const match = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const totalMinutes = Number(match[1]) * 60 + Number(match[2]) - leadMinutes;
  if (totalMinutes < 0) return null;
  const flooredMinutes = Math.floor(totalMinutes / 5) * 5;
  const hh = Math.floor(flooredMinutes / 60);
  const mm = flooredMinutes % 60;
  if (hh > 23) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Pass 1 — settings-slot (v1, unchanged). See file header. */
async function runSettingsSlotPass(db: admin.firestore.Firestore): Promise<void> {
  const { day, time, dateStr, slotKey } = resolveCurrentSlot();
  logger.info(`[reminder-sweep] Pass 1 (settings-slot) — day=${day} time=${time} date=${dateStr} batchLimit=${BATCH_LIMIT} testMode=${TEST_MODE}`);

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
    logger.error('[reminder-sweep] Pass 1 — users query failed', err);
    return;
  }

  logger.info(`[reminder-sweep] Pass 1 — ${matchedUids.length} user(s) matched day=${day} time=${time}`);
  if (matchedUids.length === 0) return;

  if (TEST_MODE) {
    matchedUids.forEach((uid) => logger.warn(`[reminder-sweep] Pass 1 — TEST_MODE — would claim+push uid=${uid} day=${day} time=${time}`));
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
      logger.warn(`[reminder-sweep] Pass 1 — idempotency claim failed for uid=${uid}, skipping to be safe`, err);
    }
  }

  logger.info(`[reminder-sweep] Pass 1 — ${claimedUids.length}/${matchedUids.length} uid(s) claimed (not already fired today)`);
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
    logger.info(`[reminder-sweep] Pass 1 — day=${day} time=${time} claimed=${claimedUids.length} result=${JSON.stringify(result)}`);
  } catch (err) {
    logger.error('[reminder-sweep] Pass 1 — sendPush failed', err);
  }
}

interface WorkoutEntryCandidate {
  uid: string;
  entryId: string;
  workoutLabel: string;
  startTime: string;
}

/**
 * Pass 2 — workout-entry (v2, 06.10.2026). Flag-gated by
 * reminderSweepWorkoutEntriesEnabled; no-ops entirely when off/absent, so
 * this pass is a pure addition with zero effect until explicitly enabled.
 */
async function runWorkoutEntryPass(db: admin.firestore.Firestore, flagsData: Record<string, unknown>): Promise<void> {
  if (flagsData.reminderSweepWorkoutEntriesEnabled !== true) {
    logger.info('[reminder-sweep] Pass 2 (workout-entry) — reminderSweepWorkoutEntriesEnabled !== true, skipping');
    return;
  }

  const rawLead = flagsData.reminderSweepLeadMinutes;
  const leadMinutes = typeof rawLead === 'number' && Number.isFinite(rawLead) && rawLead >= 0 && rawLead < 24 * 60
    ? rawLead
    : DEFAULT_LEAD_MINUTES;

  const { time: currentSlot, dateStr, slotKey } = resolveCurrentSlot();
  logger.info(`[reminder-sweep] Pass 2 (workout-entry) — currentSlot=${currentSlot} date=${dateStr} leadMinutes=${leadMinutes} batchLimit=${BATCH_LIMIT} testMode=${TEST_MODE}`);

  // ── Match query — same "fetch today, filter in memory" shape as
  // trainingReminderScheduler; lead-time subtraction is per-entry
  // arithmetic, not expressible as a single Firestore query. ───────────
  let docs: admin.firestore.QueryDocumentSnapshot[];
  try {
    const snap = await db
      .collection('userSchedule')
      .where('date', '==', dateStr)
      .limit(BATCH_LIMIT)
      .get();
    docs = snap.docs;
  } catch (err) {
    logger.error('[reminder-sweep] Pass 2 — userSchedule query failed', err);
    return;
  }

  const candidates: WorkoutEntryCandidate[] = [];
  for (const doc of docs) {
    const data = doc.data() as {
      userId?: string;
      entries?: Array<{ entryId?: string; type?: string; completed?: boolean; scheduledCategories?: string[]; startTime?: string }>;
    };
    const uid = data.userId;
    if (!uid) continue;
    const entries = Array.isArray(data.entries) ? data.entries : [];
    for (const e of entries) {
      if (e.type !== 'training' || e.completed === true || !e.startTime || !e.entryId) continue;
      const targetSlot = computeLeadTargetSlot(e.startTime, leadMinutes);
      if (targetSlot === currentSlot) {
        candidates.push({ uid, entryId: e.entryId, workoutLabel: categoryLabel(e.scheduledCategories), startTime: e.startTime });
      }
    }
  }

  logger.info(`[reminder-sweep] Pass 2 — ${candidates.length} entry candidate(s) match currentSlot=${currentSlot} (lead=${leadMinutes}m)`);
  if (candidates.length === 0) return;

  if (TEST_MODE) {
    candidates.forEach((c) => logger.warn(`[reminder-sweep] Pass 2 — TEST_MODE — would claim+push uid=${c.uid} entryId=${c.entryId} startTime=${c.startTime} leadMinutes=${leadMinutes}`));
    return;
  }

  // ── Idempotency claim — per entry, NOT per uid: a user can have
  // multiple training entries the same day. Key shape (`_workout_{entryId}`
  // suffix) is structurally distinct from Pass 1's — see file header. ────
  const claimed: WorkoutEntryCandidate[] = [];
  for (const c of candidates) {
    const markerRef = db.collection('reminder_fired').doc(`${c.uid}_${dateStr}_${slotKey}_workout_${c.entryId}`);
    try {
      await markerRef.create({
        uid: c.uid,
        entryId: c.entryId,
        date: dateStr,
        startTime: c.startTime,
        leadMinutes,
        firedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      claimed.push(c);
    } catch (err: any) {
      if (err?.code === 6 || /ALREADY_EXISTS/i.test(String(err?.message))) {
        continue; // already fired this exact entry+slot — expected, not an error
      }
      logger.warn(`[reminder-sweep] Pass 2 — idempotency claim failed for uid=${c.uid} entryId=${c.entryId}, skipping to be safe`, err);
    }
  }

  logger.info(`[reminder-sweep] Pass 2 — ${claimed.length}/${candidates.length} entr(y/ies) claimed (not already fired)`);
  if (claimed.length === 0) return;

  // ── Group by message, same reuse-the-category-copy approach as
  // trainingReminderScheduler — a user with a unique category/time gets
  // its own sendPush call, but identical messages batch together. ──────
  const byMessage = new Map<string, { uids: string[]; title: string; body: string }>();
  for (const c of claimed) {
    const msg = buildMessage(c.workoutLabel, c.startTime);
    const key = `${msg.title}|${msg.body}`;
    if (!byMessage.has(key)) byMessage.set(key, { uids: [], title: msg.title, body: msg.body });
    byMessage.get(key)!.uids.push(c.uid);
  }

  for (const [, { uids, title, body }] of byMessage) {
    try {
      const result = await sendPush({
        toUids: uids,
        channel: 'training_reminder',
        title,
        body,
        deepLink: '/',
        data: { triggerType: 'ReminderSweepWorkout', leadMinutes: String(leadMinutes) },
        rateCapHours: 22,
        skipQuietHours: false, // same reasoning as trainingReminderScheduler — a near-workout reminder can legitimately fall in quiet hours; suppress, don't reroute
        measurement: {
          variantId: title,
          category: 'ReminderSweepWorkout', // distinct from Pass 1's 'ReminderSweep' and the sibling scheduler's 'ScheduledWorkout'
          persona: 'generic',
        },
      });
      logger.info(`[reminder-sweep] Pass 2 — "${title}" uids=${uids.length} result=${JSON.stringify(result)}`);
    } catch (err) {
      logger.error(`[reminder-sweep] Pass 2 — sendPush failed for "${title}"`, err);
    }
  }
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

    // ── Master flag gate — fail closed on a read error, same posture as
    // onPlannedActivityCreated.ts: a broken flag read must not silently
    // let a not-yet-approved sender start firing. Gates BOTH passes —
    // reminderSweepWorkoutEntriesEnabled (read inside Pass 2) is a
    // sub-gate under this one, not independent of it. ────────────────────
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

    // Each pass fully owns its own early returns — neither affects the other.
    await runSettingsSlotPass(db);
    await runWorkoutEntryPass(db, flagsData);
  },
);
