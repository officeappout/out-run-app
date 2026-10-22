/**
 * Planner v2 (enable_week_builder_v1) — one day's two rings. Pure.
 *
 *   outer — activity minutes toward ACTIVITY_RING_DAILY_GOAL, split by track colour
 *           (strength / run / walk), clockwise from the top in TRACK_ORDER;
 *   inner — steps toward the user's own step goal.
 *
 * Minutes come from the day's finished workouts by track; the dailyActivity minutes that no
 * workout explains (everyday movement) are drawn as walk — the amber the Progress tab gives
 * walking and steps. dailyActivity already includes workout minutes, so the day total is the
 * larger of the two, never the sum (same rule as the Progress tab's consistency days).
 */
import { ACTIVITY_RING_DAILY_GOAL } from '@/features/home/utils/activity-ring.utils';
import { TRACK_COLORS, TRACK_ORDER, type TrackKey } from '@/components/ui/v2/track-colors';

export type TrackMinutes = Record<TrackKey, number>;

export interface DayWorkoutLike {
  kind: 'strength' | 'run' | 'walk' | 'other';
  minutes: number;
}

export interface DayActivityLike {
  activeMinutes?: number;
  steps?: number;
}

export interface DayRingSegment {
  key: TrackKey;
  value: number;
  color: string;
}

/** A segment of the outer ring as fractions of the full circle (0..1). */
export interface DayRingArc {
  key: TrackKey;
  color: string;
  from: number;
  length: number;
}

export interface DayRings {
  minutes: TrackMinutes;
  totalMinutes: number;
  minutesGoal: number;
  /** 0..1 — outer ring fill. */
  minutesPct: number;
  /** Non-zero tracks, TRACK_ORDER. */
  segments: DayRingSegment[];
  /** The outer ring's arcs, scaled so they fill `minutesPct` of the circle together. */
  arcs: DayRingArc[];
  steps: number;
  stepGoal: number;
  /** 0..1 — inner ring fill. */
  stepsPct: number;
  /** Nothing at all happened (both rings empty). */
  empty: boolean;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const nonNeg = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/** Minutes per track for one day: workouts by track + unexplained daily minutes as walk. */
export function dayMinutesByTrack(workouts: readonly DayWorkoutLike[], day?: DayActivityLike | null): TrackMinutes {
  const m: TrackMinutes = { strength: 0, run: 0, walk: 0 };
  let other = 0;
  for (const w of workouts) {
    const min = nonNeg(w.minutes);
    if (w.kind === 'other') other += min;
    else m[w.kind] += min;
  }
  const workoutTotal = m.strength + m.run + m.walk + other;
  const rest = Math.max(0, nonNeg(day?.activeMinutes) - workoutTotal) + other;
  m.walk += rest;
  return { strength: Math.round(m.strength), run: Math.round(m.run), walk: Math.round(m.walk) };
}

export interface BuildDayRingsInput {
  minutes: TrackMinutes;
  steps: number;
  stepGoal: number;
  minutesGoal?: number;
}

export function buildDayRings(i: BuildDayRingsInput): DayRings {
  const minutesGoal = i.minutesGoal && i.minutesGoal > 0 ? i.minutesGoal : ACTIVITY_RING_DAILY_GOAL;
  const minutes: TrackMinutes = { strength: nonNeg(i.minutes.strength), run: nonNeg(i.minutes.run), walk: nonNeg(i.minutes.walk) };
  const totalMinutes = minutes.strength + minutes.run + minutes.walk;
  const minutesPct = clamp01(totalMinutes / minutesGoal);
  const segments = TRACK_ORDER.filter((k) => minutes[k] > 0).map((k) => ({ key: k, value: minutes[k], color: TRACK_COLORS[k] }));
  let from = 0;
  const arcs = segments.map((s) => {
    const length = totalMinutes > 0 ? (minutesPct * s.value) / totalMinutes : 0;
    const arc = { key: s.key, color: s.color, from, length };
    from += length;
    return arc;
  });
  const steps = Math.round(nonNeg(i.steps));
  const stepGoal = i.stepGoal > 0 ? Math.round(i.stepGoal) : 0;
  const stepsPct = stepGoal > 0 ? clamp01(steps / stepGoal) : 0;
  return { minutes, totalMinutes, minutesGoal, minutesPct, segments, arcs, steps, stepGoal, stepsPct, empty: totalMinutes === 0 && steps === 0 };
}
