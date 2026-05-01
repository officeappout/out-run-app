'use client';

/**
 * useActiveWorkoutHeartbeat — Broadcasts the user's fuzzed location +
 * denormalized demographics to `active_workouts/{uid}` every 45 seconds
 * while a workout session is active.
 *
 * Lifecycle:
 *   Mount  → immediate GPS fix + first heartbeat write
 *   Active → heartbeat every 45 s
 *   Unmount → clearActiveWorkout (delete the doc instantly)
 *
 * Privacy:
 *   - Location is fuzzed ~100 m by the service layer.
 *   - No name, no UID is exposed to the admin heatmap query.
 */

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
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
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled || !profile?.id) return;

    const userId = profile.id;
    const core = profile.core;
    if (!core) return;

    // When an override is provided, seed the ref and skip GPS polling entirely.
    if (overrideLocation) {
      lastCoordsRef.current = overrideLocation;
      const getPayload = (): ActiveWorkoutPayload | null => {
        if (!lastCoordsRef.current) return null;
        return {
          uid: userId,
          authorityId: core.authorityId ?? null,
          neighborhoodId: core.authorityId ?? null,
          workoutType,
          lat: lastCoordsRef.current.lat,
          lng: lastCoordsRef.current.lng,
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
    }

    // Grab initial GPS position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastCoordsRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
      },
      () => { /* GPS denied — heartbeat skips if coords null */ },
      { enableHighAccuracy: false, timeout: 10_000 },
    );

    // Refresh GPS every 45 s (aligned with heartbeat interval)
    const gpsInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          lastCoordsRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
        },
        () => {},
        { enableHighAccuracy: workoutType !== 'strength', timeout: 8_000 },
      );
    }, 45_000);

    const getPayload = (): ActiveWorkoutPayload | null => {
      if (!lastCoordsRef.current) return null;

      return {
        uid: userId,
        authorityId: core.authorityId ?? null,
        neighborhoodId: core.authorityId ?? null,
        workoutType,
        lat: lastCoordsRef.current.lat,
        lng: lastCoordsRef.current.lng,
        gender: core.gender ?? 'other',
        ageGroup: deriveAgeGroup(core.birthDate),
        birthYear: deriveBirthYear(core.birthDate),
        routeId,
      };
    };

    startActiveWorkoutHeartbeat(getPayload);

    return () => {
      clearInterval(gpsInterval);
      stopActiveWorkoutHeartbeat();
      clearActiveWorkout(userId).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, enabled, overrideLocation?.lat, overrideLocation?.lng]);
}
