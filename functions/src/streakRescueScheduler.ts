/**
 * streakRescueScheduler — Scheduled Cloud Function: the streak pushes (owner decisions
 * 21.10.2026, engagement-scenario-map rows 29–32).
 *
 * SLOTS (Israel time; the cron fires at :00/:15/:30 of 10, 19, 20, 21 and every run that is
 * not one of these four is a no-op — one function instead of four deploys):
 *   10:00  broken     yesterday broke the streak (it was ≥7) → "הרצף נעצר. השיא נשאר".
 *                     The in-app card (home v2) is for every streak ≥2; the push only ≥7.
 *   19:30  rescue     streak ≥2, today not closed → the shortest way to close it.
 *   20:00  milestone  the streak reached 3/7/14/30/50/100/365 today and the app's
 *                     celebration wasn't seen (streaks/{uid}.milestoneSeen).
 *   21:15  rescue_late streak ≥7, still not closed, the 19:30 push was not opened.
 *
 * "IS TODAY CLOSED?" — the same rule as the app (shared/streak-day.core.ts, a byte-for-byte
 * mirror of src/features/activity/lib/streak-day.core.ts): the streak doc already counted
 * today, OR dailyActivity/{uid}_{today} has ≥10 active minutes or the step goal, OR the
 * day's saved workouts add up to ≥10 minutes. The Saturday rule
 * (enable_shabbat_free_streak) and shields (enable_streak_shields) decide whether a gap
 * keeps the streak alive — read from the same panel doc the app reads.
 *
 * STANDALONE (owner, 21.10.2026: Kelly AI is not for everyone): nothing here depends on
 * Kelly. The only coordination is read-only — when Kelly's proactive ledger
 * (ai_coach_proactive/{uid}.lastSentDate, written by the Kelly proactive run) says Kelly
 * already sent this user a proactive message today, this slot is skipped for them. A failed
 * ledger read never blocks our push.
 *
 * GATE: system_config/feature_flags.enable_streak_pushes — DEFAULT OFF (only an explicit
 * true sends). Fails CLOSED on a read error.
 *
 * QUERY: streaks by lastActivityDate (single-field range, the automatic index), bounded
 * pages — only users whose streak can matter in this slot (rescue: last counted day within
 * 4 days; broken: 2 to 6 days ago; milestone: today). Per candidate a handful of point
 * reads (push_rate, the Kelly ledger, users, dailyActivity) and, for a rescue, one indexed
 * workouts query (userId ASC + date DESC, limit 5). Concurrency 10.
 *
 * DELIVERY: sendPush on 'progression' (the user's "streak / level" toggle), counted in the
 * daily engagement cap (countTowardDailyCap). The 19:30 rescue has cap PRIORITY: counted,
 * never blocked by the cap (dailyCapPriority). Quiet hours, Shabbat observers, prefs and the
 * kill switches apply as to every push. Once per slot per user per day (broken: once per
 * broken streak), recorded in push_rate/{uid}.streakPush only after a real delivery.
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
import { activityToMillis, israelDateKey } from './lib/user-activity';
import {
  STREAK_BROKEN_PUSH_MIN,
  dayKeyAdd,
  dayLeftToClose,
  isDayClosed,
  isStreakMilestone,
  rescueDue,
  streakBrokeYesterday,
  streakPushSlotAt,
  type StreakDayCounts,
  type StreakPolicy,
  type StreakPushSlot,
  type StreakSnapshot,
} from './shared/streak-day.core';

if (!admin.apps.length) {
  admin.initializeApp();
}

const BATCH_LIMIT = envInt(process.env.STREAK_PUSH_BATCH, 300, 500);
const MAX_PAGES = envInt(process.env.STREAK_PUSH_MAX_PAGES, 20, 100);
const CONCURRENCY = 10;
const TZ = 'Asia/Jerusalem';

/** Kelly's proactive ledger (src/lib/ai/coach/proactive/loaders.server.ts PROACTIVE_LEDGER) — read only. */
export const KELLY_PROACTIVE_LEDGER = 'ai_coach_proactive';

