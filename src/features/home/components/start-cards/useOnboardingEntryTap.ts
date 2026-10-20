'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserFullProfile } from '@/types/user-profile';
import { resolveOnboardingEntryHref, type OnboardingEntryOptions, type OnboardingTrack } from '@/features/user/onboarding/utils/onboarding-entry';

import { runOnboardingEntryTap, type OnboardingEntryNavigate } from './entry-tap';

export type { OnboardingEntryNavigate };

/**
 * One tap → that track's onboarding entry (resolveOnboardingEntryHref), with
 * a loading lock against double taps. `onNavigate` lets home wrap the push in
 * its health-declaration gate (interceptWorkoutStart), exactly as
 * AddStrengthProgramCard always did.
 */
export function useOnboardingEntryTap(
  profile: UserFullProfile | null | undefined,
  track: OnboardingTrack,
  onNavigate?: OnboardingEntryNavigate,
  entryOptions?: OnboardingEntryOptions,
): { loading: boolean; tap: () => void } {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const tap = useCallback(() => {
    if (loading) return;
    runOnboardingEntryTap(
      setLoading,
      () => router.push(resolveOnboardingEntryHref(profile, track, entryOptions)),
      onNavigate,
    );
  }, [loading, onNavigate, profile, router, track, entryOptions]);
  return { loading, tap };
}
