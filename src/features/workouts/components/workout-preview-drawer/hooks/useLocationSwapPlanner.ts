'use client';

/**
 * useLocationSwapPlanner — dry-run plans for a location switch, cached per (workout, pool, profile).
 * enable_location_gate_v1. `planFor` is what useSwapAll applies; `checkAvailability` is what the
 * location switcher shows (allowed / greyed + reason) when it opens.
 */
import { useCallback, useRef } from 'react';
import type { Exercise, ExecutionLocation } from '@/features/content/exercises';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import { buildSwapPlanDeps } from '../location-gate/build-plan-deps';
import { planLocationSwap, type LocationSwapPlan } from '../location-gate/plan-location-swap';
import type { GateBlockReason } from '../location-gate/location-coverage.util';

export interface LocationAvailability {
  allowed: boolean;
  reason: GateBlockReason | null;
}

interface PlannerParams {
  generatedWorkout: GeneratedWorkout | null | undefined;
  userProfile: UserFullProfile | null | undefined;
  exercisePool?: Exercise[];
  /** Which park a switch to park / street uses (chosen-park.ts); null → nearest. */
  parkIdFor?: (location: ExecutionLocation) => string | null;
}

export function useLocationSwapPlanner({ generatedWorkout, userProfile, exercisePool, parkIdFor }: PlannerParams) {
  const cache = useRef<{
    key: [unknown, unknown, unknown];
    plans: Map<string, Promise<LocationSwapPlan>>;
  } | null>(null);

  const planFor = useCallback(
    (location: ExecutionLocation): Promise<LocationSwapPlan> => {
      if (!generatedWorkout || !userProfile) return Promise.reject(new Error('no workout / profile'));
      const key: [unknown, unknown, unknown] = [generatedWorkout, userProfile, exercisePool];
      if (!cache.current || cache.current.key.some((k, i) => k !== key[i])) {
        cache.current = { key, plans: new Map() };
      }
      const plans = cache.current.plans;
      const parkId = parkIdFor?.(location) ?? null;
      const planKey = parkId ? `${location}:${parkId}` : location; // another park → another plan
      let p = plans.get(planKey);
      if (!p) {
        p = buildSwapPlanDeps(userProfile, location, exercisePool, parkId).then((deps) =>
          planLocationSwap(generatedWorkout.exercises, location, deps),
        );
        p.catch(() => plans.delete(planKey)); // a failed plan is retried next time
        plans.set(planKey, p);
      }
      return p;
    },
    [generatedWorkout, userProfile, exercisePool, parkIdFor],
  );

  const checkAvailability = useCallback(
    async (locations: ExecutionLocation[]): Promise<Record<string, LocationAvailability>> => {
      const out: Record<string, LocationAvailability> = {};
      await Promise.all(
        locations.map(async (loc) => {
          try {
            const { coverage } = await planFor(loc);
            out[loc] = { allowed: coverage.allowed, reason: coverage.reason };
          } catch (err) {
            console.warn('[locationGate] availability check failed — leaving the option enabled', loc, err);
            out[loc] = { allowed: true, reason: null }; // fail open; the swap itself re-checks
          }
        }),
      );
      return out;
    },
    [planFor],
  );

  return { planFor, checkAvailability };
}
