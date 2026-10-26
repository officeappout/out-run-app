'use client';

/**
 * Running AND walking programs are frozen for regular users while enable_running_programs is
 * off (pilot 26.10, owner note C1: the plans and their sync are not good enough yet). Super
 * admins always get the flag on, so the owner and the office keep working on them.
 *
 * Freezes only the ways IN (questionnaires, start cards, locks, Kelly's chip). A user who
 * already has a running or walking plan keeps it. The map's run / walk chips stay.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function useAerobicProgramsOpen(): { open: boolean; ready: boolean } {
  const hasHydrated = useUserStore((s) => s._hasHydrated);
  const isSuperAdmin = useUserStore(
    (s) => !!(s.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin,
  );
  const { flags, loading } = useFeatureFlags(isSuperAdmin);
  return { open: flags.enableRunningPrograms, ready: !loading && hasHydrated };
}

/**
 * For a running / walking signup page: while the programs are frozen, send the user home.
 * Returns true while the page must render nothing (not known yet, or frozen).
 * `active` false = this visit is not a running / walking signup, nothing is blocked.
 */
export function useAerobicSignupGuard(active = true): boolean {
  const router = useRouter();
  const { open, ready } = useAerobicProgramsOpen();
  const frozen = active && ready && !open;
  useEffect(() => {
    if (frozen) router.replace('/home');
  }, [frozen, router]);
  return active && (!ready || !open);
}
