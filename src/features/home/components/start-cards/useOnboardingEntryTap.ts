'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserFullProfile } from '@/types/user-profile';
import { resolveOnboardingEntryHref, type OnboardingTrack } from '@/features/user/onboarding/utils/onboarding-entry';

/**
 * One tap → that track's onboarding entry (resolveOnboardingEntryHref), with
 * a loading lock against double taps. `onNavigate` lets home wrap the push in
 * its health-declaration gate (interceptWorkoutStart), exactly as
 * AddStrengthProgramCard always did.
 */
export function useOnboardingEntryTap(
  profile: UserFullProfile | null | undefined,
  track: OnboardingTrack,
  onNavigate?: (navigate: () => void) => void,
): { loading: boolean; tap: () => void } {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const tap = useCallback(() => {
    if (loading) return;
    setLoading(true);
    const navigate = () => router.push(resolveOnboardingEntryHref(profile, track));
    if (onNavigate) onNavigate(navigate);
    else navigate();
  }, [loading, onNavigate, profile, router, track]);
  return { loading, tap };
}
