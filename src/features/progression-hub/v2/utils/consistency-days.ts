/**
 * P-7 · התמדה — which days counted toward the streak, and WHY.
 *
 * Uses the app's own streak definition (features/activity/lib/streak-rules.ts):
 * a day counts when its active minutes reach STREAK_MINIMUM_MINUTES (10) OR
 * its steps reach the day's step goal. The reasons are what made up the day:
 * a strength / run / walk workout, the steps goal, recovery minutes
 * (maintenance), or plain active minutes from the watch/phone.
 *
 * Pure — built from the progress tab's already-loaded week/month data
 * (no extra reads). The weekly grace day (calm return) isn't stored per day,
 * so it isn't shown here.
 */
import { dayQualifiesBySteps } from '@/features/activity/lib/streak-rules';
import { STREAK_MINIMUM_MINUTES } from '@/features/activity/types/activity.types';
import { sortTones, type FlameTone } from '@/components/ui/v2/streak';
import type { ProgressDay, ProgressWorkout } from './progress-model';
import { toISODate } from './progress-period';

export type ConsistencyReason = 'strength' | 'run' | 'walk' | 'steps' | 'recovery' | 'active';

export interface ReasonChip {
  reason: ConsistencyReason;
  /** "כוח · 48 דק׳", "יעד צעדים · 11,240" */
  text: string;
}

export interface ConsistencyDay {
  iso: string;
  /** 0 = Sunday. */
  weekday: number;
  dayOfMonth: number;
  isToday: boolean;
  counted: boolean;
  /** Flame colours of what counted (empty when the day didn't count). */
  tones: FlameTone[];
  reasons: ReasonChip[];
  minutes: number;
  steps: number;
  stepsGoal: number;
}

const REASON_TONE: Record<ConsistencyReason, FlameTone> = {
  strength: 'strength',
  run: 'cardio',
  walk: 'steps',
  steps: 'steps',
  recovery: 'maintenance',
  active: 'cardio',
};

export const REASON_LABEL: Record<ConsistencyReason, string> = {
  strength: 'כוח',
  run: 'ריצה',
  walk: 'הליכה',
  steps: 'יעד צעדים',
  recovery: 'התאוששות',
  active: 'דקות פעילות',
};

const fmtInt = (n: number) => Math.round(n).toLocaleString('he-IL');
const fmtKm = (n: number) => (Math.round(n * 10) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 });

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** One day's verdict + reasons. */
export function consistencyDay(iso: string, date: Date, workouts: ProgressWorkout[], day: ProgressDay | undefined, todayISO: string): ConsistencyDay {
  const byKind = { strength: { min: 0, km: 0, n: 0 }, run: { min: 0, km: 0, n: 0 }, walk: { min: 0, km: 0, n: 0 }, other: { min: 0, km: 0, n: 0 } };
  for (const w of workouts) {
    const k = byKind[w.kind];
    k.min += w.minutes;
    k.km += w.km;
    k.n += 1;
  }
  const workoutMinutes = byKind.strength.min + byKind.run.min + byKind.walk.min + byKind.other.min;
  // dailyActivity already includes the workouts' minutes — take the larger, never the sum.
  const minutes = Math.round(Math.max(day?.activeMinutes ?? 0, workoutMinutes));
  const steps = day?.steps ?? 0;
  const stepsGoal = day?.stepsGoal ?? 0;
  const bySteps = dayQualifiesBySteps({ categories: {}, steps, stepsGoal: stepsGoal || undefined });
  const byMinutes = minutes >= STREAK_MINIMUM_MINUTES;
  const counted = byMinutes || bySteps;

  const reasons: ReasonChip[] = [];
  if (byKind.strength.n) reasons.push({ reason: 'strength', text: `${REASON_LABEL.strength} · ${fmtInt(byKind.strength.min)} דק׳` });
  if (byKind.run.n) reasons.push({ reason: 'run', text: `${REASON_LABEL.run} · ${byKind.run.km > 0 ? `${fmtKm(byKind.run.km)} ק״מ` : `${fmtInt(byKind.run.min)} דק׳`}` });
  if (byKind.walk.n) reasons.push({ reason: 'walk', text: `${REASON_LABEL.walk} · ${byKind.walk.km > 0 ? `${fmtKm(byKind.walk.km)} ק״מ` : `${fmtInt(byKind.walk.min)} דק׳`}` });
  const recovery = day?.minutesByCategory?.maintenance ?? 0;
  if (recovery >= 1) reasons.push({ reason: 'recovery', text: `${REASON_LABEL.recovery} · ${fmtInt(recovery)} דק׳` });
  if (bySteps) reasons.push({ reason: 'steps', text: `${REASON_LABEL.steps} · ${fmtInt(steps)}` });
  // Counted by minutes with nothing above to show for it (watch/phone activity, other workouts).
  if (byMinutes && !reasons.some((r) => r.reason !== 'steps')) reasons.unshift({ reason: 'active', text: `${REASON_LABEL.active} · ${fmtInt(minutes)}` });

  return {
    iso,
    weekday: date.getDay(),
    dayOfMonth: date.getDate(),
    isToday: iso === todayISO,
    counted,
    tones: counted ? sortTones(reasons.map((r) => REASON_TONE[r.reason])) : [],
    reasons: counted ? reasons : [],
    minutes,
    steps,
    stepsGoal,
  };
}

/** Days from `start` through today (inclusive), newest first. */
export function consistencyDays(workouts: ProgressWorkout[], days: ProgressDay[], start: Date, now: Date): ConsistencyDay[] {
  const todayISO = toISODate(now);
  const wByDay = new Map<string, ProgressWorkout[]>();
  for (const w of workouts) {
    const iso = toISODate(w.date);
    const list = wByDay.get(iso);
    if (list) list.push(w);
    else wByDay.set(iso, [w]);
  }
  const dByDay = new Map(days.map((d) => [d.date, d]));
  const out: ConsistencyDay[] = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); toISODate(d) <= todayISO; d = addDays(d, 1)) {
    const iso = toISODate(d);
    out.push(consistencyDay(iso, d, wByDay.get(iso) ?? [], dByDay.get(iso), todayISO));
  }
  return out.reverse();
}

/** How many counted days had each reason (the chips row on top of the list). */
export function reasonCounts(list: ConsistencyDay[]): { reason: ConsistencyReason; count: number }[] {
  const order: ConsistencyReason[] = ['strength', 'run', 'walk', 'steps', 'recovery', 'active'];
  return order
    .map((reason) => ({ reason, count: list.filter((d) => d.reasons.some((r) => r.reason === reason)).length }))
    .filter((r) => r.count > 0);
}

/** The "why not" line of a day that didn't count: "6 דק׳ פעילות · 6,100 מתוך 8,000 צעדים". */
export function missedLine(d: ConsistencyDay): string {
  const parts = [`${fmtInt(d.minutes)} דק׳ פעילות`];
  if (d.stepsGoal > 0) parts.push(`${fmtInt(d.steps)} מתוך ${fmtInt(d.stepsGoal)} צעדים`);
  else if (d.steps > 0) parts.push(`${fmtInt(d.steps)} צעדים`);
  return parts.join(' · ');
}
