'use client';

/**
 * useRecoveryStretches — Block B (BLOCK_B_SMART_CLOSE_V1) wave-1b.
 *
 * Fetches a few recovery/stretch videos (exercises tagged `exerciseRole:'recovery'` +
 * `showOnRestDays`) for the post-workout card. Mirrors the filter in
 * `tryBuildRecoveryVideoTrio` (home-workout.service) but returns LIGHT items (no trio /
 * generator machinery) — the reusable recovery selector the map flagged as missing.
 *
 * ⚠️ The `getAllExercises()` fetch runs on mount — so call this hook ONLY from a
 * flag-gated component (PostWorkoutSmartClose, rendered only behind the flag). Unmounted
 * = no fetch = byte-identical when the flag is off.
 */

import { useEffect, useState } from 'react';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';

export interface RecoveryStretch {
  id: string;
  name: string;
  videoUrl?: string | null;
}

export function useRecoveryStretches(limit = 2): RecoveryStretch[] {
  const [stretches, setStretches] = useState<RecoveryStretch[]>([]);

  useEffect(() => {
    if (limit <= 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const all = await getAllExercises();
        const picked = all
          .filter((ex) => ex.exerciseRole === 'recovery' && ex.showOnRestDays)
          .slice(0, limit)
          .map((ex) => {
            const method =
              ex.execution_methods?.[0] ?? (ex as { executionMethods?: unknown[] }).executionMethods?.[0] ?? {};
            const name = (ex.name as { he?: string; en?: string })?.he || (ex.name as { en?: string })?.en || '';
            return {
              id: ex.id,
              name,
              videoUrl: (method as { media?: { mainVideoUrl?: string | null } })?.media?.mainVideoUrl ?? null,
            };
          });
        if (!cancelled) setStretches(picked);
      } catch {
        // Fail silently — the message renders fine without stretches.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return stretches;
}

export default useRecoveryStretches;
