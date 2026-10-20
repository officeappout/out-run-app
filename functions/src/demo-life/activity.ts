/**
 * The live engine, activity half (Firestore I/O): for each persona, the difference between
 * the planner's day at the previous tick and now —
 *   - a finished session → workouts (create: a re-run can never double it), the feed post
 *     (ageGroup 'demo'), the park check-in, XP / coins on the profile (in the SAME batch as
 *     the create, so they are counted once), the schedule entry marked done, then league
 *     credit through the same exactly-once helper the trigger uses;
 *   - the day's minutes / steps changed → dailyActivity + dailyActivityPublic, and the
 *     day's steps through the delta-idempotent league helper;
 *   - the day first qualifies → the streak (transaction, keyed by lastActivityDate);
 *   - a session in progress → a presence ping in group mode, demo groups only.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { applyStepsToLeagueStats, applyWorkoutToLeagueStats } from '../lib/apply-league-stats';
import { dailyActivityDoc, dailyActivityPublicDoc } from './daily-docs';
import { dayState, daySignature, weekMinutes, type DayState, type PlannedSession } from './day-plan';
import type { LifePersona } from './persona';
import { markEntryCompleted, rollForwardSchedule, SCHEDULE_LOOKAHEAD_DAYS } from './schedule-docs';
import { addDays, israelMs, israelParts } from './time';
import { isAlreadyExists, type GuardedWriter } from './writer';

export interface ActivityCounters {
  workouts: number;
  posts: number;
  dayDocs: number;
  streaks: number;
  presenceSet: number;
  presenceCleared: number;
  schedulesRolled: number;
  workoutCapHit: boolean;
}

export interface FinishedWorkout {
  persona: LifePersona;
  session: PlannedSession;
  date: string;
}

const ts = () => FieldValue.serverTimestamp();
const END_OF_DAY = 24 * 60 - 1;

/** The days a tick must look at: today, and yesterday when the last tick was yesterday (late sessions). */
export function daysToProcess(nowMs: number, lastTickAtMs: number | null): Array<{ date: string; dow: number; fromMs: number | null; toMs: number; toMinute: number }> {
  const now = israelParts(nowMs);
  const out: Array<{ date: string; dow: number; fromMs: number | null; toMs: number; toMinute: number }> = [];
  const last = lastTickAtMs !== null && lastTickAtMs < nowMs ? israelParts(lastTickAtMs) : null;
  if (last && last.date === addDays(now.date, -1)) {
    out.push({ date: last.date, dow: last.dow, fromMs: lastTickAtMs, toMs: israelMs(last.date, END_OF_DAY), toMinute: END_OF_DAY });
  }
  out.push({ date: now.date, dow: now.dow, fromMs: last && last.date === now.date ? lastTickAtMs : null, toMs: nowMs, toMinute: now.minuteOfDay });
  return out;
}

async function writeWorkout(w: GuardedWriter, p: LifePersona, x: PlannedSession, date: string, schedule: Record<string, unknown> | undefined): Promise<boolean> {
  const done = x.done!;
  const batch = w.batch();
  for (const d of done.docs) w.add(batch, d.path.startsWith('workouts/') ? 'create' : 'set', d.path, d.data);
  w.add(batch, 'update', `users/${p.uid}`, {
    'progression.globalXP': FieldValue.increment(done.xp),
    'progression.coins': FieldValue.increment(done.minutes),
    'progression.totalCaloriesBurned': FieldValue.increment(done.calories),
    lastActive: new Date(x.endMs),
    updatedAt: new Date(x.endMs),
  });
  const entries = schedule ? markEntryCompleted(schedule, x.s.i, done.workoutId) : null;
  if (entries) w.add(batch, 'merge', `userSchedule/${p.uid}_${date}`, { entries, updatedAt: new Date(x.endMs) });
  try {
    await batch.commit();
  } catch (e) {
    if (isAlreadyExists(e)) return false; // an earlier run wrote it — nothing counted twice
    throw e;
  }
  const workout = done.docs.find((d) => d.path.startsWith('workouts/'));
  if (workout) await applyWorkoutToLeagueStats(w.db, ts, done.workoutId!, { ...workout.data, date: Timestamp.fromDate(workout.data.date as Date) });
  return true;
}

