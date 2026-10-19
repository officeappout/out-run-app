/**
 * Two tiny local hints for the fast-startup path (enable_fast_startup_v1):
 *
 *  - LAST_AUTH_UID (localStorage): the uid Firebase last restored on this device. The fast
 *    path on `/` only fires when the persisted profile's id equals it, so a profile left over
 *    from another account can never be fast-pathed into. Written only while the flag is on.
 *  - PENDING_VERIFY (sessionStorage): set by `/` right before it fast-paths, consumed by the
 *    home guard (useFastStartGuard), which then re-checks auth + users/{uid} once. Normal
 *    navigations to /home never carry it → no extra reads.
 */
export const LAST_AUTH_UID_KEY = 'out:fast-start:last-uid';
export const PENDING_VERIFY_KEY = 'out:fast-start:pending-verify';
export const SESSION_HINT_KEY = 'out:has-session';
export const USER_STORE_KEY = 'out-user-storage';

function ls(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
function ss(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

export function readLastAuthUid(): string | null {
  try { return ls()?.getItem(LAST_AUTH_UID_KEY) || null; } catch { return null; }
}
export function writeLastAuthUid(uid: string): void {
  try { ls()?.setItem(LAST_AUTH_UID_KEY, uid); } catch { /* quota */ }
}
export function clearLastAuthUid(): void {
  try { ls()?.removeItem(LAST_AUTH_UID_KEY); } catch { /* ignore */ }
}

export function readSessionHint(): boolean {
  try { return ls()?.getItem(SESSION_HINT_KEY) === '1'; } catch { return false; }
}

/** The persisted profile straight from zustand's localStorage payload (no store import). */
export function readPersistedProfile(): Record<string, unknown> | null {
  try {
    const raw = ls()?.getItem(USER_STORE_KEY);
    if (!raw) return null;
    const profile = (JSON.parse(raw) as { state?: { profile?: unknown } })?.state?.profile;
    return profile && typeof profile === 'object' ? (profile as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function markPendingVerify(uid: string): void {
  try { ss()?.setItem(PENDING_VERIFY_KEY, uid); } catch { /* ignore */ }
}
/** The uid `/` fast-pathed for, or null. Cleared by clearPendingVerify once home has checked. */
export function readPendingVerify(): string | null {
  try { return ss()?.getItem(PENDING_VERIFY_KEY) || null; } catch { return null; }
}
export function clearPendingVerify(): void {
  try { ss()?.removeItem(PENDING_VERIFY_KEY); } catch { /* ignore */ }
}
