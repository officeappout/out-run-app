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
