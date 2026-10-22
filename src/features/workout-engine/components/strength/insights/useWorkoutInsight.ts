'use client';

/**
 * Workout insights — the lines for this workout. `active` = flag on, Kelly AI and something to
 * ask (a request is or was in flight); `lines` null while it is loading. Flag off ⇒ inactive,
 * no request, nothing rendered.
 */
import { useEffect, useState } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useAiCoachAccess } from '@/features/ai-coach/hooks/useAiCoachAccess';
import { workoutInsightsOnFor } from '@/lib/ai/insights/gate';
import type { WorkoutInsightLines, WorkoutInsightRequest } from '@/lib/ai/insights/schema';
import { fetchWorkoutInsight } from './insight-api';

/** enable_workout_insights_v1 for this viewer (stored value, or the super-admin preview). */
export function useWorkoutInsightsOn(): boolean {
  const isSuperAdmin = useUserStore((s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { rawFlags } = useFeatureFlags(isSuperAdmin);
  return workoutInsightsOnFor(rawFlags, isSuperAdmin);
}

export interface WorkoutInsightState {
  active: boolean;
  lines: WorkoutInsightLines | null;
}

export function useWorkoutInsight(req: WorkoutInsightRequest | null): WorkoutInsightState {
  const on = useWorkoutInsightsOn();
  const { canUseAi } = useAiCoachAccess();
  const active = on && canUseAi && req != null;
  const key = active ? req.key : null;
  const [lines, setLines] = useState<{ key: string; lines: WorkoutInsightLines } | null>(null);

  useEffect(() => {
    if (!key || !req) return;
    let alive = true;
    void fetchWorkoutInsight(req).then((l) => {
      if (alive) setLines({ key, lines: l });
    });
    return () => {
      alive = false;
    };
    // The request is identified by its key (same key ⇒ same workout).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { active: key != null, lines: key && lines?.key === key ? lines.lines : null };
}
