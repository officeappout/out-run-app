/**
 * 60 days of a persona's life (pure, deterministic per persona + date):
 * workouts (strength / runs / walks in the app's WorkoutHistoryEntry shape), the schedule
 * days (userSchedule, completed + completedWorkoutId), dailyActivity + steps, the public
 * steps mirror (ageGroup 'demo'), feed posts (ageGroup 'demo'), park check-ins
 * (sessions, demo authority) and the streak.
 *
 * Realism knobs (design §3.2): adherence 0.45–0.9, preferred time ± ~45 min, duration
 * ±15 %, pace ±4 % with a slow improvement over the weeks, 8 % "weak week", quieter
 * weekends, an optional break (S15 sick / S30 away).
 */
import { postActivityCredit } from '@/features/social/services/feed-hybrid';
import { DEFAULT_DAILY_GOALS, DEFAULT_WEEKLY_GOALS } from '@/features/activity/types/activity.types';
import { isoDate } from '@/features/schedule/walking/walkSchedule';
import { RUNNING_SLOT_NAME_HE } from '@/features/schedule/engine/runningRules';
import { between, gauss, rngFrom, roll } from './rng';
import { loopRoute, type LatLng } from './geo';
import type { Persona } from './personas';
import { scheduleEntriesFor, startTimeOf, strengthNameHe, type DemoSession, type DemoWeek } from './schedule';

