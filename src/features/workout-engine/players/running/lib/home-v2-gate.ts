/**
 * enable_home_v2 outside React — for the running store's save path, which
 * must write the v2-only `runMeta` field only while the flag is on. Same
 * answer as `useFeatureFlags(isSuperAdmin).flags.enableHomeV2`: super admins
 * always on; everyone else the device's last-known flags (the hook keeps
 * them in memory + localStorage). Unknown ⇒ off (fail-closed).
 */
import { initialFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';

export function homeV2EnabledNow(): boolean {
  try {
    const core = useUserStore.getState().profile?.core as { isSuperAdmin?: boolean } | undefined;
    if (core?.isSuperAdmin) return true;
    return !!initialFlags()?.enableHomeV2;
  } catch {
    return false;
  }
}

/**
 * Program position of the planned run being saved — the week/day the
 * planned-run launch (PlannedPreviewLayer) put in sessionStorage. null when
 * missing or malformed.
 */
export function readPlannedRunPosition(): { week: number; day: number } | null {
  try {
    if (typeof window === 'undefined') return null;
    const week = parseInt(window.sessionStorage.getItem('planned_run_week') ?? '', 10);
    const day = parseInt(window.sessionStorage.getItem('planned_run_day') ?? '', 10);
    return week > 0 && day > 0 ? { week, day } : null;
  } catch {
    return null;
  }
}
