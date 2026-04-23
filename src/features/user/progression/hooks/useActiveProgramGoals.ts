'use client';

/**
 * useActiveProgramGoals
 *
 * Reads LevelGoal[] for ALL of the user's active programs at their current
 * domain levels.  Goals from different programs are merged and deduplicated by
 * exerciseId so the same exercise never appears twice in the carousel.
 *
 * Data source: programLevelSettings/{activeProgramId}_level_{currentLevel}
 */

import { useState, useEffect } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import type { LevelGoal } from '@/types/workout';

interface ActiveProgramGoalsResult {
  goals: LevelGoal[];
  activeProgramId: string | null;
  currentLevel: number;
  loading: boolean;
}

export function useActiveProgramGoals(): ActiveProgramGoalsResult {
  const profile = useUserStore((s) => s.profile);
  const [goals, setGoals] = useState<LevelGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const activePrograms = profile?.progression?.activePrograms ?? [];
  const tracks = (profile?.progression?.tracks ?? {}) as Record<string, { currentLevel?: number }>;

  // Keep backward-compat shape — return the first program's ID / level as primary
  const primaryProgramId = activePrograms[0]?.templateId ?? null;
  const primaryLevel: number = primaryProgramId
    ? (tracks[primaryProgramId]?.currentLevel ?? 1)
    : 1;

  // Stable serialised key so the effect only re-runs when the list actually changes
  const programKey = activePrograms.map((ap) => ap.templateId).join(',');

  useEffect(() => {
    if (activePrograms.length === 0) {
      setGoals([]);
      setLoading(false);
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetches = activePrograms.map((ap) => {
      const level = tracks[ap.templateId]?.currentLevel ?? 1;
      return getProgramLevelSetting(ap.templateId, level)
        .then((settings) => (settings?.targetGoals ?? []) as LevelGoal[])
        .catch(() => [] as LevelGoal[]);
    });

    Promise.all(fetches)
      .then((perProgramGoals) => {
        // Merge + deduplicate by exerciseId (first occurrence wins)
        const seen = new Set<string>();
        const merged: LevelGoal[] = [];
        for (const list of perProgramGoals) {
          for (const goal of list) {
            if (!seen.has(goal.exerciseId)) {
              seen.add(goal.exerciseId);
              merged.push(goal);
            }
          }
        }
        setGoals(merged);
      })
      .catch(() => setGoals([]))
      .finally(() => setLoading(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programKey]);

  return { goals, activeProgramId: primaryProgramId, currentLevel: primaryLevel, loading };
}