export interface DemoPark {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface PersonaContext {
  persona: Persona;
  uid: string;
  week: DemoWeek;
  /** City: the demo city. Unit: the demo unit (tenant) id. */
  authorityId: string;
  neighborhoodId: string | null;
  tenantId: string;
  unitId: string | null;
  home: LatLng;
  /** Real parks of the real city — referenced read-only (sessions.parkId). */
  parks: DemoPark[];
  groupIds: string[];
}

export interface DocWrite {
  path: string;
  data: Record<string, unknown>;
}

export interface PersonaHistory {
  docs: DocWrite[];
  workoutIds: string[];
  steps: Array<{ date: string; steps: number; distanceMeters: number }>;
  streak: { current: number; longest: number; lastActivityDate: string | null };
  totals: { workouts: number; xp: number; calories: number; coins: number; minutes: number };
}

const PACE_BY_LEVEL: Record<string, number> = { beginner: 6.9, intermediate: 5.7, advanced: 4.9 };
const PACE_FACTOR_BY_SLOT: Record<string, number> = { quality_primary: 0.9, quality_secondary: 0.93, long_run: 1.08, easy_run: 1.1, recovery: 1.2 };

function sessionDate(day: Date, s: DemoSession, index: number, r: () => number): Date {
  const [h, m] = startTimeOf(s.window).split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  const jitterMin = Math.round(gauss(r) * 25) + index * 90;
  return new Date(d.getTime() + jitterMin * 60_000);
}

function categoryMetrics(minutes: number, goal: number, weekly: number, weeklyGoal: number, sessions: number) {
  return {
    minutes,
    goalMinutes: goal,
    weeklyMinutes: weekly,
    weeklyGoalMinutes: weeklyGoal,
    percentage: Math.min(100, Math.round((minutes / goal) * 100)),
    isGoalMet: minutes >= goal,
    sessions,
  };
}

type Cat = 'strength' | 'cardio' | 'maintenance';

/** The workout + feed post (+ check-in) of one done session. */
function doneSession(ctx: PersonaContext, s: DemoSession, at: Date, date: string, i: number, weeksAgo: number, r: () => number): {
  workoutId: string | null;
  docs: DocWrite[];
  cat: Cat;
  minutes: number;
  xp: number;
  calories: number;
  extraSteps: number;
} {
  const { persona: p, uid } = ctx;
  const minutes = Math.max(10, Math.round(s.minutes * (1 + gauss(r) * 0.08)));
  if (s.kind === 'mobility') return { workoutId: null, docs: [], cat: 'maintenance', minutes, xp: 0, calories: minutes * 3, extraSteps: 0 };

  const workoutId = `${uid}_w_${date}_${i}`;
  const docs: DocWrite[] = [];
  const base = {
    userId: uid,
    date: at,
    createdAt: at,
    duration: minutes * 60,
    earnedCoins: minutes,
    authorityId: ctx.authorityId,
    ...(ctx.neighborhoodId ? { neighborhoodId: ctx.neighborhoodId } : {}),
    isDemo: true,
  };
  let cat: Cat;
  let distanceKm = 0;
  let pace = 0;
  let title: string;
  let extraSteps = 0;
  let calories: number;
  let workout: Record<string, unknown>;
  const park = ctx.parks.length ? ctx.parks[Math.floor(roll(`${uid}|park`) * ctx.parks.length)] : null;

  if (s.kind === 'strength') {
    cat = 'strength';
    title = strengthNameHe(s.slug ?? 'full_body');
    calories = Math.round(minutes * 6.5);
    const setsPlanned = Math.round(minutes / 2.6);
    workout = {
      ...base,
      activityType: 'strength',
      workoutType: 'strength',
      category: 'strength',
      displayIcon: 'dumbbell',
      distance: 0,
      pace: 0,
      calories,
      setsPlanned,
      setsCompleted: Math.max(1, setsPlanned - (r() < 0.3 ? 1 : 0)),
      difficulty: 2,
      routePath: [],
      // The real park's NAME only — no parkId on the workout (real parks' activity
      // overlays read workouts by parkId; check-ins below carry the demo authority).
      ...(p.parkUser && park ? { parkName: park.name } : {}),
    };
    if (p.parkUser && park) {
      docs.push({ path: `sessions/${uid}_chk_${date}_${i}`, data: { authorityId: ctx.authorityId, parkId: park.id, userId: uid, date: at, isDemo: true } });
    }
  } else {
    cat = 'cardio';
    const isRun = s.kind === 'run';
    const level = ctx.week.running?.level ?? 'beginner';
    const improve = 1 + weeksAgo * 0.003;
    pace = isRun
      ? (PACE_BY_LEVEL[level] ?? 6.2) * (PACE_FACTOR_BY_SLOT[s.slot ?? 'easy_run'] ?? 1) * improve * (1 + gauss(r) * 0.04)
      : (p.age >= 65 ? 13 : 11) * (1 + gauss(r) * 0.04);
    distanceKm = +(minutes / pace).toFixed(2);
    title = isRun ? RUNNING_SLOT_NAME_HE[s.slot ?? 'easy_run'] : s.walk?.isLong ? 'הליכה ארוכה' : 'הליכה מהירה';
    calories = Math.round(minutes * (isRun ? 10.5 : 4.5));
    extraSteps = Math.round(minutes * (isRun ? 160 : 105));
    const start = park && r() < 0.5 ? { lat: park.lat, lng: park.lng } : ctx.home;
    workout = {
      ...base,
      activityType: isRun ? 'running' : 'walking',
      workoutType: isRun ? 'running' : 'walking',
      category: 'cardio',
      displayIcon: isRun ? 'run-fast' : 'walk',
      distance: distanceKm,
      pace: +pace.toFixed(2),
      calories,
      routePath: loopRoute(start, distanceKm, r),
    };
  }
  const xp = Math.round(minutes * (cat === 'strength' ? 2 : 1.5));
  docs.push({ path: `workouts/${workoutId}`, data: { ...workout, xpEarned: xp } });

  if (roll(`${uid}|${date}|${i}|share`) < p.shareRate) {
    const durationMinutes = minutes;
    docs.push({
      path: `feed_posts/${uid}_post_${date}_${i}`,
      data: {
        authorUid: uid,
        authorName: p.name,
        type: 'workout',
        activityCategory: cat,
        durationMinutes,
        activityCredit: postActivityCredit({ activityCategory: cat, durationMinutes }),
        distanceKm: distanceKm || null,
        paceMinPerKm: pace ? +pace.toFixed(2) : null,
        paceSecPerKm: pace ? Math.round(pace * 60) : null,
        runSegment: null,
        intensityLevel: null,
        title,
        audience: 'partners',
        authorityId: ctx.authorityId,
        neighborhoodId: ctx.neighborhoodId,
        schoolId: null,
        parkId: null,
        parkName: s.kind === 'strength' && p.parkUser && park ? park.name : null,
        // Never 'adult' / 'minor': no real board's age query can return a demo post.
        ageGroup: 'demo',
        gender: p.gender,
        programId: s.slug ?? null,
        groupIds: ctx.groupIds,
        xpAwarded: xp,
        tenantId: ctx.tenantId,
        ...(ctx.unitId ? { unitId: ctx.unitId } : {}),
        isDemo: true,
        createdAt: new Date(at.getTime() + minutes * 60_000),
      },
    });
  }
  return { workoutId, docs, cat, minutes, xp, calories, extraSteps };
}

const dayKeyOffset = (today: Date, offset: number) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  return { d, date: isoDate(d) };
};