/** Streak once a day: +1 after yesterday, else a fresh 1. Returns the current streak. */
async function bumpStreak(w: GuardedWriter, p: LifePersona, date: string): Promise<number> {
  const ref = w.check(`streaks/${p.uid}`, { ageGroup: 'demo' }, true);
  const userRef = w.check(`users/${p.uid}`, {}, true);
  return w.db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() ?? {};
    const last = typeof cur.lastActivityDate === 'string' ? cur.lastActivityDate : null;
    const current = typeof cur.currentStreak === 'number' ? cur.currentStreak : 0;
    if (last === date) return current;
    const next = last === addDays(date, -1) ? current + 1 : 1;
    const longest = Math.max(typeof cur.longestStreak === 'number' ? cur.longestStreak : 0, next);
    tx.set(
      ref,
      { userId: p.uid, currentStreak: next, longestStreak: longest, lastActivityDate: date, authorityId: p.authorityId, ...(p.neighborhoodId ? { neighborhoodId: p.neighborhoodId } : {}), ageGroup: 'demo', isDemo: true, updatedAt: new Date() },
      { merge: true },
    );
    tx.update(userRef, { 'progression.currentStreak': next, 'progression.longestStreak': longest });
    w.writes += 2;
    return next;
  });
}

async function writeDayDocs(w: GuardedWriter, p: LifePersona, date: string, dow: number, st: DayState, streak: number | null): Promise<void> {
  const now = new Date();
  const weekly = weekMinutes(p, date, dow, st);
  const daily = dailyActivityDoc({
    uid: p.uid,
    date,
    displayName: p.name,
    authorityId: p.authorityId,
    neighborhoodId: p.neighborhoodId,
    dayMin: st.dayMin,
    weekly,
    daySessions: st.daySessions,
    steps: st.steps,
    stepGoal: p.stepGoal,
    floors: st.floors,
    calories: st.calories,
    distanceMeters: st.distanceMeters,
    streak: streak ?? 0,
    updatedAt: now,
  });
  // The streak field is written only when this tick computed it (merge keeps the last value).
  if (streak === null) delete daily.data.streak;
  const batch = w.batch();
  w.add(batch, 'merge', daily.path, daily.data);
  const pub = dailyActivityPublicDoc({ uid: p.uid, date, displayName: p.name, steps: st.steps, authorityId: p.authorityId, updatedAt: now });
  w.add(batch, 'set', pub.path, pub.data);
  await batch.commit();
  if (st.steps > 0) await applyStepsToLeagueStats(w.db, ts, p.uid, date, st.steps, st.distanceMeters);
}

/** Keeps userSchedule one week ahead (cloned from the same weekday); returns today's schedule docs. */
export async function ensureSchedules(
  w: GuardedWriter,
  personas: LifePersona[],
  today: string,
  todayDow: number,
  firstTickToday: boolean,
): Promise<{ todayDocs: Map<string, Record<string, unknown>>; rolled: number }> {
  const withToday = personas.filter((p) => p.sessions.some((s) => s.dow === todayDow));
  const todaySnaps = withToday.length ? await w.db.getAll(...withToday.map((p) => w.db.doc(`userSchedule/${p.uid}_${today}`))) : [];
  const todayDocs = new Map<string, Record<string, unknown>>();
  todaySnaps.forEach((s, k) => s.exists && todayDocs.set(withToday[k].uid, s.data()!));
  if (!firstTickToday) return { todayDocs, rolled: 0 };

  // Once a day: today (cold start / after a pause) and today + 7, each cloned from 7 days before.
  let rolled = 0;
  const batch = w.batch();
  const missingToday = withToday.filter((p) => !todayDocs.has(p.uid));
  const weekAgo = addDays(today, -SCHEDULE_LOOKAHEAD_DAYS);
  const ahead = addDays(today, SCHEDULE_LOOKAHEAD_DAYS);
  const needAhead = withToday;
  const reads = [
    ...missingToday.map((p) => w.db.doc(`userSchedule/${p.uid}_${weekAgo}`)),
    ...needAhead.map((p) => w.db.doc(`userSchedule/${p.uid}_${ahead}`)),
  ];
  const snaps = reads.length ? await w.db.getAll(...reads) : [];
  const now = new Date();
  missingToday.forEach((p, k) => {
    const src = snaps[k];
    const doc = src?.exists ? rollForwardSchedule(src.data()!, weekAgo, today, p.uid, now) : null;
    if (!doc) return;
    w.add(batch, 'set', `userSchedule/${p.uid}_${today}`, doc);
    todayDocs.set(p.uid, doc);
    rolled++;
  });
  needAhead.forEach((p, k) => {
    if (snaps[missingToday.length + k]?.exists) return;
    const src = todayDocs.get(p.uid);
    const doc = src ? rollForwardSchedule(src, today, ahead, p.uid, now) : null;
    if (!doc) return;
    w.add(batch, 'set', `userSchedule/${p.uid}_${ahead}`, doc);
    rolled++;
  });
  if (rolled) await batch.commit();
  return { todayDocs, rolled };
}

