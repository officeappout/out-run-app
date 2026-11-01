/**
 * strengthQuizReminderScheduler — Scheduled Cloud Function (pilot AJ16, 01.11.2026).
 *
 * A user who signed up (and allowed push) but never finished the strength questionnaire got no
 * reminder at all. This sends "השלימו את שאלון הכוח" twice at most: once about 24h after signup,
 * once on day 3, then stops. It opens home with ?startWorkout=true, which routes a user without a
 * strength level into the questionnaire (behind the health-declaration gate).
 *
 * Skipped: a strength level already exists (domains/tracks > 0, same rule as the app), signups
 * still IN_PROGRESS/ONBOARDING (onboardingDropoffDispatcher owns those), running/walking-track
 * users, demo uids. Sent count + time live in push_rate/{uid}.strengthQuizReminders (only after a
 * real delivery). sendPush applies quiet hours, Shabbat, prefs and the daily cap.
 *
 * GATE: system_config/feature_flags.enable_strength_quiz_reminder_push — DEFAULT OFF (only an explicit
 * true sends; a failed flag read sends nothing).
 *
 * DEPLOY (owner's per-action OK): firebase deploy --only functions:strengthQuizReminderScheduler
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendPush } from './services/push.service';
import { resolvePushCopy, pushCopyData, audienceFromUserData, firstNameFromUserData } from './services/push-copy.service';
import { envInt, forEachQueryPage, mapWithConcurrency } from './lib/paginate';
import { isDemoUid } from './lib/demo';
import { activityToMillis } from './lib/user-activity';
import { hasStrength, pushTrackFromUserData } from './lib/push-lifecycle';

if (!admin.apps.length) admin.initializeApp();

export const STRENGTH_QUIZ_REMINDER_FLAG = 'enable_strength_quiz_reminder_push';
const PUSH_TYPE = 'strength_quiz_reminder';
const BATCH_LIMIT = envInt(process.env.STRENGTH_QUIZ_BATCH, 200, 500);
const MAX_PAGES = envInt(process.env.STRENGTH_QUIZ_MAX_PAGES, 10, 50);
const CONCURRENCY = 10;
const HOUR_MS = 3_600_000;

/** [from, to) hours after signup for send #1 and #2; the later edge leaves room for quiet hours / Shabbat. */
export const QUIZ_REMINDER_WINDOWS: ReadonlyArray<readonly [number, number]> = [[24, 72], [72, 120]];

/** Pure. Which send (0 or 1) is due now, or null. A missed first window never adds a third send. */
export function quizReminderDue(ageMs: number, sent: number): 0 | 1 | null {
  const ageH = ageMs / HOUR_MS;
  for (let i = 0; i < QUIZ_REMINDER_WINDOWS.length; i++) {
    const [from, to] = QUIZ_REMINDER_WINDOWS[i];
    if (ageH >= from && ageH < to) return sent <= i ? (i as 0 | 1) : null;
  }
  return null;
}

/** Pure. Whether this user is someone the quiz reminder is for at all. */
export function quizReminderCandidate(data: Record<string, unknown>): boolean {
  const status = data.onboardingStatus;
  if (status === 'IN_PROGRESS' || status === 'ONBOARDING') return false;
  if (hasStrength(data.progression as Parameters<typeof hasStrength>[0])) return false;
  const track = pushTrackFromUserData(data);
  return track !== 'run' && track !== 'walk';
}

export interface QuizReminderRunStats {
  read: number;
  candidates: number;
  delivered: number;
}