export interface StreakRunStats {
  slot: StreakPushSlot | null;
  read: number;
  candidates: number;
  closed: number;
  skippedKelly: number;
  delivered: number;
}

/** 'HH:MM' in Israel. */
export function israelHHMM(ms: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

export function streakPolicyFrom(flags: Record<string, unknown> | undefined): StreakPolicy {
  return { shabbatFree: flags?.enable_shabbat_free_streak === true, shields: flags?.enable_streak_shields === true };
}

function snapshotOf(d: Record<string, unknown>): StreakSnapshot {
  return {
    currentStreak: Number(d.currentStreak) || 0,
    lastStreakDate: typeof d.lastActivityDate === 'string' ? d.lastActivityDate : '',
    shields: Number(d.shields) || 0,
  };
}

/** Kelly already sent this user a proactive message today (read-only; a failed read → false). */
export async function kellySentToday(db: admin.firestore.Firestore, uid: string, todayKey: string): Promise<boolean> {
  try {
    const snap = await db.collection(KELLY_PROACTIVE_LEDGER).doc(uid).get();
    return snap.exists && (snap.data() as Record<string, unknown> | undefined)?.lastSentDate === todayKey;
  } catch (err) {
    logger.warn(`[streak-push] Kelly ledger read failed uid=${uid}, sending ours`, err);
    return false;
  }
}

async function dayDoc(db: admin.firestore.Firestore, uid: string, key: string): Promise<StreakDayCounts | null> {
  const snap = await db.collection('dailyActivity').doc(`${uid}_${key}`).get();
  return snap.exists ? (snap.data() as StreakDayCounts) : null;
}

/** Minutes of the workouts saved on `todayKey` (Israel day). Throws on query failure. */
export async function workoutMinutesOn(db: admin.firestore.Firestore, uid: string, todayKey: string): Promise<number> {
  const snap = await db
    .collection('workouts')
    .where('userId', '==', uid)
    .orderBy('date', 'desc')
    .limit(5)
    .select('date', 'duration')
    .get();
  let seconds = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const ms = activityToMillis(data.date);
    if (ms !== null && israelDateKey(ms) === todayKey) seconds += Number(data.duration) || 0;
  }
  return seconds / 60;
}

type StreakPushLog = Partial<Record<StreakPushSlot, string>> & { rescuePushId?: string };

function pushLogFrom(rate: Record<string, unknown> | undefined): StreakPushLog {
  const v = rate?.streakPush;
  return v && typeof v === 'object' ? (v as StreakPushLog) : {};
}

interface Candidate {
  uid: string;
  snap: StreakSnapshot;
  longest: number;
  /** The once-only key of this slot (today, or the broken streak's last day). */
  key: string;
}

function queryFor(db: admin.firestore.Firestore, slot: StreakPushSlot, todayKey: string) {
  const coll = db.collection('streaks');
  switch (slot) {
    case 'rescue':
    case 'rescue_late':
      return coll.where('lastActivityDate', '>=', dayKeyAdd(todayKey, -4)).where('lastActivityDate', '<', todayKey).orderBy('lastActivityDate');
    case 'broken':
      return coll
        .where('lastActivityDate', '>=', dayKeyAdd(todayKey, -6))
        .where('lastActivityDate', '<=', dayKeyAdd(todayKey, -2))
        .orderBy('lastActivityDate');
    case 'milestone':
      return coll.where('lastActivityDate', '==', todayKey);
  }
}

