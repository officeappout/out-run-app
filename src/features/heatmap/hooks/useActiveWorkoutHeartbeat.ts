'use client';

/**
 * useActiveWorkoutHeartbeat — Broadcasts the user's fuzzed location +
 * denormalized demographics to `active_workouts/{uid}` every 45 seconds
 * while a workout session is active.
 *
 * Lifecycle:
 *   Mount  → start heartbeat; coords are read from the shared GPS store
 *            (driven by useGPS) or from `overrideLocation` when provided.
 *   Active → heartbeat every 45 s
 *   Unmount → clearActiveWorkout (delete the doc instantly)
 *
 * GPS:
 *   - This hook NEVER opens its own watcher or triggers a permission prompt.
 *     The core useGPS driver owns all polling; we just consume cached state.
 *
 * Privacy:
 *   - Location is fuzzed ~100 m by the service layer.
 *   - No name, no UID is exposed to the admin heatmap query.
 */

import { useEffect } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import {
  startActiveWorkoutHeartbeat,
  stopActiveWorkoutHeartbeat,
  clearActiveWorkout,
  deriveAgeGroup,
  deriveBirthYear,
  type ActiveWorkoutPayload,
  type ActiveWorkoutType,
} from '@/features/heatmap/services/active-workout.service';

interface UseActiveWorkoutHeartbeatParams {
  workoutType: ActiveWorkoutType;
  routeId?: string;
  /** Pass `false` to pause the heartbeat without unmounting. Defaults to `true`. */
  enabled?: boolean;
  /** When provided, use this location instead of the device GPS. */
  overrideLocation?: { lat: number; lng: number };
}

export function useActiveWorkoutHeartbeat({
  workoutType,
  routeId,
  enabled = true,
  overrideLocation,
}: UseActiveWorkoutHeartbeatParams) {
  const { profile } = useUserStore();

  useEffect(() => {
    if (!enabled || !profile?.id) return;

    const userId = profile.id;
    const core = profile.core;
    if (!core) return;

    // Coordinates come from the explicit `overrideLocation` (if provided) or
    // the shared GPS store (driven by useGPS). This hook never opens its own
    // watcher or prompts — critical during an active workout session. Returns
    // null while no fix exists so the writer simply skips the tick.
    const getPayload = (): ActiveWorkoutPayload | null => {
      const coords = overrideLocation ?? useGPSStore.getState().coords;
      if (!coords) return null;
      return {
        uid: userId,
        authorityId: core.authorityId ?? null,
        neighborhoodId: core.authorityId ?? null,
        workoutType,
        lat: coords.lat,
        lng: coords.lng,
        gender: core.gender ?? 'other',
        ageGroup: deriveAgeGroup(core.birthDate),
        birthYear: deriveBirthYear(core.birthDate),
        routeId,
      };
    };

    startActiveWorkoutHeartbeat(getPayload);

    return () => {
      stopActiveWorkoutHeartbeat();
      clearActiveWorkout(userId).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, enabled, overrideLocation?.lat, overrideLocation?.lng]);
}
