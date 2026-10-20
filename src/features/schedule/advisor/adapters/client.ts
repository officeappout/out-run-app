/**
 * Client adapter — the app's stores → AdvisorInput. Pure mapping: the caller reads the
 * stores (useUserStore's profile, useWeeklyVolumeStore's domain sets, an already-fetched
 * workout list / userSchedule days) and passes them in; nothing here touches Firebase or
 * the clock (`now` is the caller's).
 */
import type { WeaveControls } from '../../engine/weaverInput';
import type { ResolveSlug } from '../../engine/strengthVocabulary';
import { toAdvisorWorkouts, type RawAdvisorWorkout } from '../workouts';
import type { AdvisorInput, AdvisorProfile, AdvisorScheduleDay } from '../types';

/** Device-local YYYY-MM-DD (not toISOString, which is UTC and can shift the day near midnight). */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface ClientAdvisorArgs {
  profile: unknown;
  now: Date;
  controls?: Partial<WeaveControls>;
  /** Raw workout docs with their Date (the adapter turns them into local day keys). */
  workouts?: Array<Omit<RawAdvisorWorkout, 'dateKey'> & { date: Date | null }>;
  scheduleDays?: AdvisorScheduleDay[] | null;
  resolveSlug?: ResolveSlug;
  weeklyDomainSets?: Record<string, number> | null;
  unarrangedStrengthDays?: number;
  /** enable_home_v2 — see WeaverInputOptions.runsByType. */
  runsByType?: boolean;
}

export function toAdvisorInputFromClient(a: ClientAdvisorArgs): AdvisorInput {
  return {
    todayKey: localDateKey(a.now),
    profile: (a.profile ?? {}) as AdvisorProfile,
    controls: a.controls,
    workouts: toAdvisorWorkouts((a.workouts ?? []).map((w) => ({ ...w, dateKey: w.date ? localDateKey(w.date) : null }))),
    scheduleDays: a.scheduleDays ?? null,
    resolveSlug: a.resolveSlug,
    weeklyDomainSets: a.weeklyDomainSets ?? null,
    ...(a.unarrangedStrengthDays !== undefined ? { unarrangedStrengthDays: a.unarrangedStrengthDays } : {}),
    ...(a.runsByType ? { runsByType: true } : {}),
  };
}