/** Pure pre-filter on the streak doc alone (no reads). */
export function candidateFor(
  slot: StreakPushSlot,
  uid: string,
  data: Record<string, unknown>,
  todayKey: string,
  policy: StreakPolicy,
): Candidate | null {
  const snap = snapshotOf(data);
  const longest = Math.max(Number(data.longestStreak) || 0, snap.currentStreak);
  switch (slot) {
    case 'rescue':
    case 'rescue_late':
      // Data closure is checked later (reads); here only the streak itself.
      return rescueDue({ slot, todayKey, snapshot: snap, policy, closedByData: false, firstOpened: false })
        ? { uid, snap, longest, key: todayKey }
        : null;
    case 'broken':
      return snap.currentStreak >= STREAK_BROKEN_PUSH_MIN && streakBrokeYesterday(snap, todayKey, policy)
        ? { uid, snap, longest, key: snap.lastStreakDate }
        : null;
    case 'milestone':
      return snap.lastStreakDate === todayKey &&
        isStreakMilestone(snap.currentStreak) &&
        Number(data.milestoneSeen) !== snap.currentStreak
        ? { uid, snap, longest, key: `${todayKey}:${snap.currentStreak}` }
        : null;
  }
}

/** One run (exported for tests). `nowMs` = the scheduled time. */
export async function runStreakPushPass(db: admin.firestore.Firestore, nowMs: number): Promise<StreakRunStats> {
  const slot = streakPushSlotAt(israelHHMM(nowMs));
  const stats: StreakRunStats = { slot, read: 0, candidates: 0, closed: 0, skippedKelly: 0, delivered: 0 };
  if (!slot) return stats;

  let flags: Record<string, unknown> | undefined;
  try {
    flags = (await db.doc('system_config/feature_flags').get()).data() as Record<string, unknown> | undefined;
  } catch (err) {
    logger.error('[streak-push] feature_flags read failed, aborting (fail closed)', err);
    return stats;
  }
  if (flags?.enable_streak_pushes !== true) {
    logger.info('[streak-push] enable_streak_pushes !== true, skipping');
    return stats;
  }
  const policy = streakPolicyFrom(flags);
  const todayKey = israelDateKey(nowMs);

  const candidates: Candidate[] = [];
  try {
    await forEachQueryPage(
      queryFor(db, slot, todayKey),
      { pageSize: BATCH_LIMIT, maxPages: MAX_PAGES },
      (docs: admin.firestore.QueryDocumentSnapshot[]) => {
        for (const d of docs) {
          stats.read++;
          if (isDemoUid(d.id)) continue;
          const c = candidateFor(slot, d.id, d.data() as Record<string, unknown>, todayKey, policy);
          if (c) candidates.push(c);
        }
      },
    );
  } catch (err) {
    if (candidates.length === 0) {
      logger.error(`[streak-push] streaks query failed (slot=${slot})`, err);
      return stats;
    }
    logger.error('[streak-push] streaks query failed after some pages, continuing with those', err);
  }
  stats.candidates = candidates.length;

  await mapWithConcurrency(candidates, CONCURRENCY, async (c) => {
    try {
      await sendOne(db, slot, c, todayKey, policy, nowMs, stats);
    } catch (err) {
      logger.error(`[streak-push] failed for uid=${c.uid} slot=${slot}`, err);
    }
  });

  logger.info(`[streak-push] Run complete — ${JSON.stringify(stats)}`);
  return stats;
}

