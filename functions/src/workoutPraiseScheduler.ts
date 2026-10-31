/**
 * workoutPraiseScheduler — Scheduled Cloud Function (pilot N5, owner 31.10.2026).
 *
 * A "כל הכבוד" push in the evening (20:00 Asia/Jerusalem) of a day the user finished a workout,
 * that opens the progress tab. Skipped when the user already opened the progress screen after
 * the day's last workout: the app stamps streaks/{uid}.praiseSeenAt (ms; same "seen in the app"
 * pattern as milestoneSeen for the 20:00 streak push). Copy: the push library, pushType 'workout_praise'.
 *
 * GATE: system_config/feature_flags.enable_workout_praise_push — DEFAULT OFF (only an explicit
 * true sends; a failed flag read sends nothing). One push per user per day (push_rate log),
 * not when Kelly already sent a proactive message today, counted in the daily cap.
 *
 * DEPLOY (owner's per-action OK): firebase deploy --only functions:workoutPraiseScheduler
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { resolvePushCopy, pushCopyData, audienceFromUserData, firstNameFromUserData } from './services/push-copy.service';
import { mapWithConcurrency } from './lib/paginate';
import { isDemoUid } from './lib/demo';
import { activityToMillis, israelDateKey } from './lib/user-activity';
import { kellySentToday } from './streakRescueScheduler';

if (!admin.apps.length) admin.initializeApp();

export const WORKOUT_PRAISE_FLAG = 'enable_workout_praise_push';
const PUSH_TYPE = 'workout_praise';
const CONCURRENCY = 10;
const DAY_MS = 86_400_000;

/**
 * Pure. Today's praise is due when the user's last workout today was not followed by a visit to
 * the progress screen (praiseSeenAt, ms) and it wasn't sent today already.
 */
export function praiseDue(args: {
  todayKey: string;
  lastWorkoutMs: number;
  praiseSeenAt: unknown;
  lastPraiseDay: unknown;
}): boolean {
  const seen = typeof args.praiseSeenAt === 'number' && args.praiseSeenAt >= args.lastWorkoutMs;
  return !seen && args.lastPraiseDay !== args.todayKey;
}

/** Users with a workout dated today (Israel day) → the time of their last one. */
async function usersWithWorkoutToday(db: admin.firestore.Firestore, nowMs: number, todayKey: string): Promise<Map<string, number>> {
  const snap = await db
    .collection('workouts')
    .where('date', '>=', admin.firestore.Timestamp.fromMillis(nowMs - DAY_MS))
    .select('userId', 'date')
    .get();
  const last = new Map<string, number>();
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const ms = activityToMillis(data.date);
    if (typeof data.userId === 'string' && ms !== null && israelDateKey(ms) === todayKey && !isDemoUid(data.userId)) {
      last.set(data.userId, Math.max(last.get(data.userId) ?? 0, ms));
    }
  }
  return last;
}

export interface PraiseRunStats {
  candidates: number;
  seen: number;
  skippedKelly: number;
  delivered: number;
}

/** One run (exported for tests). */
export async function runWorkoutPraisePass(db: admin.firestore.Firestore, nowMs: number): Promise<PraiseRunStats> {
  const stats: PraiseRunStats = { candidates: 0, seen: 0, skippedKelly: 0, delivered: 0 };
  let flags: Record<string, unknown> | undefined;
  try {
    flags = (await db.doc('system_config/feature_flags').get()).data() as Record<string, unknown> | undefined;
  } catch (err) {
    logger.error('[workout-praise] feature_flags read failed, aborting (fail closed)', err);
    return stats;
  }
  if (flags?.[WORKOUT_PRAISE_FLAG] !== true) {
    logger.info(`[workout-praise] ${WORKOUT_PRAISE_FLAG} !== true, skipping`);
    return stats;
  }
  const todayKey = israelDateKey(nowMs);
  const lastWorkout = await usersWithWorkoutToday(db, nowMs, todayKey);
  const uids = Array.from(lastWorkout.keys());
  stats.candidates = uids.length;

  await mapWithConcurrency(uids, CONCURRENCY, async (uid) => {
    try {
      const [streakSnap, rateSnap] = await Promise.all([
        db.collection('streaks').doc(uid).get(),
        db.collection('push_rate').doc(uid).get(),
      ]);
      const due = praiseDue({
        todayKey,
        lastWorkoutMs: lastWorkout.get(uid) ?? 0,
        praiseSeenAt: streakSnap.get('praiseSeenAt'),
        lastPraiseDay: rateSnap.get('workoutPraiseDay'),
      });
      if (!due) { stats.seen++; return; }
      if (await kellySentToday(db, uid, todayKey)) { stats.skippedKelly++; return; }

      const userSnap = await db.collection('users').doc(uid).get();
      const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : undefined;
      const now = new Date(nowMs);
      const copy = await resolvePushCopy(PUSH_TYPE, {
        uid,
        now,
        audience: audienceFromUserData(userData, now),
        vars: { '@שם': firstNameFromUserData(userData) },
      });
      if (!copy) return;
      const result = await sendPush({
        toUids: [uid],
        channel: 'progression',
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { triggerType: 'WorkoutPraise', ...pushCopyData(copy) },
        rateCapHours: 0,
        countTowardDailyCap: true,
        policyKind: 'proactive',
        measurement: {
          variantId: copy.rowId,
          category: 'WorkoutPraise',
          persona: 'generic',
          pushType: copy.pushType,
          copyRowId: copy.rowId,
          lever: 'progress',
        },
      });
      if (result.delivered > 0) {
        stats.delivered++;
        await db.collection('push_rate').doc(uid).set({ workoutPraiseDay: todayKey }, { merge: true });
      }
    } catch (err) {
      logger.error(`[workout-praise] failed for uid=${uid}`, err);
    }
  });

  logger.info(`[workout-praise] Run complete — ${JSON.stringify(stats)}`);
  return stats;
}

export const workoutPraiseScheduler = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', memory: '256MiB', timeoutSeconds: 300, retryCount: 0 },
  async (event) => {
    const scheduled = Date.parse((event as { scheduleTime?: string } | undefined)?.scheduleTime ?? '');
    await runWorkoutPraisePass(admin.firestore(), Number.isFinite(scheduled) ? scheduled : Date.now());
  },
);