export interface ActivityInput {
  personas: LifePersona[];
  nowMs: number;
  lastTickAtMs: number | null;
  todaySchedules: Map<string, Record<string, unknown>>;
  /** How many more workouts the daily cap allows. */
  workoutBudget: number;
  /** uid → effective demo groups (seeded + joined by the engine). */
  groupsOf: (p: LifePersona) => string[];
  presenceUids: string[];
}

export async function runActivity(w: GuardedWriter, input: ActivityInput): Promise<{ counters: ActivityCounters; finished: FinishedWorkout[]; presenceUids: string[] }> {
  const c: ActivityCounters = { workouts: 0, posts: 0, dayDocs: 0, streaks: 0, presenceSet: 0, presenceCleared: 0, schedulesRolled: 0, workoutCapHit: false };
  const finished: FinishedWorkout[] = [];
  const active = new Map<string, { p: LifePersona; x: PlannedSession }>();
  const today = israelParts(input.nowMs).date;
  let budget = input.workoutBudget;

  for (const day of daysToProcess(input.nowMs, input.lastTickAtMs)) {
    for (const p of input.personas) {
      const cur = dayState(p, day.date, day.dow, day.toMs, day.toMinute);
      const prev = day.fromMs === null ? null : dayState(p, day.date, day.dow, day.fromMs, israelParts(day.fromMs).minuteOfDay);
      const before = new Set((prev?.ended ?? []).map((x) => x.s.i));
      const fresh = cur.ended.filter((e) => !before.has(e.s.i) && e.done?.workoutId);
      if (fresh.length > budget) {
        // Daily cap reached: this persona's day stops here (no workout, no day docs that would count it).
        c.workoutCapHit = true;
        continue;
      }
      for (const x of fresh) {
        const schedule = day.date === today ? input.todaySchedules.get(p.uid) : undefined;
        if (await writeWorkout(w, p, x, day.date, schedule)) {
          budget--;
          c.workouts++;
          if (x.done!.shared) c.posts++;
          finished.push({ persona: p, session: x, date: day.date });
        }
      }
      if (prev && daySignature(prev) === daySignature(cur)) continue;
      const streak = cur.qualifies && !prev?.qualifies ? await bumpStreak(w, p, day.date) : null;
      if (streak !== null) c.streaks++;
      await writeDayDocs(w, p, day.date, day.dow, cur, streak);
      c.dayDocs++;
      if (day.date === today && cur.active) active.set(p.uid, { p, x: cur.active });
    }
  }
  // Sessions in progress whose day docs did not change this tick still need their ping.
  for (const p of input.personas) {
    if (active.has(p.uid)) continue;
    const now = israelParts(input.nowMs);
    const st = dayState(p, now.date, now.dow, input.nowMs, now.minuteOfDay);
    if (st.active) active.set(p.uid, { p, x: st.active });
  }

  const batch = w.batch();
  const live: string[] = [];
  for (const { p, x } of Array.from(active.values())) {
    const groups = input.groupsOf(p);
    if (!groups.length || !x.done) continue;
    const at = x.s.kind === 'strength' && p.park ? p.park : p.home;
    w.add(batch, 'set', `presence/${p.uid}`, {
      uid: p.uid,
      name: p.name,
      ageGroup: 'adult',
      isVerified: false,
      schoolName: null,
      mode: 'group',
      lat: at.lat,
      lng: at.lng,
      authorityId: p.authorityId,
      activity: { status: x.s.kind === 'strength' ? 'strength' : x.s.kind === 'run' ? 'running' : 'walking', workoutTitle: x.s.title, startedAt: x.startMs },
      gender: p.gender,
      audienceGroupIds: groups,
      isDemo: true,
      updatedAt: ts(),
    });
    live.push(p.uid);
    c.presenceSet++;
  }
  for (const uid of input.presenceUids) {
    if (live.includes(uid)) continue;
    w.add(batch, 'delete', `presence/${uid}`);
    c.presenceCleared++;
  }
  if (live.length || c.presenceCleared) await batch.commit();
  return { counters: c, finished, presenceUids: live };
}
