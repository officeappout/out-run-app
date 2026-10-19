/**
 * Device-side capture gate — synchronous, no I/O. Off (flag off on this device's last-known
 * flags AND not a super admin) → every hook returns before doing anything: nothing is
 * summarized, imported or sent. The server re-checks (real flag value + sample %) on write.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function isSuperAdminOnDevice(): boolean {
  try {
    return useUserStore.getState().profile?.core?.isSuperAdmin === true;
  } catch {
    return false;
  }
}

export function captureEnabledOnDevice(): boolean {
  return readLiveFlag('enableGenerationReview') || isSuperAdminOnDevice();
}