async function sendOne(
  db: admin.firestore.Firestore,
  slot: StreakPushSlot,
  c: Candidate,
  todayKey: string,
  policy: StreakPolicy,
  nowMs: number,
  stats: StreakRunStats,
): Promise<void> {
  const { uid } = c;
  const rateRef = db.collection('push_rate').doc(uid);
  const rateSnap = await rateRef.get();
  const log = pushLogFrom(rateSnap.exists ? (rateSnap.data() as Record<string, unknown>) : undefined);
  if (log[slot] === c.key) return; // already sent for this slot

  let left = { minutes: 0, steps: 0 };
  if (slot === 'rescue' || slot === 'rescue_late') {
    let day: StreakDayCounts | null;
    let workoutMinutes: number;
    try {
      day = await dayDoc(db, uid, todayKey);
      workoutMinutes = await workoutMinutesOn(db, uid, todayKey);
    } catch (err) {
      logger.warn(`[streak-push] day lookup failed uid=${uid}, skipping (fail safe)`, err);
      return;
    }
    if (isDayClosed(day, workoutMinutes)) {
      stats.closed++;
      return;
    }
    left = dayLeftToClose(day, workoutMinutes);
    if (slot === 'rescue_late') {
      // Second rescue only when the first wasn't opened (a first that wasn't sent counts as not opened).
      const firstId = log.rescue === todayKey ? log.rescuePushId : undefined;
      if (firstId) {
        const opened = await db.collection('push_events').doc(`${firstId}_${uid}_push_opened`).get();
        if (opened.exists) return;
      }
      if (!rescueDue({ slot, todayKey, snapshot: c.snap, policy, closedByData: false, firstOpened: false })) return;
    }
  } else if (slot === 'broken') {
    // Yesterday closed by the data (e.g. background steps the app never counted) → not broken.
    try {
      if (isDayClosed(await dayDoc(db, uid, dayKeyAdd(todayKey, -1)))) {
        stats.closed++;
        return;
      }
    } catch (err) {
      logger.warn(`[streak-push] yesterday lookup failed uid=${uid}, skipping (fail safe)`, err);
      return;
    }
  }

  if (await kellySentToday(db, uid, todayKey)) {
    stats.skippedKelly++;
    return;
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : undefined;
  const now = new Date(nowMs);
  const pushType = slot === 'broken' ? 'streak_broken' : slot === 'milestone' ? 'streak_milestone' : 'streak_rescue';
  const copy = await resolvePushCopy(pushType, {
    uid,
    now,
    audience: audienceFromUserData(userData, now),
    vars: {
      '@שם': firstNameFromUserData(userData),
      '@רצף': c.snap.currentStreak,
      '@שיא': c.longest,
      ...(slot === 'rescue' || slot === 'rescue_late'
        ? { '@צעדים_שנותרו': left.steps.toLocaleString('en-US'), '@דקות': left.minutes }
        : {}),
    },
    conditions:
      slot === 'milestone'
        ? { milestone: String(c.snap.currentStreak) }
        : slot === 'broken'
          ? {}
          : { when: slot === 'rescue' ? 'first' : 'late' },
    params: left.steps > 0 ? { targetSteps: left.steps } : {},
  });
  if (!copy) return;

  const result = await sendPush({
    toUids: [uid],
    channel: 'progression',
    title: copy.title,
    body: copy.body,
    deepLink: copy.deepLink,
    data: { triggerType: 'Streak', slot, ...pushCopyData(copy) },
    rateCapHours: 0,
    countTowardDailyCap: true,
    ...(slot === 'rescue' ? { dailyCapPriority: true } : {}),
    measurement: {
      variantId: copy.rowId,
      category: 'Streak',
      persona: 'generic',
      pushType: copy.pushType,
      copyRowId: copy.rowId,
    },
  });
  if (result.delivered > 0) {
    stats.delivered++;
    const next: StreakPushLog = { ...log, [slot]: c.key };
    if (slot === 'rescue' && result.pushId) next.rescuePushId = result.pushId;
    await rateRef.set({ streakPush: next }, { merge: true });
  }
}

export const streakRescueScheduler = onSchedule(
  {
    schedule: '0,15,30 10,19,20,21 * * *',
    timeZone: TZ,
    region: 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB',
    retryCount: 0,
  },
  async (event) => {
    const scheduled = Date.parse((event as { scheduleTime?: string } | undefined)?.scheduleTime ?? '');
    await runStreakPushPass(admin.firestore(), Number.isFinite(scheduled) ? scheduled : Date.now());
  },
);
