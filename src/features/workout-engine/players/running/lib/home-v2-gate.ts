/**
 * enable_home_v2 outside React — for the running store's save path, which
 * must write the v2-only `runMeta` field only while the flag is on. Same
 * answer as `useFeatureFlags(isSuperAdmin).flags.enableHomeV2`: super admins
 * always on; everyone else the device's last-known flags (the hook keeps
 * them in memory + localStorage). Unknown ⇒ off (fail-closed).
 */
import { initialFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { readLiveFlag } from '@/lib/feature-flag-live';
import { rideModeOn } from './ride-mode';

export function homeV2EnabledNow(): boolean {
  try {
    const core = useUserStore.getState().profile?.core as { isSuperAdmin?: boolean } | undefined;
    if (core?.isSuperAdmin) return true;
    return !!initialFlags()?.enableHomeV2;
  } catch {
    return false;
  }
}

/** enable_cycling_fixes_v1 outside React (live value; no super-admin override — see feature-flag-live). */
export function cyclingFixesEnabledNow(): boolean {
  return readLiveFlag('enableCyclingFixesV1');
}

/**
 * enable_run_done_state_v1 outside React — the schedule write after a saved run. Needs home v2
 * too. Super admins preview it (flag def superAdminValue true); everyone else the device's
 * last-known value. Unknown ⇒ off (fail-closed).
 */
export function runDoneWriteEnabledNow(): boolean {
  try {
    if (!homeV2EnabledNow()) return false;
    const core = useUserStore.getState().profile?.core as { isSuperAdmin?: boolean } | undefined;
    if (core?.isSuperAdmin) return true;
    return readLiveFlag('enableRunDoneStateV1');
  } catch {
    return false;
  }
}

/** A ride may be recorded as a ride: home v2 OR enable_cycling_fixes_v1. */
export function rideModeEnabledNow(): boolean {
  return rideModeOn(homeV2EnabledNow(), cyclingFixesEnabledNow());
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

/** Forget the planned-run position once it has been used (a stale key must not outlive its run). */
export function clearPlannedRunPosition(): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem('planned_run_week');
    window.sessionStorage.removeItem('planned_run_day');
  } catch {
    /* sessionStorage unavailable */
  }
}
