'use client';

/**
 * Everything the tutorial reads once when it opens: the strength seed (the same resolveScheduleSeed the
 * existing week step uses), group levels, the runner's slots, the starting days and part of the day,
 * the steps goal and the coming week's order / dates.
 */
import { useMemo } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { hasRunningTrack } from '@/lib/track-ownership';
import { computeBaseLevel } from '@/features/home/utils/dailyStrengthTarget';
import { resolveScheduleSeed, type ScheduleSeedProfileInput } from '@/features/schedule/services/scheduleSeed.service';
import type { TimeWindow, TrainingLevel, RunSlot } from '@/features/schedule/engine-v2/types';
import type { GroupLevels } from '@/features/schedule/engine-v2/structure/types';
import {
  BASE_STRENGTH_FREQUENCY,
  DEFAULT_STRENGTH_WINDOW,
  recommendedStrengthDays,
  strengthTrainingLevel,
  windowForTime,
  type StrengthSeed,
} from '@/features/schedule/utils/strengthWeekRecommendation';
import { DAY_LETTERS_HE } from '@/features/schedule/utils/runWeekRecommendation';
import { comingDayOfMonthByDow, comingWeek } from '@/features/schedule/utils/comingWeekDates';
import { groupLevelsOf, runSlotsFor, runsPerWeekOf, type ProgressionSlice } from './model/profileInputs';
import { initialDays, type DaysState } from './model/days';

export interface TutorialInputs {
  seed: StrengthSeed;
  levels: GroupLevels;
  engineLevel: TrainingLevel;
  running: { slots: RunSlot[]; level: TrainingLevel } | null;
  defaultWindow: TimeWindow;
  initial: DaysState;
  order: number[];
  dates: number[];
  todayDow: number;
}

function readSessionJson<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

type RunningSlice = { isUnlocked?: unknown; scheduleDays?: string[]; paceProfile?: unknown } | null | undefined;

export function useTutorialInputs(): TutorialInputs {
  const profile = useUserStore((s) => s.profile);
  // Read once for the life of the tutorial (the existing week step's rule).
  return useMemo(() => {
    const programPath = typeof window !== 'undefined' ? sessionStorage.getItem('onboarding_program_path') ?? undefined : undefined;
    const r = resolveScheduleSeed(profile as ScheduleSeedProfileInput | null | undefined, {
      skillFocusSlugs: readSessionJson<string[]>('onboarding_skill_focus'),
      programPath,
    });
    const seed: StrengthSeed = { programs: r.seedPrograms, skills: r.seedSkills };
    const prog = profile?.progression as (ProgressionSlice & { tracks?: Record<string, { currentLevel?: number }>; domains?: Record<string, { currentLevel?: number }> }) | undefined;
    const engineLevel = strengthTrainingLevel(prog?.tracks || prog?.domains ? computeBaseLevel(prog?.tracks, prog?.domains) : null);
    const runningSlice = (profile as { running?: RunningSlice } | null)?.running;
    const runs = hasRunningTrack(profile as { running?: { isUnlocked?: unknown } } | null);
    // STUB (engine owner): the running level from the pace profile's presence, the signup's own rule needs its answers.
    const runLevel: TrainingLevel = runningSlice?.paceProfile ? 'intermediate' : 'beginner';
    const defaultWindow = windowForTime((profile?.lifestyle as { trainingTime?: string } | undefined)?.trainingTime) ?? DEFAULT_STRENGTH_WINDOW;
    const strengthDays = recommendedStrengthDays(seed, BASE_STRENGTH_FREQUENCY, engineLevel);
    const runDays = runs
      ? (runningSlice?.scheduleDays ?? []).map((l) => DAY_LETTERS_HE.indexOf(l as (typeof DAY_LETTERS_HE)[number])).filter((d) => d >= 0)
      : [];
    return {
      seed,
      levels: groupLevelsOf(prog),
      engineLevel,
      running: runs ? { slots: runSlotsFor(runsPerWeekOf(runningSlice)), level: runLevel } : null,
      defaultWindow,
      initial: initialDays(Array.from(new Set([...strengthDays, ...runDays])), defaultWindow),
      order: comingWeek().map((d) => d.dow),
      dates: comingDayOfMonthByDow(),
      todayDow: new Date().getDay(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
