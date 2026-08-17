'use client';

import { useEffect } from 'react';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import { useToast } from '@/components/ui/Toast';

/**
 * Surfaces useOnboardingStore's debounced-sync failures as a toast.
 * Mounted once globally (not scoped to onboarding routes) so a flush
 * triggered right before navigating away from a step (see
 * flushPendingSync in useOnboardingStore) still gets its result shown
 * even if it resolves after the user has already moved to the next screen.
 */
export default function OnboardingSyncErrorToast() {
  const syncError = useOnboardingStore((s) => s.syncError);
  const clearSyncError = useOnboardingStore((s) => s.clearSyncError);
  const { showToast } = useToast();

  useEffect(() => {
    if (!syncError) return;
    showToast('error', syncError);
    clearSyncError();
  }, [syncError, showToast, clearSyncError]);

  return null;
}
