/**
 * The home today model's live numbers from what home already has (pure, __tests__/homeToday.test.ts).
 */
import type { HomeTourToday } from '@/features/user/onboarding/services/first-run-tour';
import type { HomeTodayModel } from './homeToday';

interface DoneDoc {
  duration?: number | null;
  workoutType?: string | null;
  activityType?: string | null;
  category?: string | null;
}

const SHORT_SESSION_KINDS = new Set(['strength', 'hybrid', 'recovery']);

/**
 * The short optional session counts as done on a day without a scheduled workout when any
 * strength / hybrid / recovery session was finished today (there is no core-tabata or mobility
 * marker on the saved workout yet; runs and walks are not a short session).
 */
export function optionalDoneOf(docs: ReadonlyArray<DoneDoc> | null | undefined): boolean {
  return (docs ?? []).some((d) => [d.workoutType, d.category, d.activityType].some((k) => typeof k === 'string' && SHORT_SESSION_KINDS.has(k)));
}

/** Minutes of today's strength docs (duration is seconds); 0 when there are none. */
export function strengthMinutesOf(docs: ReadonlyArray<DoneDoc> | null | undefined): number {
  const sec = (docs ?? [])
    .filter((d) => d.workoutType === 'strength' || d.category === 'strength' || d.activityType === 'strength' || d.workoutType === 'hybrid')
    .reduce((n, d) => n + (Number.isFinite(d.duration) ? Number(d.duration) : 0), 0);
  return Math.round(sec / 60);
}

/** The home tour's view of today (first-run-tour.ts homeTourFromTodaySteps). */
export function homeTourToday(m: HomeTodayModel | null): HomeTourToday | null {
  if (!m) return null;
  return { strengthToday: !!m.strength, optionalMinutes: m.optional?.minutes ?? 8, next: m.next };
}