/** One run (exported for tests). */
export async function runStrengthQuizReminderPass(db: admin.firestore.Firestore, nowMs: number): Promise<QuizReminderRunStats> {
  const stats: QuizReminderRunStats = { read: 0, candidates: 0, delivered: 0 };
  let flags: Record<string, unknown> | undefined;
  try {
    flags = (await db.doc('system_config/feature_flags').get()).data() as Record<string, unknown> | undefined;
  } catch (err) {
    logger.error('[quiz-reminder] feature_flags read failed, aborting (fail closed)', err);
    return stats;
  }
  if (flags?.[STRENGTH_QUIZ_REMINDER_FLAG] !== true) {
    logger.info(`[quiz-reminder] ${STRENGTH_QUIZ_REMINDER_FLAG} !== true, skipping`);
    return stats;
  }

  const lastTo = QUIZ_REMINDER_WINDOWS[QUIZ_REMINDER_WINDOWS.length - 1][1];
  const from = admin.firestore.Timestamp.fromMillis(nowMs - lastTo * HOUR_MS);
  const to = admin.firestore.Timestamp.fromMillis(nowMs - QUIZ_REMINDER_WINDOWS[0][0] * HOUR_MS);
  const candidates: Array<{ uid: string; data: Record<string, unknown>; ageMs: number }> = [];
  try {
    await forEachQueryPage(
      db.collection('users').where('createdAt', '>=', from).where('createdAt', '<=', to).orderBy('createdAt', 'desc'),
      { pageSize: BATCH_LIMIT, maxPages: MAX_PAGES },
      (docs: admin.firestore.QueryDocumentSnapshot[]) => {
        for (const d of docs) {
          stats.read++;
          if (isDemoUid(d.id)) continue;
          const data = d.data() as Record<string, unknown>;
          const created = activityToMillis(data.createdAt);
          if (created === null || !quizReminderCandidate(data)) continue;
          candidates.push({ uid: d.id, data, ageMs: nowMs - created });
        }
      },
    );
  } catch (err) {
    if (candidates.length === 0) {
      logger.error('[quiz-reminder] users query failed', err);
      return stats;
    }
    logger.error('[quiz-reminder] users query failed after some pages, continuing with those', err);
  }

  await mapWithConcurrency(candidates, CONCURRENCY, async ({ uid, data, ageMs }) => {
    try {
      const rateRef = db.collection('push_rate').doc(uid);
      const sentRaw = (await rateRef.get()).get('strengthQuizReminders');
      const sent = typeof sentRaw === 'number' ? sentRaw : 0;
      const due = quizReminderDue(ageMs, sent);
      if (due === null) return;
      stats.candidates++;

      const now = new Date(nowMs);
      const copy = await resolvePushCopy(PUSH_TYPE, {
        uid,
        now,
        audience: audienceFromUserData(data, now),
        vars: { '@שם': firstNameFromUserData(data) },
      });
      if (!copy) return;
      const result = await sendPush({
        toUids: [uid],
        channel: 'onboarding_dropoff',
        title: copy.title,
        body: copy.body,
        deepLink: copy.deepLink,
        data: { triggerType: 'StrengthQuizReminder', ...pushCopyData(copy) },
        rateCapHours: 20,
        countTowardDailyCap: true,
        policyKind: 'proactive',
        measurement: {
          variantId: copy.rowId,
          category: 'StrengthQuizReminder',
          persona: 'generic',
          pushType: copy.pushType,
          copyRowId: copy.rowId,
          lever: 'progress',
        },
      });
      if (result.delivered > 0) {
        stats.delivered++;
        await rateRef.set({ strengthQuizReminders: due + 1, strengthQuizReminderAt: nowMs }, { merge: true });
      }
    } catch (err) {
      logger.error(`[quiz-reminder] failed for uid=${uid}`, err);
    }
  });

  logger.info(`[quiz-reminder] Run complete — ${JSON.stringify(stats)}`);
  return stats;
}

export const strengthQuizReminderScheduler = onSchedule(
  { schedule: '25 10-19 * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', memory: '256MiB', timeoutSeconds: 300, retryCount: 0 },
  async (event) => {
    const scheduled = Date.parse((event as { scheduleTime?: string } | undefined)?.scheduleTime ?? '');
    await runStrengthQuizReminderPass(admin.firestore(), Number.isFinite(scheduled) ? scheduled : Date.now());
  },
);
