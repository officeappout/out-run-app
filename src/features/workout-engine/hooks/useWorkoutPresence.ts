'use client';

/**
 * useWorkoutPresence — broadcasts the user's location + activity to the
 * `presence/{uid}` Firestore document while a workout is active.
 *
 * Lifecycle:
 *   Mount  → subscribe to the shared GPS store (useGPSStore). The core useGPS
 *            driver owns ALL polling — this hook never opens its own watcher or
 *            triggers a permission prompt (critical mid-workout). The first
 *            fix that lands in the store fires an immediate out-of-band
 *            heartbeat so partner sync starts ASAP.
 *   Active → heartbeat every 30s (moving) or 60s (stationary). Heartbeat
 *            payload returns null while store coords are missing or non-finite;
 *            the writer skips the tick rather than corrupting Firestore.
 *   Unmount → unsubscribe, stop heartbeat, clearPresence.
 *
 * Respects Ghost privacy mode — no-ops entirely when ghost.
 */

import { useEffect, useRef } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { usePrivacyStore } from '@/features/safecity/store/usePrivacyStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import {
  startWorkoutHeartbeat,
  stopWorkoutHeartbeat,
  clearPresence,
  updatePresence,
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
  const { groupId: groupSessionId } = useSharedSession();
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    // In-session group workouts are always visible to session members regardless
    // of ghost mode — that's the contract of "training together". But if the user
    // is in ghost mode and NOT in a group session, respect their privacy choice.
    if (!profile?.id || !profile.core?.name) return;
    if (mode === 'ghost' && !groupSessionId) return;

    const userId = profile.id;
    const ageGroup = deriveAgeGroup(profile.core.birthDate);

    const schoolAff = profile.core.affiliations?.find(
      (a) => a.type === 'school' || a.type === 'company',
    );

    /**
     * Build the heartbeat payload from the SHARED GPS store. The core useGPS
     * driver owns polling — this hook never opens its own watcher or prompts.
     * Returns null while no finite fix is available so the writer skips the
     * tick rather than corrupting Firestore.
     */
    const getPayload = (): PresencePayload | null => {
      const coords = useGPSStore.getState().coords;
      if (!coords) return null;
      const { lat, lng } = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

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

      // Block 4 — in-session always-visible override.
      // During a live group session, force mode='group' so that all session
      // members can see this user on the map regardless of their privacy setting.
      // audienceGroupIds is set to just [groupSessionId] so only that session's
      // members see the location (not the user's other groups). On session end,
      // clearPresence() removes the doc; the map heartbeat re-creates it with the
      // user's real privacy mode when they return to the map screen.
      const liveGroupSessionId = useSharedSession.getState().groupId;
      const presenceMode = liveGroupSessionId ? 'group' : mode;
      const presenceAudienceGroupIds = liveGroupSessionId
        ? [liveGroupSessionId]
        : (Array.isArray(liveProfile?.social?.groupIds) ? liveProfile.social.groupIds : []);

      return {
        uid: userId,
        name: profile.core.name ?? '',
        ageGroup,
        isVerified: profile.core.isVerified ?? false,
        schoolName: schoolAff?.name ?? null,
        mode: presenceMode,
        lat,
        lng,
        authorityId: profile.core.authorityId ?? null,
        activity: {
          status: activityStatus,
          // Omit workoutTitle entirely when undefined — Firestore rejects undefined values
          ...(workoutTitle != null ? { workoutTitle } : {}),
          startedAt: startedAtRef.current,
          // Broadcast distance so group partners can compute collective progress
          ...(activityStatus === 'running' || activityStatus === 'walking'
            ? { distance: useSessionStore.getState().totalDistance }
            : {}),
        },
        lemurStage,
        level: lemurStage,
        currentStreak: useProgressionStore.getState().currentStreak,
        audienceGroupIds: presenceAudienceGroupIds,
        // Omit programId/programName/programLevel when missing — Firestore rejects undefined.
        ...(activeProgram?.templateId != null ? { programId: activeProgram.templateId } : {}),
        ...(activeProgram?.name ? { programName: activeProgram.name } : {}),
        ...(programLevel != null ? { programLevel } : {}),
        ...(mockPace ? { mockPace } : {}),
        ...(liveGender ? { gender: liveGender } : {}),
      };
    };

    // Fire one immediate heartbeat the moment the FIRST GPS fix lands in the
    // store (e.g. the user granted permission a few seconds after the workout
    // started), so we don't lose up to a full interval of partner visibility.
    let hadFix = useGPSStore.getState().coords !== null;
    const unsubscribe = useGPSStore.subscribe((state) => {
      if (!hadFix && state.coords) {
        hadFix = true;
        const payload = getPayload();
        if (payload) {
          updatePresence(payload).catch((err) =>
            console.warn('[WorkoutPresence] first-fix heartbeat failed:', err),
          );
        }
      }
    });

    startWorkoutHeartbeat(getPayload, activityStatus);

    return () => {
      unsubscribe();
      stopWorkoutHeartbeat();
      clearPresence(userId).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, mode, groupSessionId]);
}

function deriveAgeGroup(birthDate?: Date | string | null): 'minor' | 'adult' {
  if (!birthDate) return 'minor';
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate as string);
  if (isNaN(bd.getTime())) return 'minor';
  const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ageYears < 18 ? 'minor' : 'adult';
}
