/**
 * First-week sequence + second-workout push (owner-approved 21.10.2026).
 * Runs inside firstWorkoutScheduler (hourly) when
 * app_config/feature_flags.firstWeekSequenceEnabled === true (DEFAULT OFF).
 *
 * The plan (day × lever × hour, the stop rules, the tones) is the pure,
 * shared shared/first-week.core.ts — the home card reads the same file.
 * This module only gathers each user's state and sends.
 *
 * FIRST WEEK (every hour 08–21): users with onboardingStatus COMPLETED and
 * createdAt in the last 8 days (the existing onboardingStatus + createdAt
 * index; bounded pages). Cheap in-memory filters first (day index, the
 * day's hour, a run already logged); then per due user: push_rate/{uid}
 * (the sent log), ai_coach_proactive/{uid} (Kelly coordination, read-only),
 * one indexed workouts read (fail SAFE), and on day 4 the day's steps.
 *
 * SECOND WORKOUT (18:00 only): users created 1–30 days ago whose
 * progression.workoutCount is 1 (or absent → one workouts read, limit 2);
 * exactly one workout, 24–48h ago → one push, once per that workout.
 *
 * Kelly is not available to everyone (minors, entitlement, AI off): these
 * pushes are fully standalone. The only coordination: if Kelly already wrote
 * a proactive message for the user today, our slot is skipped.
 *
 * Delivery: sendPush on 'retention' (rate cap 20h) — quiet hours, Shabbat
 * (observers), prefs, the daily cap and (pushPolicyV2) the first-week
 * one-a-day rule all apply there. Tone + lever are recorded on push_events.
 */
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { audienceFromUserData, firstNameFromUserData, pushCopyData } from './services/push-copy.service';
import { resolveTonedCopy, toneSegmentFrom } from './services/push-tone.service';
import { envInt, forEachQueryPage, mapWithConcurrency } from './lib/paginate';
import { isDemoUid } from './lib/demo';
import { activityToMillis } from './lib/user-activity';
import { isConfirmedAdult } from './lib/age-guard';
import { resolveUserStepGoal } from './lib/resolveUserStepGoal';
import {
  SECOND_WORKOUT_TONES,
  firstWeekDay,
  firstWeekDayIndex,
  firstWeekSendHour,
  kellyProactiveToday,
  planFirstWeekPush,
  reminderHourFrom,
  secondWorkoutDue,
  toneOrder,
} from './shared/first-week.core';

const BATCH_LIMIT = envInt(process.env.FIRST_WEEK_BATCH, 200, 500);
const MAX_PAGES = envInt(process.env.FIRST_WEEK_MAX_PAGES, 10, 50);
const CONCURRENCY = 10;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const SECOND_WORKOUT_HOUR = 18;

export interface FirstWeekRunStats {
  read: number;
  due: number;
  skipped: Record<string, number>;
  delivered: number;
}

function israelHour(ms: number): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23' }).format(new Date(ms))) % 24;
}

