import type { AdvisorInput, AdvisorProfile, AdvisorWorkout } from '../types';
import type { RunningDayRole } from '../../engine/runningRules';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';

/** Thursday 2026-10-15. Week (Sun-anchored) = 2026-10-11 … 2026-10-17. */
export const THU = '2026-10-15';

export function strengthProfile(template: Record<string, string[]>, extra: Partial<AdvisorProfile> = {}): AdvisorProfile {
  return {
    progression: {
      domains: { push: { currentLevel: 4 }, pull: { currentLevel: 4 }, legs: { currentLevel: 3 } },
      activePrograms: [{ templateId: 'push', name: 'דחיפה', startDate: '2026-09-27T00:00:00Z' }],
    },
    lifestyle: { recurringTemplate: template, primaryTrack: 'strength' },
    ...extra,
  };
}

export interface RunEntry {
  week: number;
  day: number;
  category: WorkoutCategory;
  slotType?: RunningDayRole;
  isQualityWorkout?: boolean;
  status?: string;
  workoutName?: string;
}

export function runningPart(scheduleDays: string[], schedule: RunEntry[], opts: { start?: string; weeks?: number; target?: string; profileType?: number } = {}): AdvisorProfile['running'] {
  return {
    isUnlocked: true,
    scheduleDays,
    paceProfile: opts.profileType ? { profileType: opts.profileType } : undefined,
    activeProgram: { startDate: opts.start ?? '2026-10-11T00:00:00', schedule },
    generatedProgramTemplate: { targetDistance: opts.target ?? '10k', canonicalWeeks: opts.weeks ?? 8 },
  };
}

/** A 3-run week (quality / easy / long) for every week 1..n. */
export function threeRunWeeks(n: number): RunEntry[] {
  const out: RunEntry[] = [];
  for (let w = 1; w <= n; w++) {
    out.push(
      { week: w, day: 1, category: 'tempo', slotType: 'quality_primary', isQualityWorkout: true, workoutName: 'טמפו' },
      { week: w, day: 2, category: 'easy_run', slotType: 'easy_run', isQualityWorkout: false, workoutName: 'ריצה קלה' },
      { week: w, day: 3, category: 'long_run', slotType: 'long_run', isQualityWorkout: false, workoutName: 'ריצה ארוכה' },
    );
  }
  return out;
}

export function input(profile: AdvisorProfile, over: Partial<AdvisorInput> = {}): AdvisorInput {
  return { todayKey: THU, profile, workouts: [], scheduleDays: null, ...over };
}

export function w(date: string, kind: AdvisorWorkout['kind'], minutes = 40): AdvisorWorkout {
  return { date, kind, minutes };
}

export const strengthDaysOf = (week: { strength: Array<{ dayOfWeek: number; sessions: unknown[] }> }) =>
  week.strength.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek).sort((a, b) => a - b);
export const runDaysOf = (week: { running: Array<{ dayOfWeek: number; category: unknown }> }) =>
  week.running.filter((d) => d.category !== null).map((d) => d.dayOfWeek).sort((a, b) => a - b);