export function buildHistory(ctx: PersonaContext, today: Date, historyDays: number, aheadDays: number): PersonaHistory {
  const { persona: p, uid } = ctx;
  const docs: DocWrite[] = [];
  const workoutIds: string[] = [];
  const steps: PersonaHistory['steps'] = [];
  const totals = { workouts: 0, xp: 0, calories: 0, coins: 0, minutes: 0 };
  const qualifies: boolean[] = [];
  const weekly: Record<Cat, number> = { strength: 0, cardio: 0, maintenance: 0 };

  for (let off = -historyDays; off <= aheadDays; off++) {
    const { d, date } = dayKeyOffset(today, off);
    const dow = d.getDay();
    if (dow === 0) (Object.keys(weekly) as Cat[]).forEach((k) => (weekly[k] = 0));
    const sessions = ctx.week.days[dow] ?? [];
    const r = rngFrom(`${uid}|${date}`);
    const daysAgo = -off;
    const inGap = !!p.gap && daysAgo <= p.gap.endDaysAgo + p.gap.length - 1 && daysAgo >= p.gap.endDaysAgo;
    const weekIndex = Math.floor((daysAgo + dow) / 7);
    const weakWeek = roll(`${uid}|weak|${weekIndex}`) < 0.08;
    const status: Array<{ completed: boolean; workoutId?: string }> = [];
    const dayMin: Record<Cat, number> = { strength: 0, cardio: 0, maintenance: 0 };
    const daySessions: Record<Cat, number> = { strength: 0, cardio: 0, maintenance: 0 };
    let extraSteps = 0;
    let dayCalories = 0;

    sessions.forEach((s, i) => {
      if (off >= 0) return status.push({ completed: false });
      const weekend = dow === 5 || dow === 6 ? 0.9 : 1;
      const chance = inGap ? 0 : p.adherence * weekend * (weakWeek ? 0.35 : 1);
      if (roll(`${uid}|${date}|${i}|do`) >= chance) return status.push({ completed: false });
      const at = sessionDate(d, s, i, r);
      const done = doneSession(ctx, s, at, date, i, Math.floor(daysAgo / 7), r);
      docs.push(...done.docs);
      if (done.workoutId) {
        workoutIds.push(done.workoutId);
        totals.workouts++;
      }
      totals.xp += done.xp;
      totals.calories += done.calories;
      totals.coins += done.minutes;
      totals.minutes += done.minutes;
      dayMin[done.cat] += done.minutes;
      daySessions[done.cat] += 1;
      extraSteps += done.extraSteps;
      dayCalories += done.calories;
      status.push({ completed: true, ...(done.workoutId ? { workoutId: done.workoutId } : {}) });
    });

    if (sessions.length) {
      docs.push({
        path: `userSchedule/${uid}_${date}`,
        data: { userId: uid, date, entries: scheduleEntriesFor(uid, date, sessions, status), isDemo: true, updatedAt: new Date() },
      });
    }
    if (off > 0) continue;

    // ── Steps + dailyActivity (today: the part of the day so far) ──────────
    const weekendFactor = dow === 6 ? 0.8 : 1;
    let daySteps = p.stepGoal * Math.exp(gauss(r) * 0.22) * weekendFactor * (inGap ? 0.35 : 1) * between(r, 0.85, 1.05) + extraSteps;
    if (off === 0) daySteps *= Math.min(1, Math.max(0.1, (today.getHours() - 6) / 16));
    const stepsN = Math.max(300, Math.round(daySteps));
    const distanceMeters = Math.round(stepsN * 0.74);
    steps.push({ date, steps: stepsN, distanceMeters });
    (Object.keys(weekly) as Cat[]).forEach((k) => (weekly[k] += dayMin[k]));
    const anyWorkout = dayMin.strength + dayMin.cardio + dayMin.maintenance >= 10;
    qualifies.push(anyWorkout || stepsN >= p.stepGoal * 0.7);
    const dominant = (['strength', 'cardio', 'maintenance'] as Cat[]).reduce<Cat | null>((best, k) => (dayMin[k] > 0 && (!best || dayMin[k] > dayMin[best]) ? k : best), null);
    docs.push({
      path: `dailyActivity/${uid}_${date}`,
      data: {
        date,
        userId: uid,
        categories: {
          strength: categoryMetrics(dayMin.strength, DEFAULT_DAILY_GOALS.strength, weekly.strength, DEFAULT_WEEKLY_GOALS.strength, daySessions.strength),
          cardio: categoryMetrics(dayMin.cardio, DEFAULT_DAILY_GOALS.cardio, weekly.cardio, DEFAULT_WEEKLY_GOALS.cardio, daySessions.cardio),
          maintenance: categoryMetrics(dayMin.maintenance, DEFAULT_DAILY_GOALS.maintenance, weekly.maintenance, DEFAULT_WEEKLY_GOALS.maintenance, daySessions.maintenance),
        },
        steps: stepsN,
        stepsGoal: p.stepGoal,
        stepsGoalMet: stepsN >= p.stepGoal,
        floors: Math.round(between(r, 2, 14)),
        floorsGoal: 10,
        floorsGoalMet: false,
        calories: Math.round(dayCalories + stepsN * 0.04),
        distanceMeters,
        activityType: anyWorkout ? 'super' : stepsN >= p.stepGoal ? 'micro' : 'none',
        streak: 0,
        dominantCategory: dominant,
        authorityId: ctx.authorityId,
        ...(ctx.neighborhoodId ? { neighborhoodId: ctx.neighborhoodId } : {}),
        displayName: p.name,
        isDemo: true,
        updatedAt: new Date(),
      },
    });
    if (off >= -13) {
      docs.push({
        path: `dailyActivityPublic/${uid}_${date}`,
        data: { uid, displayName: p.name, steps: stepsN, authorityId: ctx.authorityId, date, ageGroup: 'demo', isDemo: true, updatedAt: new Date() },
      });
    }
  }

  // Streak: consecutive qualifying days ending today (or yesterday, when today is not done yet).
  let longest = 0;
  let run = 0;
  qualifies.forEach((q) => {
    run = q ? run + 1 : 0;
    longest = Math.max(longest, run);
  });
  const lastIdx = qualifies[qualifies.length - 1] ? qualifies.length - 1 : qualifies.length - 2;
  let current = 0;
  for (let i = lastIdx; i >= 0 && qualifies[i]; i--) current++;
  const lastActivityDate = current > 0 ? steps[lastIdx]?.date ?? null : null;
  // The streak value of each day doc is informational — keep the last one right.
  const lastDaily = docs.filter((x) => x.path.startsWith('dailyActivity/')).pop();
  if (lastDaily) lastDaily.data.streak = current;

  return { docs, workoutIds, steps, streak: { current, longest, lastActivityDate }, totals };
}
