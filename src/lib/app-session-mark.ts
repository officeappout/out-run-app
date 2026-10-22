/**
 * Push-tap marker for the app-session signal (enable_app_session_signal, default OFF —
 * src/features/analytics/app-session.ts). The native push tap handler calls markPushTap() so the
 * session that the tap opens is counted as a push session (`pushSessions`); every other session
 * is an organic return. sessionStorage only, a timestamp, nothing else. Flag off = no-op.
 * Kept free of Firebase imports so the push module stays light.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';

export const PUSH_TAP_MARK_KEY = 'out_push_tap_at';

export function markPushTap(nowMs: number = Date.now()): void {
  if (!readLiveFlag('enableAppSessionSignal') || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PUSH_TAP_MARK_KEY, String(nowMs));
  } catch {
    /* ignore */
  }
}