function israelDateStr(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

async function readRate(db: admin.firestore.Firestore, uid: string): Promise<Record<string, unknown> | undefined> {
  const snap = await db.collection('push_rate').doc(uid).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
}

/** Kelly coordination — a read error means "no Kelly message", so ours sends. */
async function kellyToday(db: admin.firestore.Firestore, uid: string, nowMs: number): Promise<boolean> {
  try {
    const snap = await db.collection('ai_coach_proactive').doc(uid).get();
    return kellyProactiveToday(snap.exists ? (snap.data() as Record<string, unknown>) : undefined, nowMs);
  } catch {
    return false;
  }
}

/** Up to 2 latest workouts (indexed userId + date desc). Throws on failure. */
async function latestTwoWorkouts(db: admin.firestore.Firestore, uid: string): Promise<number[]> {
  const snap = await db.collection('workouts').where('userId', '==', uid).orderBy('date', 'desc').limit(2).select('date').get();
  return snap.docs
    .map((d) => activityToMillis((d.data() as Record<string, unknown> | undefined)?.date))
    .filter((x): x is number => x !== null);
}

async function stepsLeftToday(db: admin.firestore.Firestore, uid: string, data: Record<string, unknown>, nowMs: number): Promise<number | null> {
  const dateStr = israelDateStr(nowMs);
  const snap = await db.collection('dailyActivity').doc(`${uid}_${dateStr}`).get();
  if (!snap.exists) return null; // no steps synced → no real number → no steps push
  const steps = Number((snap.data() as Record<string, unknown>)?.steps ?? 0);
  if (!Number.isFinite(steps)) return null;
  const goal = await resolveUserStepGoal(db, uid, data.progression as Record<string, unknown>, dateStr);
  return goal > 0 ? Math.max(0, goal - steps) : null;
}

function sentDaysFrom(rate: Record<string, unknown> | undefined): string[] {
  const raw = rate?.firstWeek_sent;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/** One first-week pass (exported for tests). Flag checked by the caller. */
export async function runFirstWeekPass(db: admin.firestore.Firestore, nowMs: number): Promise<FirstWeekRunStats> {
  const stats: FirstWeekRunStats = { read: 0, due: 0, skipped: {}, delivered: 0 };
  const skip = (reason: string) => {
    stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
  };
  const hourNow = israelHour(nowMs);
  const from = admin.firestore.Timestamp.fromMillis(nowMs - 8 * DAY_MS);
  const to = admin.firestore.Timestamp.fromMillis(nowMs);
  const due: Array<{ uid: string; data: Record<string, unknown>; dayIndex: number; reminderHour: number | null }> = [];

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
          const dayIndex = firstWeekDayIndex(activityToMillis(data.createdAt), nowMs);
          const day = firstWeekDay(dayIndex);
          if (!day || !day.push || dayIndex === null) continue;
          const reminderHour = reminderHourFrom((data.lifestyle as { reminders?: { runningTime?: unknown } } | undefined)?.reminders?.runningTime);
          if (firstWeekSendHour(day, reminderHour) !== hourNow) continue;
          if ((data.running as { lastWorkoutDate?: unknown } | undefined)?.lastWorkoutDate) continue;
          if (typeof (data.progression as { workoutCount?: unknown } | undefined)?.workoutCount === 'number'
            && ((data.progression as { workoutCount: number }).workoutCount > 0)) continue;
          due.push({ uid: d.id, data, dayIndex, reminderHour });
        }
      },
    );
  } catch (err) {
    if (due.length === 0) {
      logger.error('[first-week] users query failed', err);
      return stats;
    }
    logger.error('[first-week] users query failed after some pages, continuing with those', err);
  }

  await mapWithConcurrency(due, CONCURRENCY, async ({ uid, data, dayIndex, reminderHour }) => {
    try {
      const rate = await readRate(db, uid);
      let hasWorkout: boolean | null;
      try {
        hasWorkout = (await latestTwoWorkouts(db, uid)).length > 0;
      } catch (err) {
        logger.warn(`[first-week] workouts lookup failed uid=${uid}, skipping (fail safe)`, err);
        hasWorkout = null;
      }
      const day = firstWeekDay(dayIndex);
      let stepsLeft: number | null = null;
      if (day?.lever === 'steps' && hasWorkout === false) {
        try {
          stepsLeft = await stepsLeftToday(db, uid, data, nowMs);
        } catch (err) {
          logger.warn(`[first-week] steps lookup failed uid=${uid}`, err);
        }
      }
      const plan = planFirstWeekPush(dayIndex, hourNow, {
        hasWorkout,
        isMinor: !isConfirmedAdult(data, new Date(nowMs)),
        reminderHour,
        sentDays: sentDaysFrom(rate),
        parkName: (data.core as { preferredParkName?: unknown } | undefined)?.preferredParkName as string | undefined,
        // No server-side weekly count per park yet → day 3 stays in-app only until one exists.
        peopleCount: null,
        stepsLeft,
        kellyToday: hasWorkout === false ? await kellyToday(db, uid, nowMs) : false,
      });
      if ('skip' in plan) {
        skip(plan.skip);
        return;
      }
      stats.due++;
      const c = plan.candidate;
      const audience = audienceFromUserData(data, new Date(nowMs));
      const toned = await resolveTonedCopy(
        'first_week',
        {
          uid,
          now: new Date(nowMs),
          audience,
          vars: { '@שם': firstNameFromUserData(data), ...c.vars },
          conditions: { day: c.dayKey },
          params: { targetSteps: '1000' },
        },
        toneOrder(firstWeekDay(dayIndex)?.tones ?? [], toneSegmentFrom(audience)),
      );
      if (!toned) {
        skip('no_copy');
        return;
      }
      const { copy, tone } = toned;
      const result = await sendPush({
        toUids: [uid],
        channel: 'retention',
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { triggerType: 'FirstWeek', day: c.dayKey, lever: c.lever, tone, ...pushCopyData(copy) },
        rateCapHours: 20,
        policyKind: 'proactive',
        measurement: {
          variantId: copy.rowId,
          category: 'FirstWeek',
          persona: 'generic',
          pushType: copy.pushType,
          copyRowId: copy.rowId,
          tone,
          lever: c.lever,
        },
      });
      if (result.delivered > 0) {
        stats.delivered++;
        await db.collection('push_rate').doc(uid).set({ firstWeek_sent: [...sentDaysFrom(rate), c.dayKey] }, { merge: true });
      }
    } catch (err) {
      logger.error(`[first-week] failed for uid=${uid}`, err);
    }
  });

  logger.info(`[first-week] Run complete — ${JSON.stringify(stats)}`);
  return stats;
}

