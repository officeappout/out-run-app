/**
 * pushOutcomeSweeper — Scheduled Cloud Function.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════
 * Measurement layer, stage A (Wave 1): for every `push_sent` event whose
 * outcome window has elapsed (`checkAfter <= now`, `outcomeChecked == false`
 * — see `services/push-events.service.ts`), determine whether the user
 * completed their daily goal and write a `post_push_outcome` event.
 *
 * Wave 1 only knows how to check ONE goal type: `category === 'Daily_Goal'`
 * + `activityType === 'walking'` → compare `dailyActivity/{uid}_{date}.steps`
 * against `users/{uid}.progression.dailyStepGoal`, for the CALENDAR DAY the
 * push was sent (derived from `sentAt` in Asia/Jerusalem — a daily step
 * goal is anchored to the send day, not to whatever day the check happens
 * to run on, since the default 6h window can cross local midnight).
 *
 * Any other category/activityType combination (strength — deferred this
 * wave; any non-Daily_Goal category that opts into measurement) is marked
 * checked with `goalCompleted: false` and a log note — there is no outcome
 * logic for it yet, and leaving it unchecked would make the sweeper re-scan
 * it forever.
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
import { writePostPushOutcomeEvent } from './services/push-events.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const SWEEP_BATCH_LIMIT = 200;

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

async function checkWalkingGoal(uid: string, sentAt: admin.firestore.Timestamp): Promise<boolean> {
  const dateStr = dateStringIsrael(sentAt.toDate());
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
    let completed = 0;
    let unresolvable = 0;

    for (const doc of dueDocs) {
      const data = doc.data() as Record<string, unknown>;
      const uid = data.uid as string;
      const category = data.category as string | undefined;
      const activityType = data.activityType as string | undefined;
      const sentAt = data.sentAt as admin.firestore.Timestamp | undefined;

      try {
        if (category === 'Daily_Goal' && activityType === 'walking' && sentAt) {
          const goalCompleted = await checkWalkingGoal(uid, sentAt);
          await writePostPushOutcomeEvent({ pushSentDoc: doc, goalCompleted });
          checked++;
          if (goalCompleted) completed++;
        } else {
          // No outcome logic for this category/activityType yet (e.g.
          // strength, deferred this wave) — mark checked so it doesn't
          // get re-scanned forever, but don't claim a completion we can't
          // actually verify.
          await writePostPushOutcomeEvent({ pushSentDoc: doc, goalCompleted: false });
          unresolvable++;
        }
      } catch (err: any) {
        logger.warn(`[pushOutcomeSweeper] failed for uid=${uid} pushId=${data.pushId}:`, err?.message);
      }
    }

    logger.info(
      `[pushOutcomeSweeper] run complete — due=${dueDocs.length} checked=${checked} ` +
        `completed=${completed} unresolvable=${unresolvable}`,
    );
  },
);
