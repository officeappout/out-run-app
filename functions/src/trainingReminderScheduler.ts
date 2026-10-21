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
 * Category → Hebrew label mapping (the @אימון variable of the push library):
 *   strength    → "אימון כוח"
 *   cardio      → "ריצה"
 *   maintenance → "אימון קל"   (was "תרגול החזקה", copy audit 10.2026)
 *   walking     → "הליכה"
 *   (none)      → "אימון"
 *
 * COPY — the push library (push-copy.service.ts, pushType
 * 'workout_reminder_day'). This file only decides WHO and WHEN; the title
 * and body come from the admin-editable library, falling back to the code
 * defaults in shared/push-library.core.ts.
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
 *   TRAINING_REMINDER_BATCH    — page size of today's userSchedule query (default 500)
 *   TRAINING_REMINDER_MAX_PAGES — max pages per run (default 20 → 10,000 docs).
 *                                Until 19.10.2026 the run read ONE page of 500
 *                                and stopped; schedules past it never got a
 *                                reminder. Per-user rules are unchanged.
 *   TRAINING_REMINDER_TEST_MODE — if 'true', logs intent, skips FCM + writes
 *
 * GATE — reminderSweepScheduler v2 (06.10.2026)
 * ──────────────────────────────────────────────
 * `app_config/feature_flags.reminderSweepWorkoutEntriesEnabled` (default
 * false/absent): when true, any userSchedule entry that HAS a `startTime`
 * is skipped here entirely — `reminderSweepScheduler`'s 5-minute sweep now
 * owns those precisely (fires ~leadMinutes before startTime, not this
 * scheduler's coarse per-user hour). This scheduler keeps serving the
 * residual case the sweep structurally can't — entries with no startTime
 * at all. Reversible with ZERO code change: flip the flag back to
 * false/absent and every entry is a candidate here again, exactly as
 * before this gate existed. Fails OPEN (treats a read error as false, the
 * OLD behavior) — unlike reminderSweepScheduler's own fail-closed flag
 * read, a transient error here must never silently stop an
 * already-relied-upon, already-live reminder from firing.
 *
 * PUSH-LIFECYCLE FIXES (21.10.2026, owner-approved) — lib/reminder-template.ts
 * ──────────────────────────────────────────────────────────────────────────
 *  - "Already passed" is measured from the START of this run's hour
 *    (sessionNotYetStarted): template sessions start AT the reminder hour,
 *    and the old `startTime <= now` skipped exactly them (07:00 strength,
 *    07:00/19:00 runs).
 *  - Pass 1b: users with no planned entry in a day doc get today's sessions
 *    from lifestyle.recurringTemplate (shared/recurring-day.core.ts — the
 *    client hydrate's rules), nothing written; one workouts read each so a
 *    workout already logged today means no reminder. Kill switch:
 *    feature_flags.trainingReminderFromTemplate === false (default ON).
 *
 * `categoryLabel`/`resolveWorkoutReminderCopy`/`groupByCopy` are exported so
 * reminderSweepScheduler can reuse the same category-aware copy path for
 * workout-entry sends, rather than duplicating it.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import {
  resolvePushCopy,
  pushCopyData,
  audienceFromUserData,
  firstNameFromUserData,
  type ResolvedPushCopy,
} from './services/push-copy.service';
import type { PushAudience } from './shared/push-library.core';
import { envInt, forEachQueryPage, mapWithConcurrency } from './lib/paginate';
import { isDemoUid } from './lib/demo';
import {
  collectTemplateCandidates,
  parsePreferredHour,
  sessionNotYetStarted,
} from './lib/reminder-template';
import { israelDateKey, latestWorkoutMs } from './lib/user-activity';
import type { RecurringExistingEntry } from './shared/recurring-day.core';

if (!admin.apps.length) {
  admin.initializeApp();
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** Page size of today's userSchedule query (was the WHOLE run's cap until 19.10.2026). */
const BATCH_LIMIT = envInt(process.env.TRAINING_REMINDER_BATCH, 500, 1000);
/** Max pages per run (default 20 → 10,000 schedule docs). */
const MAX_PAGES = envInt(process.env.TRAINING_REMINDER_MAX_PAGES, 20, 100);
/** Parallel per-recipient copy resolutions. */
const COPY_CONCURRENCY = 10;

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
  maintenance: 'אימון קל',
  walking: 'הליכה',
};

export function categoryLabel(categories: string[] | undefined): string {
  if (!categories || categories.length === 0) return 'אימון';
  const labels = categories
    .map((c) => CATEGORY_LABEL[c])
    .filter(Boolean);
  return labels.length > 0 ? labels.join(' + ') : 'אימון';
}

// ─── Copy (push library) ──────────────────────────────────────────────────────

/** What the push library needs about one recipient (from the users/{uid} doc). */
export interface ReminderRecipient {
  uid: string;
  firstName: string;
  audience: PushAudience;
}

/**
 * The reminder copy for one recipient. Shared with reminderSweepScheduler's
 * workout-entry pass ('workout_reminder_before'), which carries a startTime.
 * Rotates per user per day (was: one body for everyone per day); identical
 * results are still batched into one sendPush by the callers.
 */
export async function resolveWorkoutReminderCopy(
  pushType: 'workout_reminder_day' | 'workout_reminder_before',
  recipient: ReminderRecipient,
  workoutLabel: string,
  startTime?: string,
): Promise<ResolvedPushCopy | null> {
  return resolvePushCopy(pushType, {
    uid: recipient.uid,
    audience: recipient.audience,
    vars: { '@שם': recipient.firstName, '@אימון': workoutLabel, '@שעה': startTime },
  });
}

/** Groups identical resolved copy so each distinct message is one sendPush. */
export function groupByCopy<T extends { uid: string }>(
  items: Array<{ item: T; copy: ResolvedPushCopy }>,
): Array<{ copy: ResolvedPushCopy; uids: string[] }> {
  const groups = new Map<string, { copy: ResolvedPushCopy; uids: string[] }>();
  for (const { item, copy } of items) {
    const key = `${copy.rowId}|${copy.title}|${copy.body}|${copy.deepLink}`;
    if (!groups.has(key)) groups.set(key, { copy, uids: [] });
    groups.get(key)!.uids.push(item.uid);
  }
  return Array.from(groups.values());
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

// ─── Main export ──────────────────────────────────────────────────────────────

export const trainingReminderScheduler = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    // 540s (was 300): the run now pages through all of today's schedules.
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    // Lazy init (06.10.2026) — was module-scope, moved here: once
    // reminderSweepScheduler started importing this file's categoryLabel/
    // buildMessage, an eager admin.firestore() call at import time became
    // a real testability hazard (a mocked firestore()'s closure variable
    // isn't assigned yet at that point). Harmless functional no-op —
    // db was only ever read inside this same handler anyway.
    const db = admin.firestore();
    const dateStr = todayISO();
    const currentHour = currentHourIST();

    // Gate flag — fails OPEN (false = old behavior) on a read error, see
    // this file's header. A transient read error must never silently stop
    // an already-live reminder; worst case is one run's workout-entry gate
    // doesn't apply, which just means a candidate gets handled here instead
    // of waiting for the sweep — never a missed reminder.
    let gateWorkoutEntries = false;
    // Server-side materialisation from the recurring template (lib/reminder-template.ts).
    // DEFAULT ON — only an explicit false turns it off (kill switch).
    let fromTemplate = true;
    try {
      const flagsSnap = await db.doc('app_config/feature_flags').get();
      gateWorkoutEntries = flagsSnap.exists && flagsSnap.data()?.reminderSweepWorkoutEntriesEnabled === true;
      fromTemplate = !(flagsSnap.exists && flagsSnap.data()?.trainingReminderFromTemplate === false);
    } catch (err) {
      logger.warn('[training-reminder] feature_flags read failed, defaulting gate to false (old behavior)', err);
    }

    logger.info(
      `[training-reminder] Starting run for date=${dateStr} hour=${currentHour} ` +
        `batchLimit=${BATCH_LIMIT} maxPages=${MAX_PAGES} testMode=${TEST_MODE} gateWorkoutEntries=${gateWorkoutEntries} ` +
        `fromTemplate=${fromTemplate}`,
    );

    // ── Pass 1: today's userSchedule docs, cursor-paginated (19.10.2026 —
    // was ONE limit(BATCH_LIMIT) read, so schedule docs past the first 500
    // of the day were never looked at). Only the small candidate rows are
    // kept between pages. Equality + doc-id order: no composite index. ──
    interface Candidate {
      uid: string;
      workoutLabel: string;
      startTime?: string;
      /** Planned by the recurring template, no day doc (gap 4) — the user doc is already read. */
      fromTemplate?: boolean;
      userData?: Record<string, unknown>;
    }

    const candidates: Candidate[] = [];
    /** Every day doc's entries this run read — the template pass must respect the user's own edits. */
    const dayEntriesByUid = new Map<string, ReadonlyArray<RecurringExistingEntry>>();

    const collectPage = (pageDocs: admin.firestore.QueryDocumentSnapshot[]) => {
      for (const doc of pageDocs) {
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
        if (!uid || isDemoUid(uid)) continue; // demo world guard

        const entries = Array.isArray(data.entries) ? data.entries : [];
        dayEntriesByUid.set(uid, entries as ReadonlyArray<RecurringExistingEntry>);
        // Find first uncompleted training entry for today
        const trainEntry = entries.find(
          (e) => e.type === 'training' && e.completed !== true,
        );
        if (!trainEntry) continue;

        // v2 gate: when enabled, any entry WITH a startTime is now owned
        // precisely by reminderSweepScheduler — skip it here entirely rather
        // than also sending this scheduler's coarser per-hour reminder for
        // the same workout (see this file's header).
        if (gateWorkoutEntries && trainEntry.startTime) continue;

        // Skip if the workout started before this run's hour (no point
        // reminding after the fact). 21.10.2026: measured from the start of
        // the run's hour, not `<= now` — template sessions start AT the
        // reminder hour (07:00 / 19:00), so the old check skipped exactly
        // the sessions this reminder is for (push-lifecycle audit, gap 2).
        if (!sessionNotYetStarted(trainEntry.startTime, currentHour)) continue;

        candidates.push({
          uid,
          workoutLabel: categoryLabel(trainEntry.scheduledCategories),
          startTime: trainEntry.startTime,
        });
      }
    };

    try {
      const stats = await forEachQueryPage(
        db.collection('userSchedule').where('date', '==', dateStr),
        { pageSize: BATCH_LIMIT, maxPages: MAX_PAGES },
        collectPage,
      );
      logger.info(
        `[training-reminder] ${stats.read} schedule doc(s) found for ${dateStr} over ${stats.pages} page(s)` +
          (stats.truncated ? ` (stopped at MAX_PAGES=${MAX_PAGES} — raise TRAINING_REMINDER_MAX_PAGES)` : ''),
      );
    } catch (err: unknown) {
      if (candidates.length === 0) {
        logger.error('[training-reminder] Firestore query failed', err);
        return;
      }
      // A later page failed: the pages already read are still served.
      logger.error('[training-reminder] Firestore query failed after some pages — continuing with those', err);
    }

    // ── Pass 1b: users with NO planned entry in a day doc whose recurring
    // template plans a session today (gap 4 — nothing written). ──
    if (fromTemplate) {
      try {
        const { candidates: fromTpl, usersRead } = await collectTemplateCandidates(db, {
          dateKey: dateStr,
          runHour: currentHour,
          defaultHour: DEFAULT_HOUR,
          pageSize: BATCH_LIMIT,
          maxPages: MAX_PAGES,
          dayEntriesByUid,
          skipUids: new Set(candidates.map((c) => c.uid)),
        });
        for (const t of fromTpl) {
          candidates.push({
            uid: t.uid,
            workoutLabel: categoryLabel(t.categories),
            startTime: t.startTime,
            fromTemplate: true,
            userData: t.userData,
          });
        }
        logger.info(`[training-reminder] template pass: ${usersRead} user doc(s) read, ${fromTpl.length} candidate(s) without a day doc`);
      } catch (err: unknown) {
        logger.error('[training-reminder] template pass failed — continuing with day-doc candidates only', err);
      }
    }

    logger.info(`[training-reminder] ${candidates.length} candidate(s) with uncompleted training today`);

    if (candidates.length === 0) return;

    // ── Pass 2: resolve each candidate's preferred hour, keep only this run's hour ──
    const preferredHourByUid = new Map<string, number>();
    const recipientByUid = new Map<string, ReminderRecipient>();
    const setRecipient = (uid: string, userData: Record<string, any> | undefined) => {
      recipientByUid.set(uid, {
        uid,
        firstName: firstNameFromUserData(userData),
        audience: audienceFromUserData(userData),
      });
      preferredHourByUid.set(uid, parsePreferredHour(userData?.lifestyle?.reminders?.runningTime) ?? DEFAULT_HOUR);
    };
    // Template candidates came from a users query — their doc is already in hand.
    for (const c of candidates) if (c.userData) setRecipient(c.uid, c.userData as Record<string, any>);
    const needUserDoc = candidates.filter((c) => !c.userData);
    for (let i = 0; i < needUserDoc.length; i += USER_FETCH_BATCH) {
      const slice = needUserDoc.slice(i, i + USER_FETCH_BATCH);
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
        setRecipient(slice[idx].uid, snap.exists ? (snap.data() as Record<string, any>) : undefined);
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

    const notYetHandled = hourMatched.filter((c) => !alreadySentToday.has(c.uid));

    // Template candidates have no day doc that could say "done": one indexed
    // workouts read each (only these few, after every cheaper filter) — a
    // workout logged today means no reminder. Fails SAFE (lookup error → skip).
    const trainedToday = new Set<string>();
    await mapWithConcurrency(
      notYetHandled.filter((c) => c.fromTemplate),
      COPY_CONCURRENCY,
      async (c) => {
        try {
          const ms = await latestWorkoutMs(db, c.uid);
          if (ms !== null && israelDateKey(ms) === dateStr) trainedToday.add(c.uid);
        } catch (err: unknown) {
          trainedToday.add(c.uid);
          logger.warn(`[training-reminder] workouts lookup failed for template candidate uid=${c.uid}, skipping`, err);
        }
      },
    );
    const targets = notYetHandled.filter((c) => !trainedToday.has(c.uid));

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

    // ── Copy per recipient (push library), then batch identical messages ──
    const resolved: Array<{ item: (typeof targets)[number]; copy: ResolvedPushCopy }> = [];
    const copies = await mapWithConcurrency(targets, COPY_CONCURRENCY, async (t) => {
      const recipient = recipientByUid.get(t.uid) ?? { uid: t.uid, firstName: '', audience: {} };
      return resolveWorkoutReminderCopy('workout_reminder_day', recipient, t.workoutLabel, t.startTime);
    });
    targets.forEach((t, i) => {
      const copy = copies[i];
      if (copy) resolved.push({ item: t, copy });
    });

    let totalDelivered = 0;

    for (const { copy, uids } of groupByCopy(resolved)) {
      try {
        const result = await sendPush({
          toUids: uids,
          channel: 'training_reminder',
          title: copy.title,
          body: copy.body,
          deepLink: copy.deepLink,
          data: { triggerType: 'ScheduledWorkout', date: dateStr, ...pushCopyData(copy) },
          rateCapHours: 22, // ~1 per day — slightly under 24h to avoid drift
          // Lapsed users (> 30 days away) and same-day retention recipients are held
          // back when app_config/feature_flags.lapsedPushSuppression is on (default off).
          suppressIfLapsed: true,
          // Personalized-hour sends must respect quiet hours — unlike the old
          // single blanket 07:30 run (always safely outside 22:00-07:00), a
          // user-chosen hour can legitimately fall inside the quiet window.
          skipQuietHours: false,
          // push_events logging (Task 3, 04.10.2026). variantId = the push
          // library row the copy came from (was `${title}__b${bodyIndex}`),
          // so the push-performance table is per library row.
          measurement: {
            variantId: copy.rowId,
            category: 'ScheduledWorkout',
            persona: 'generic',
            pushType: copy.pushType,
            copyRowId: copy.rowId,
          },
        });
        totalDelivered += result.delivered;
        logger.info(
          `[training-reminder] "${copy.title}" row=${copy.rowId} uids=${uids.length} ` +
            `result=${JSON.stringify(result)}`,
        );
      } catch (err: unknown) {
        logger.error(`[training-reminder] sendPush failed for "${copy.title}"`, err);
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
