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
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
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

/**
 * Mock pace values keyed by lemurStage (1..10). Indexed by `stage-1`.
 * Temporary placeholder until `paceProfile.basePace` is wired into presence
 * directly. Higher stages → faster pace (smaller min:sec/km).
 */
const MOCK_PACE_BY_STAGE = [
  '6:30', '5:45', '5:30', '5:15', '5:00',
  '4:45', '4:30', '4:15', '4:00', '3:45',
] as const;

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

      // Re-read profile + progression at heartbeat time so any mid-workout
      // level-up / program switch is reflected in the next tick rather than
      // captured at mount and never refreshed.
      const liveProfile = useUserStore.getState().profile;
      const activeProgram = liveProfile?.progression?.activePrograms?.[0];
      const programLevel = activeProgram?.templateId
        ? liveProfile?.progression?.tracks?.[activeProgram.templateId]?.currentLevel
        : undefined;

      const lemurStage = useProgressionStore.getState().lemurStage ?? 1;
      // Mock pace per stage — only relevant for running/walking. Temporary
      // until paceProfile.basePace flows into presence directly. Indexed by
      // stage-1 so a deterministic value is shown per partner.
      const mockPace = activityStatus === 'running' || activityStatus === 'walking'
        ? MOCK_PACE_BY_STAGE[Math.max(0, Math.min(MOCK_PACE_BY_STAGE.length - 1, lemurStage - 1))]
        : undefined;

      // Privacy contract: minors' gender is never broadcast. Adults broadcast
      // whatever is on `profile.core.gender` (could legitimately be 'other').
      // Read the latest profile so a mid-session profile edit takes effect on
      // the next heartbeat without remounting the hook.
      const liveGender = ageGroup === 'minor'
        ? undefined
        : liveProfile?.core?.gender;

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
          // Omit workoutTitle entirely when undefined — Firestore rejects undefined values
          ...(workoutTitle != null ? { workoutTitle } : {}),
          startedAt: startedAtRef.current,
        },
        lemurStage,
        level: lemurStage,
        currentStreak: useProgressionStore.getState().currentStreak,
        // Omit programId/programName/programLevel when missing — Firestore rejects undefined.
        ...(activeProgram?.templateId != null ? { programId: activeProgram.templateId } : {}),
        ...(activeProgram?.name ? { programName: activeProgram.name } : {}),
        ...(programLevel != null ? { programLevel } : {}),
        ...(mockPace ? { mockPace } : {}),
        ...(liveGender ? { gender: liveGender } : {}),
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
