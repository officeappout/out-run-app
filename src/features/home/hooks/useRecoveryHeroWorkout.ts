'use client';

/**
 * useRecoveryHeroWorkout — Block B (BLOCK_B_SMART_CLOSE_V1) Stage 1b.
 *
 * Fetches ONE recovery GeneratedWorkout for the big post-workout recovery card — reusing
 * the EXISTING rest-day recovery pipeline (`generateHomeWorkoutTrio` with the rest-day flag
 * → `tryBuildRecoveryVideoTrio`, the same follow-along videos the rest-day hero shows), NOT
 * a new stretch surface. `skipCycleRestart` avoids the periodization side-effect write.
 *
 * ⚠️ The async generation runs on mount — so call this hook ONLY from a flag-gated
 * component (PostWorkoutSmartClose, rendered only behind the flag). Unmounted = no
 * generation = byte-identical when the flag is off. Fetches once (ref-guarded).
 */

import { useEffect, useRef, useState } from 'react';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { generateHomeWorkoutTrio } from '@/features/workout-engine/services/home-workout.service';

export function useRecoveryHeroWorkout(
  profile: UserFullProfile | null | undefined,
): GeneratedWorkout | null {
  const [workout, setWorkout] = useState<GeneratedWorkout | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!profile || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const trio = await generateHomeWorkoutTrio({
          userProfile: profile,
          isScheduledRestDay: true, // forces the recovery-video trio path
          skipCycleRestart: true, // NO periodization side-effect write
        });
        const gw = trio?.options?.[0]?.result?.workout ?? null;
        if (!cancelled) setWorkout(gw);
      } catch {
        // Fail silently — the message + ring still render without the recovery card.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  return workout;
}

export default useRecoveryHeroWorkout;
