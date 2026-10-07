/**
 * pushOutcomeSweeper — Scheduled Cloud Function.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════
 * Measurement layer, stage A (Wave 1): for every `push_sent` event whose
 * outcome window has elapsed (`checkAfter <= now`, `outcomeChecked == false`
 * — see `services/push-events.service.ts`), determine whether the tracked
 * outcome happened and write a `post_push_outcome` event.
 *
 * ── Attribution anchor: OPEN, not SEND (fixed 04.10.2026) ─────────────────
 * `checkAfter` is only ever populated by `onPushOpened.ts`'s trigger, from
 * the OPEN instant — a push that was never tapped has `checkAfter: null`
 * and will never match this sweeper's query (Firestore inequality filters
 * don't match null), so it is correctly never checked. There is nothing to
 * attribute without an open. This file no longer reads `sentAt` for any
 * outcome-window math — only `openedAt`.
 *
 * ── Outcome dispatch (parametrized 04.10.2026) ────────────────────────────
 * Previously this file hardcoded exactly ONE outcome check (daily walking
 * step-goal) and marked every other category "unresolvable" without a real
 * check. `resolveOutcome()` now dispatches:
 *   - `category === 'Daily_Goal' && activityType === 'walking'` → the
 *     original specific check (did `dailyActivity.steps` reach
 *     `progression.dailyStepGoal`, for the Israel calendar day containing
 *     the OPEN instant — previously the SEND instant).
 *   - everything else → a GENERIC "started a workout within the window of
 *     open" check: does a `workouts` doc exist for this uid with `date`
 *     inside [openedAt, openedAt + outcomeWindowHours]. This closes the
 *     gap for every non-step-goal sender that opts into measurement (e.g.
 *     onPlannedActivityCreated's `Future_Partner_Plan` sends, which
 *     previously got `unresolvable` unconditionally).
 * Adding a third, more specific outcome later is a matter of adding one
 * more branch to `resolveOutcome()` — no change needed to the sweep loop,
 * the query, or activation.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SCHEDULE
 * ═══════════════════════════════════════════════════════════════════════
 * Every 30 minutes — the default outcome window is 6h, so a 30-min sweep
 * cadence keeps the observed completion time within ±30min of the true
 * window edge without needing per-push deferred scheduling (Cloud Tasks),
 * which is heavier infra than a Wave-1 "measurable seed" warrants.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { writePostPushOutcomeEvent, computeOutcomeWindowBounds, DEFAULT_OUTCOME_WINDOW_HOURS } from './services/push-events.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const SWEEP_BATCH_LIMIT = 200;

export type OutcomeType = 'daily_step_goal' | 'workout_started';

/** Israel-local YYYY-MM-DD for a given instant — matches
 * stepGoalNudgeScheduler.ts's todayDateStringIsrael() format. */