/** One second-workout pass (exported for tests). Flag + hour checked by the caller. */
export async function runSecondWorkoutPass(db: admin.firestore.Firestore, nowMs: number): Promise<FirstWeekRunStats> {
  const stats: FirstWeekRunStats = { read: 0, due: 0, skipped: {}, delivered: 0 };
  const skip = (reason: string) => {
    stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
  };
  const from = admin.firestore.Timestamp.fromMillis(nowMs - 30 * DAY_MS);
  const to = admin.firestore.Timestamp.fromMillis(nowMs - DAY_MS);
  const candidates: Array<{ uid: string; data: Record<string, unknown> }> = [];
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
          const count = (data.progression as { workoutCount?: unknown } | undefined)?.workoutCount;
          // The flat counter, when present, rules out 0 and 2+ without a read.
          if (typeof count === 'number' && count !== 1) continue;
          candidates.push({ uid: d.id, data });
        }
      },
    );
  } catch (err) {
    if (candidates.length === 0) {
      logger.error('[second-workout] users query failed', err);
      return stats;
    }
    logger.error('[second-workout] users query failed after some pages, continuing with those', err);
  }

  await mapWithConcurrency(candidates, CONCURRENCY, async ({ uid, data }) => {
    try {
      let dates: number[];
      try {
        dates = await latestTwoWorkouts(db, uid);
      } catch (err) {
        logger.warn(`[second-workout] workouts lookup failed uid=${uid}, skipping (fail safe)`, err);
        skip('lookup_failed');
        return;
      }
      const rate = await readRate(db, uid);
      const sentFor = typeof rate?.secondWorkout_sentFor === 'number' ? rate.secondWorkout_sentFor : null;
      const firstWorkoutMs = dates.length === 1 ? dates[0] : null;
      const isDue = secondWorkoutDue({
        workoutCount: dates.length,
        firstWorkoutMs,
        nowMs,
        sentForMs: sentFor,
        kellyToday: dates.length === 1 ? await kellyToday(db, uid, nowMs) : false,
      });
      if (!isDue || firstWorkoutMs === null) {
        skip('not_due');
        return;
      }
      stats.due++;
      const audience = audienceFromUserData(data, new Date(nowMs));
      const toned = await resolveTonedCopy(
        'second_workout',
        { uid, now: new Date(nowMs), audience, vars: { '@שם': firstNameFromUserData(data) } },
        toneOrder(SECOND_WORKOUT_TONES, toneSegmentFrom(audience)),
      );
      if (!toned) {
        skip('no_copy');
        return;
      }
      const { copy, tone } = toned;
      const result = await sendPush({
        toUids: [uid],
        channel: 'retention',
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { triggerType: 'SecondWorkout', tone, ...pushCopyData(copy) },
        rateCapHours: 20,
        policyKind: 'proactive',
        measurement: {
          variantId: copy.rowId,
          category: 'SecondWorkout',
          persona: 'generic',
          pushType: copy.pushType,
          copyRowId: copy.rowId,
          tone,
          lever: 'second_workout',
        },
      });
      if (result.delivered > 0) {
        stats.delivered++;
        await db.collection('push_rate').doc(uid).set({ secondWorkout_sentFor: firstWorkoutMs }, { merge: true });
      }
    } catch (err) {
      logger.error(`[second-workout] failed for uid=${uid}`, err);
    }
  });

  logger.info(`[second-workout] Run complete — ${JSON.stringify(stats)}`);
  return stats;
}
