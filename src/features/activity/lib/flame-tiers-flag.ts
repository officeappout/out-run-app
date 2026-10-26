/**
 * enable_flame_tiers_v1 outside React — the completion write path (useActivitySync,
 * markTodayAsCompleted) runs in plain async code. Same answer as
 * `useFeatureFlags(isSuperAdmin).flags.enableFlameTiersV1`: super admins preview it
 * (superAdminValue true); everyone else this viewer's cached resolved flags, else the
 * device's live value. Unknown ⇒ off (fail-closed).
 */
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { readLiveFlag } from '@/lib/feature-flag-live';
import { readLastViewerUid, readViewerFlags } from '@/hooks/feature-flag-viewer-cache';

export function flameTiersEnabledNow(): boolean {
  try {
    const profile = useUserStore.getState().profile;
    if ((profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin) return true;
    const viewer = readViewerFlags(profile?.id ?? readLastViewerUid());
    if (viewer && typeof viewer.enableFlameTiersV1 === 'boolean') return viewer.enableFlameTiersV1;
    return readLiveFlag('enableFlameTiersV1');
  } catch {
    return false;
  }
}
