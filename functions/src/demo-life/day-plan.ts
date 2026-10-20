/**
 * The live engine's planner (pure, deterministic): what a persona's day looks like at a
 * given moment. Every choice is a seeded roll keyed by persona + date (+ session), so any
 * tick — or a re-run of the same tick — sees the SAME day: which planned sessions happen
 * (adherence, quieter weekends, an 8 % weak week), when they start (planned time ± noise),
 * how long they take, and how many steps the persona has walked so far.
 *
 * The tick writes the difference between the state at the previous tick and now, so the
 * planner is the single source of truth and writes are idempotent by construction.
 */
import { between, gauss, rngFrom, roll } from './rng';
import { buildSessionDocs, type DoneSession, type LifeCat } from './session-docs';
import { dayQualifies, LIFE_CATS } from './daily-docs';
import type { LifePersona, LifeWeekSession } from './persona';
import { addDays, hhmmToMinutes, israelMs, weekStartOf } from './time';

export const WEAK_WEEK_P = 0.08;
export const WEAK_WEEK_FACTOR = 0.35;
export const WEEKEND_FACTOR = 0.9;

export interface PlannedSession {
  s: LifeWeekSession;
  does: boolean;
  startMs: number;
  endMs: number;
  /** The docs it produces when done (null when the persona skips it). */
  done: DoneSession | null;
}

export const isWeakWeek = (uid: string, weekStart: string) => roll(`${uid}|weakweek|${weekStart}`) < WEAK_WEEK_P;

/** The day's planned sessions and whether / when each happens. */
export function planDay(p: LifePersona, date: string, dow: number): PlannedSession[] {
  const weak = isWeakWeek(p.uid, weekStartOf(date, dow));
  const weekend = dow === 5 || dow === 6 ? WEEKEND_FACTOR : 1;
  const chance = p.adherence * weekend * (weak ? WEAK_WEEK_FACTOR : 1);
  return p.sessions
    .filter((s) => s.dow === dow)
    .sort((a, b) => a.i - b.i)
    .map((s) => {
      // Same "did they do it" key as the seed's history (scripts/demo/lib/history.ts).
      const does = roll(`${p.uid}|${date}|${s.i}|do`) < chance;
      const r = rngFrom(`${p.uid}|${date}|${s.i}|live`);
      const jitterMin = Math.round(gauss(r) * 25) + s.i * 90;
      const startMs = israelMs(date, hhmmToMinutes(s.start) + jitterMin);
      if (!does) return { s, does, startMs, endMs: startMs + s.minutes * 60_000, done: null };
      const done = buildSessionDocs(p, s, new Date(startMs), date, s.i, 0, r);
      return { s, does, startMs, endMs: startMs + done.minutes * 60_000, done };
    });
}

/** Step updates land at these Israel times (minutes of day) — 4 writes a day, not 36. */
export const STEP_SLOTS = [10 * 60, 14 * 60, 18 * 60, 22 * 60];

/** Share of the day's walking done by a minute of the day (06:00 → 0, 22:00 → 1). */
export function dayFraction(minuteOfDay: number): number {
  return Math.min(1, Math.max(0, (minuteOfDay - 6 * 60) / (16 * 60)));
}

export interface DayState {
  plan: PlannedSession[];
  /** Done sessions that have ended by `nowMs`. */
  ended: PlannedSession[];
  /** A session in progress at `nowMs` (presence). */
  active: PlannedSession | null;
  dayMin: Record<LifeCat, number>;
  daySessions: Record<LifeCat, number>;
  steps: number;
  distanceMeters: number;
  floors: number;
  calories: number;
  qualifies: boolean;
}

const zero = (): Record<LifeCat, number> => ({ strength: 0, cardio: 0, maintenance: 0 });

/** The persona's day as of `nowMs` (pass the day's end for a finished day). */
export function dayState(p: LifePersona, date: string, dow: number, nowMs: number, minuteOfDay: number): DayState {
  const plan = planDay(p, date, dow);
  const ended = plan.filter((x) => x.done && x.endMs <= nowMs);
  const active = plan.find((x) => x.done && x.startMs <= nowMs && nowMs < x.endMs) ?? null;
  const dayMin = zero();
  const daySessions = zero();
  let extraSteps = 0;
  let workoutCalories = 0;
  for (const x of ended) {
    dayMin[x.done!.cat] += x.done!.minutes;
    daySessions[x.done!.cat] += 1;
    extraSteps += x.done!.extraSteps;
    workoutCalories += x.done!.calories;
  }
  const slot = STEP_SLOTS.filter((m) => m <= minuteOfDay).pop();
  const r = rngFrom(`${p.uid}|${date}|steps`);
  const weak = isWeakWeek(p.uid, weekStartOf(date, dow));
  const target = p.stepGoal * Math.exp(gauss(r) * 0.22) * (dow === 6 ? 0.8 : 1) * (weak ? 0.7 : 1) * between(r, 0.85, 1.05);
  const floorsTarget = between(r, 2, 14);
  const frac = slot === undefined ? 0 : dayFraction(slot);
  const steps = frac > 0 || extraSteps > 0 ? Math.max(300, Math.round(target * frac + extraSteps)) : 0;
  return {
    plan,
    ended,
    active,
    dayMin,
    daySessions,
    steps,
    distanceMeters: Math.round(steps * 0.74),
    floors: Math.round(floorsTarget * frac),
    calories: Math.round(workoutCalories + steps * 0.04),
    qualifies: dayQualifies(dayMin, steps, p.stepGoal),
  };
}

/** Minutes per category this week up to and including `date` (earlier days at their end). */
export function weekMinutes(p: LifePersona, date: string, dow: number, today: DayState): Record<LifeCat, number> {
  const w = { ...today.dayMin };
  for (let d = 0; d < dow; d++) {
    const day = addDays(date, d - dow);
    const end = israelMs(day, 24 * 60 - 1);
    const st = dayState(p, day, d, end, 24 * 60 - 1);
    for (const k of LIFE_CATS) w[k] += st.dayMin[k];
  }
  return w;
}

/** A compact fingerprint of what the day docs show — the tick writes only when it changes. */
export function daySignature(st: DayState): string {
  return `${st.steps}|${st.floors}|${LIFE_CATS.map((k) => `${st.dayMin[k]}:${st.daySessions[k]}`).join(',')}`;
}