function dateStringIsrael(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/** Which checker applies — pure, no I/O, directly unit-testable. */
export function resolveOutcomeType(category: string | undefined, activityType: string | undefined): OutcomeType {
  if (category === 'Daily_Goal' && activityType === 'walking') return 'daily_step_goal';
  return 'workout_started';
}

/** Specific check — unchanged logic, re-anchored on the OPEN calendar day
 * instead of the SEND calendar day. */
async function checkWalkingGoal(uid: string, openedAtMillis: number): Promise<boolean> {
  const dateStr = dateStringIsrael(new Date(openedAtMillis));
  const [activitySnap, userSnap] = await Promise.all([
    db.collection('dailyActivity').doc(`${uid}_${dateStr}`).get(),
    db.collection('users').doc(uid).get(),
  ]);
  const steps = activitySnap.exists ? Number((activitySnap.data() as Record<string, unknown>)?.steps ?? 0) : 0;
  const progression = (userSnap.exists ? (userSnap.data() as Record<string, unknown>)?.progression : {}) as
    | Record<string, unknown>
    | undefined;
  const rawGoal = progression?.dailyStepGoal;
  const goal = typeof rawGoal === 'number' && rawGoal > 0 ? rawGoal : 3000;
  return Number.isFinite(steps) && steps >= goal;
}

/**
 * Generic check — did the user complete any workout inside the window of
 * open. Uses the existing `workouts` (userId ASC, date DESC) composite
 * index — `orderBy('date','asc')` reads the same index in the other
 * direction, no new index required.
 *
 * Returns the matched workout's own `date` as `actionAt` (07.10.2026,
 * push-performance instrumentation) instead of discarding it — this is the
 * ONE piece previously missing to compute "time to action" for this
 * outcome type; `writePostPushOutcomeEvent` used to persist only a boolean.
 * `orderBy` added so a multi-match window returns the EARLIEST workout
 * (first real action after open), not an arbitrary one.
 */
async function checkWorkoutStartedWithinWindow(
  uid: string,
  openedAtMillis: number,
  windowHours: number,
): Promise<{ achieved: boolean; actionAt: admin.firestore.Timestamp | null }> {
  const { startMillis, endMillis } = computeOutcomeWindowBounds(openedAtMillis, windowHours);
  const snap = await db
    .collection('workouts')
    .where('userId', '==', uid)
    .where('date', '>=', admin.firestore.Timestamp.fromMillis(startMillis))
    .where('date', '<=', admin.firestore.Timestamp.fromMillis(endMillis))
    .orderBy('date', 'asc')
    .limit(1)
    .get();
  if (snap.empty) return { achieved: false, actionAt: null };
  const matchedDate = (snap.docs[0].data() as Record<string, unknown>).date;
  return {
    achieved: true,
    actionAt: matchedDate instanceof admin.firestore.Timestamp ? matchedDate : null,
  };
}

/** Dispatch — the one place that decides which checker applies. */
async function resolveOutcome(opts: {
  uid: string;
  category?: string;
  activityType?: string;
  openedAtMillis: number;
  windowHours: number;
}): Promise<{ achieved: boolean; outcomeType: OutcomeType; actionAt: admin.firestore.Timestamp | null }> {
  const outcomeType = resolveOutcomeType(opts.category, opts.activityType);
  if (outcomeType === 'daily_step_goal') {
    // No actionAt here, by design, not an oversight: `dailyActivity.steps`
    // is a running daily counter with no record of the instant it crossed
    // the goal threshold — there is no real timestamp to report. Leaving
    // this null is more honest than fabricating one (e.g. end-of-day).
    return { achieved: await checkWalkingGoal(opts.uid, opts.openedAtMillis), outcomeType, actionAt: null };
  }
  const result = await checkWorkoutStartedWithinWindow(opts.uid, opts.openedAtMillis, opts.windowHours);
  return { achieved: result.achieved, outcomeType, actionAt: result.actionAt };
}

export const pushOutcomeSweeper = onSchedule(
  {
    schedule: '*/30 * * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    let dueDocs: admin.firestore.QueryDocumentSnapshot[];
    try {
      const snap = await db
        .collection('push_events')
        .where('eventType', '==', 'push_sent')
        .where('outcomeChecked', '==', false)
        .where('checkAfter', '<=', admin.firestore.Timestamp.now())
        .limit(SWEEP_BATCH_LIMIT)
        .get();
      dueDocs = snap.docs;
    } catch (err: any) {
      logger.error('[pushOutcomeSweeper] query failed:', err?.message);
      return;
    }

    if (dueDocs.length === 0) {
      logger.info('[pushOutcomeSweeper] nothing due — exiting cleanly.');
      return;
    }

    let checked = 0;
    let achieved = 0;
    let byType: Record<string, number> = {};
    let errors = 0;

    for (const doc of dueDocs) {
      const data = doc.data() as Record<string, unknown>;
      const uid = data.uid as string;
      const category = data.category as string | undefined;
      const activityType = data.activityType as string | undefined;
      const openedAt = data.openedAt as admin.firestore.Timestamp | undefined;
      const windowHours = typeof data.outcomeWindowHours === 'number' ? data.outcomeWindowHours : DEFAULT_OUTCOME_WINDOW_HOURS;

      if (!openedAt) {
        // Should not happen — checkAfter is only ever set alongside openedAt
        // by activateOutcomeWindow(). Defensive skip, not a silent re-queue:
        // mark checked so a malformed doc doesn't get swept forever.
        logger.warn(`[pushOutcomeSweeper] due doc with no openedAt, pushId=${data.pushId} uid=${uid} — marking checked`);
        await writePostPushOutcomeEvent({ pushSentDoc: doc, outcomeAchieved: false, outcomeType: 'workout_started' });
        errors++;
        continue;
      }

      try {
        const result = await resolveOutcome({
          uid,
          category,
          activityType,
          openedAtMillis: openedAt.toMillis(),
          windowHours,
        });
        await writePostPushOutcomeEvent({
          pushSentDoc: doc,
          outcomeAchieved: result.achieved,
          outcomeType: result.outcomeType,
          actionAt: result.actionAt,
        });
        checked++;
        if (result.achieved) achieved++;
        byType[result.outcomeType] = (byType[result.outcomeType] ?? 0) + 1;
      } catch (err: any) {
        errors++;
        logger.warn(`[pushOutcomeSweeper] failed for uid=${uid} pushId=${data.pushId}:`, err?.message);
      }
    }

    logger.info(
      `[pushOutcomeSweeper] run complete — due=${dueDocs.length} checked=${checked} achieved=${achieved} ` +
        `byType=${JSON.stringify(byType)} errors=${errors}`,
    );
  },
);
