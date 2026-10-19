'use client';

/**
 * Home v2 (enable_home_v2): the daily carousel's "start a program" / "add a
 * track" slide (resolveProgramSlide). Reads only the loaded profile and two
 * local keys — no Firestore reads, no new fields. "לא עכשיו" on an add card is
 * a local, per-user, per-track timestamp (14 days, isAddDismissActive).
 */

import { useCallback, useMemo, useState } from 'react';
import { getOnboardingPref } from '@/lib/onboardingPrefs';
import { hasRunningTrack } from '@/lib/track-ownership';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import {
  hasRunningIntent,
  isAddDismissActive,
  resolveProgramSlide,
  type ProgramSlidePlan,
  type ProgramTrack,
} from '@/features/home/utils/program-start-cards';

const dismissKey = (uid: string, track: ProgramTrack) => `home_add_track_dismissed_v1:${uid}:${track}`;

function readDismissedAt(uid: string | undefined, track: ProgramTrack): number | null {
  if (!uid || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(dismissKey(uid, track));
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

export interface ProgramSlideState {
  plan: ProgramSlidePlan;
  /** "לא עכשיו" — hides that track's add card for 14 days on this device. */
  dismissAdd: (track: ProgramTrack) => void;
}

export function useProgramSlide(
  profile: UserFullProfile | null | undefined,
  hasStrengthProgram: boolean,
  enabled: boolean,
): ProgramSlideState {
  const uid = profile?.id;
  // Bumped by "לא עכשיו" so the plan re-reads the local stamps.
  const [dismissVersion, setDismissVersion] = useState(0);

  const dismissAdd = useCallback((track: ProgramTrack) => {
    if (uid) {
      try { window.localStorage.setItem(dismissKey(uid, track), String(Date.now())); } catch { /* private mode / quota */ }
    }
    setDismissVersion((v) => v + 1);
  }, [uid]);

  const hasRunning = hasRunningTrack(profile);
  const lifestyle = profile?.lifestyle as { primaryTrack?: unknown; dashboardMode?: unknown } | undefined;
  const primaryTrack = lifestyle?.primaryTrack;
  const dashboardMode = lifestyle?.dashboardMode;

  const plan = useMemo(() => {
    // Local reads only once the profile is loaded (never during SSR — no uid there).
    const now = Date.now();
    const gatewayTrack = enabled && uid ? getOnboardingPref('gateway_track') : null;
    return resolveProgramSlide({
      enabled,
      hasStrength: hasStrengthProgram,
      hasRunning,
      runningIntent: hasRunningIntent({ lifestyle: { primaryTrack, dashboardMode } }, gatewayTrack),
      addDismissed: {
        strength: isAddDismissActive(readDismissedAt(uid, 'strength'), now),
        running: isAddDismissActive(readDismissedAt(uid, 'running'), now),
      },
    });
    // dismissVersion: re-read the stamps after "לא עכשיו".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uid, hasStrengthProgram, hasRunning, primaryTrack, dashboardMode, dismissVersion]);

  return { plan, dismissAdd };
}
