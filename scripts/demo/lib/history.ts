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
import { isoDate } from '@/features/schedule/walking/walkSchedule';
import { RUNNING_SLOT_NAME_HE } from '@/features/schedule/engine/runningRules';
import { between, gauss, rngFrom, roll } from './rng';
import type { LatLng } from './geo';
import { buildSessionDocs, type LifeCat, type SessionActor } from '../../../functions/src/demo-life/session-docs';
import { dailyActivityDoc, dailyActivityPublicDoc, dayQualifies } from '../../../functions/src/demo-life/daily-docs';
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

type Cat = LifeCat;

/** When a session started: the window's start time ± noise; later sessions of the day 90 min apart. */
export function sessionDate(day: Date, s: Pick<DemoSession, 'window'>, index: number, r: () => number): Date {
  const [h, m] = startTimeOf(s.window).split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  const jitterMin = Math.round(gauss(r) * 25) + index * 90;
  return new Date(d.getTime() + jitterMin * 60_000);
}

/** The app's Hebrew name of a session (what the feed post shows). */
export function sessionTitle(s: DemoSession): string {
  if (s.kind === 'strength') return strengthNameHe(s.slug ?? 'full_body');
  if (s.kind === 'run') return RUNNING_SLOT_NAME_HE[s.slot ?? 'easy_run'];
  if (s.kind === 'walk') return s.walk?.isLong ? 'הליכה ארוכה' : 'הליכה מהירה';
  return 'גמישות';
}

/** The persona's park: one of the real city's parks, stable per persona. */
export function parkOf(ctx: PersonaContext): DemoPark | null {
  return ctx.parks.length ? ctx.parks[Math.floor(roll(`${ctx.uid}|park`) * ctx.parks.length)] : null;
}

/** The session actor of a persona (shared builder input, functions/src/demo-life/session-docs.ts). */
export function actorOf(ctx: PersonaContext): SessionActor {
  const p = ctx.persona;
  return {
    uid: ctx.uid,
    name: p.name,
    gender: p.gender,
    age: p.age,
    parkUser: !!p.parkUser,
    shareRate: p.shareRate,
    authorityId: ctx.authorityId,
    neighborhoodId: ctx.neighborhoodId,
    tenantId: ctx.tenantId,
    unitId: ctx.unitId,
    groupIds: ctx.groupIds,
    home: ctx.home,
    park: parkOf(ctx),
    runLevel: ctx.week.running?.level ?? 'beginner',
  };
}

/** The workout + feed post (+ check-in) of one done session — the shared builder. */
function doneSession(ctx: PersonaContext, s: DemoSession, at: Date, date: string, i: number, weeksAgo: number, r: () => number) {
  return buildSessionDocs(actorOf(ctx), { kind: s.kind, slug: s.slug, slot: s.slot, minutes: s.minutes, title: sessionTitle(s) }, at, date, i, weeksAgo, r);
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
    qualifies.push(dayQualifies(dayMin, stepsN, p.stepGoal));
    const floors = Math.round(between(r, 2, 14));
    docs.push(
      dailyActivityDoc({
        uid,
        date,
        displayName: p.name,
        authorityId: ctx.authorityId,
        neighborhoodId: ctx.neighborhoodId,
        dayMin,
        weekly: { ...weekly },
        daySessions,
        steps: stepsN,
        stepGoal: p.stepGoal,
        floors,
        calories: Math.round(dayCalories + stepsN * 0.04),
        distanceMeters,
        streak: 0,
        updatedAt: new Date(),
      }),
    );
    if (off >= -13) {
      docs.push(dailyActivityPublicDoc({ uid, date, displayName: p.name, steps: stepsN, authorityId: ctx.authorityId, updatedAt: new Date() }));
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
