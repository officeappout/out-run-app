'use client';

import { useMemo } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useRunningConfigStore } from '@/features/workout-engine/core/store/useRunningConfigStore';
import { computeZones } from '@/features/workout-engine/core/services/running-engine.service';
import type { RunnerProfileType } from '@/features/workout-engine/core/types/running.types';
import type RunWorkout from '../../types/run-workout.type';
import { buildRunPreviewModel, type RunPreviewModel } from '../../utils/run-preview/run-preview-model';
import type { RunWeekContext } from '../../utils/run-preview/run-week';

export interface RunPreviewExtras {
  /** The template's category — the beginner walk/run path drops it from the workout. */
  templateCategory?: string | null;
  week?: RunWeekContext | null;
}

/**
 * The v2 pre-run view model for a materialized workout, from the runner's
 * pace profile + the pace map (the same sources the legacy drawer reads).
 * null while there is no workout.
 */
export function useRunPreviewModel(workout: RunWorkout | null, extras: RunPreviewExtras = {}): RunPreviewModel | null {
  const paceProfile = useUserStore((s) => s.profile?.running?.paceProfile);
  const config = useRunningConfigStore((s) => s.config);
  const basePace = paceProfile?.basePace ?? 0;
  const profileType: RunnerProfileType = paceProfile?.profileType ?? 3;
  const { templateCategory, week } = extras;

  return useMemo(() => {
    if (!workout) return null;
    try {
      const zones = basePace > 0 ? computeZones(basePace, profileType, config) : null;
      return buildRunPreviewModel(workout, {
        basePace,
        zones,
        templateCategory,
        week,
        showPaceNumbers: profileType !== 3,
      });
    } catch {
      // A malformed template must not take the map / home down — the caller falls back.
      return null;
    }
  }, [workout, basePace, profileType, config, templateCategory, week]);
}
