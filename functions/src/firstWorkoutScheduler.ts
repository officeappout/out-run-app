/**
 * firstWorkoutScheduler — Scheduled Cloud Function (push-lifecycle audit,
 * gap 7; owner-approved 21.10.2026).
 *
 * PURPOSE
 * ───────
 * Between the end of signup and day 7 nothing was sent, and the first push
 * (retention, day 7) asked "מוכן לחזור?" of people who never started. This
 * sends ONE track-aware "your first workout is ready" push on day 1 (24–48h
 * after signup) and one on day 2 (48–72h), only while the user has no
 * workout at all. Copy: push library pushType 'first_workout'
 * (conditions.when = 'day1' | 'day2', conditions.track).
 *
 * GATE: app_config/feature_flags.firstWorkoutPushEnabled — DEFAULT OFF (only
 * an explicit true sends). Fails CLOSED on a read error.
 *
 * QUERY: users where onboardingStatus == COMPLETED and createdAt in
 * [now − 72h, now − 24h], orderBy createdAt desc — the existing composite
 * index onboardingStatus ASC + createdAt DESC (onboardingDropoffDispatcher's).
 * Bounded pages. Per candidate: push_rate/{uid} (sent log) and one indexed
 * workouts read (userId ASC + date DESC, limit 1) — fails SAFE (skip).
 *
 * DELIVERY: sendPush on the 'retention' channel (the user's re-engagement
 * toggle — not training_reminder, so "לא עכשיו" on reminders doesn't silence
 * it), rate cap 20h, quiet hours / Shabbat / daily cap as every push. Runs
 * daily at 17:00 Israel. The window is recorded in
 * push_rate/{uid}.firstWorkout_sent only after a real delivery.
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
} from './services/push-copy.service';
import { envInt, forEachQueryPage, mapWithConcurrency } from './lib/paginate';
import { isDemoUid } from './lib/demo';
import { activityToMillis, latestWorkoutMs } from './lib/user-activity';
import {
  firstWorkoutDue,
  firstWorkoutSentFrom,
  firstWorkoutWindow,
  pushTrackFromUserData,
  trackConditions,
} from './lib/push-lifecycle';

if (!admin.apps.length) {
  admin.initializeApp();
}

const BATCH_LIMIT = envInt(process.env.FIRST_WORKOUT_BATCH, 200, 500);
const MAX_PAGES = envInt(process.env.FIRST_WORKOUT_MAX_PAGES, 10, 50);
const CONCURRENCY = 10;
const HOUR_MS = 3_600_000;

export interface FirstWorkoutRunStats {
  read: number;
  due: number;
  trained: number;
  delivered: number;
}

/** One run (exported for tests). */
export async function runFirstWorkoutPass(db: admin.firestore.Firestore, nowMs: number): Promise<FirstWorkoutRunStats> {
  const stats: FirstWorkoutRunStats = { read: 0, due: 0, trained: 0, delivered: 0 };

  let flags: Record<string, unknown> | undefined;
  try {
    flags = (await db.doc('app_config/feature_flags').get()).data() as Record<string, unknown> | undefined;
  } catch (err) {
    logger.error('[first-workout] feature_flags read failed, aborting (fail closed)', err);
    return stats;
  }
  if (flags?.firstWorkoutPushEnabled !== true) {
    logger.info('[first-workout] firstWorkoutPushEnabled !== true, skipping');
    return stats;
  }

  const from = admin.firestore.Timestamp.fromMillis(nowMs - 72 * HOUR_MS);
  const to = admin.firestore.Timestamp.fromMillis(nowMs - 24 * HOUR_MS);
  const candidates: Array<{ uid: string; data: Record<string, unknown>; window: 'day1' | 'day2' }> = [];

  try {
    await forEachQueryPage(
      db
        .collection('users')
        .where('onboardingStatus', '==', 'COMPLETED')
        .where('createdAt', '>=', from)
        .where('createdAt', '<=', to)
        .orderBy('createdAt', 'desc'),
      { pageSize: BATCH_LIMIT, maxPages: MAX_PAGES },
      (docs: admin.firestore.QueryDocumentSnapshot[]) => {
        for (const d of docs) {
          stats.read++;
          if (isDemoUid(d.id)) continue;
          const data = d.data() as Record<string, unknown>;
          const window = firstWorkoutWindow(activityToMillis(data.createdAt), nowMs);
          if (!window) continue;
          // A run already logged on the user doc → not a first-workout user.
          if ((data.running as { lastWorkoutDate?: unknown } | undefined)?.lastWorkoutDate) continue;
          candidates.push({ uid: d.id, data, window });
        }
      },
    );
  } catch (err) {
    if (candidates.length === 0) {
      logger.error('[first-workout] users query failed', err);
      return stats;
    }
    logger.error('[first-workout] users query failed after some pages, continuing with those', err);
  }

  await mapWithConcurrency(candidates, CONCURRENCY, async ({ uid, data, window }) => {
    try {
      const rateRef = db.collection('push_rate').doc(uid);
      const rateSnap = await rateRef.get();
      const sent = firstWorkoutSentFrom(rateSnap.exists ? (rateSnap.data() as Record<string, unknown>) : undefined);
      if (!firstWorkoutDue(window, sent)) return;

      let lastWorkout: number | null;
      try {
        lastWorkout = await latestWorkoutMs(db, uid);
      } catch (err) {
        logger.warn(`[first-workout] workouts lookup failed for uid=${uid}, skipping (fail safe)`, err);
        return;
      }
      if (lastWorkout !== null) {
        stats.trained++;
        return;
      }
      stats.due++;

      const copy = await resolvePushCopy('first_workout', {
        uid,
        now: new Date(nowMs),
        audience: audienceFromUserData(data, new Date(nowMs)),
        vars: { '@שם': firstNameFromUserData(data) },
        conditions: trackConditions(pushTrackFromUserData(data), { when: window }),
      });
      if (!copy) return;
      const result = await sendPush({
        toUids: [uid],
        channel: 'retention',
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { triggerType: 'FirstWorkout', window, ...pushCopyData(copy) },
        rateCapHours: 20,
        measurement: {
          variantId: copy.rowId,
          category: 'FirstWorkout',
          persona: 'generic',
          pushType: copy.pushType,
          copyRowId: copy.rowId,
        },
      });
      if (result.delivered > 0) {
        stats.delivered++;
        await rateRef.set({ firstWorkout_sent: [...sent, window] }, { merge: true });
      }
    } catch (err) {
      logger.error(`[first-workout] failed for uid=${uid}`, err);
    }
  });

  logger.info(`[first-workout] Run complete — ${JSON.stringify(stats)}`);
  return stats;
}

export const firstWorkoutScheduler = onSchedule(
  {
    schedule: '0 17 * * *',
    timeZone: 'Asia/Jerusalem',
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    await runFirstWorkoutPass(admin.firestore(), Date.now());
  },
);
