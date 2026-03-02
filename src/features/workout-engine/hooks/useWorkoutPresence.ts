'use client';

/**
 * useWorkoutPresence — broadcasts the user's location + activity to the
 * `presence/{uid}` Firestore document while a workout is active.
 *
 * Lifecycle:
 *   Mount  → immediate GPS fix + first heartbeat write
 *   Active → heartbeat every 30s (moving) or 60s (stationary)
 *   Unmount → clearPresence (delete the doc)
 *
 * Respects Ghost privacy mode — no-ops entirely when ghost.
 */

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { usePrivacyStore } from '@/features/safecity/store/usePrivacyStore';
import {
  startWorkoutHeartbeat,
  stopWorkoutHeartbeat,
  clearPresence,
  type PresencePayload,
  type WorkoutActivityStatus,
} from '@/features/safecity/services/presence.service';

interface UseWorkoutPresenceParams {
  activityStatus: WorkoutActivityStatus;
  workoutTitle?: string;
}

export function useWorkoutPresence({ activityStatus, workoutTitle }: UseWorkoutPresenceParams) {
  const { profile } = useUserStore();
  const { mode } = usePrivacyStore();
  const startedAtRef = useRef(Date.now());
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!profile?.id || !profile.core?.name || mode === 'ghost') return;

    const userId = profile.id;
    const ageGroup = deriveAgeGroup(profile.core.birthDate);

    const schoolAff = profile.core.affiliations?.find(
      (a) => a.type === 'school' || a.type === 'company',
    );

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => { /* GPS denied — heartbeat will skip if coords are null */ },
      { enableHighAccuracy: false, timeout: 10_000 },
    );

    const getPayload = (): PresencePayload | null => {
      if (!lastCoordsRef.current) return null;

      return {
        uid: userId,
        name: profile.core.name ?? '',
        ageGroup,
        isVerified: profile.core.isVerified ?? false,
        schoolName: schoolAff?.name ?? null,
        mode,
        lat: lastCoordsRef.current.lat,
        lng: lastCoordsRef.current.lng,
        authorityId: profile.core.authorityId ?? null,
        activity: {
          status: activityStatus,
          workoutTitle,
          startedAt: startedAtRef.current,
        },
        lemurStage: profile.progression?.lemurStage ?? 1,
        level: profile.progression?.lemurStage ?? 1,
        programId: profile.progression?.activePrograms?.[0]?.templateId,
      };
    };

    const refreshGpsAndTick = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          lastCoordsRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        },
        () => {},
        { enableHighAccuracy: activityStatus !== 'strength', timeout: 8_000 },
      );
    };

    const gpsInterval = setInterval(refreshGpsAndTick, activityStatus === 'strength' ? 60_000 : 30_000);

    startWorkoutHeartbeat(getPayload, activityStatus);

    return () => {
      clearInterval(gpsInterval);
      stopWorkoutHeartbeat();
      clearPresence(userId).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, mode]);
}

function deriveAgeGroup(birthDate?: Date | string | null): 'minor' | 'adult' {
  if (!birthDate) return 'minor';
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate as string);
  if (isNaN(bd.getTime())) return 'minor';
  const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}
