/**
 * useSessionHealthStore — module-level Zustand store for admin session-mint
 * health, following the usePushToastStore pattern (src/lib/native/
 * usePushToastStore.ts): a plain function like mintAdminSessionCookie can
 * call getState().markFailed()/markOk() directly with no React context,
 * while SessionHealthBanner (mounted in admin/layout.tsx) subscribes and
 * renders a visible banner when the session cookie can't be kept fresh.
 *
 * P1-3 (00-MASTER-PLAN.md §13.43): before this store existed, every mint
 * failure (rate-limit, network, a bad ID token) was logged with
 * console.warn and nothing else — invisible to the person actually locked
 * out. This makes that failure visible instead of silent, matching the
 * "never report negative when you mean couldn't-check" standing rule
 * (§13.47/13.48) — a degraded session state must say so, not just quietly
 * let the next /admin/* navigation redirect to login with no explanation.
 */

import { create } from 'zustand';

export type SessionHealthStatus = 'ok' | 'degraded';

interface SessionHealthState {
  status: SessionHealthStatus;
  /** Last failure reason — for logging/debugging, not shown verbatim to the user. */
  lastFailureReason: string | null;
  retrying: boolean;
  markOk: () => void;
  markFailed: (reason: string) => void;
  setRetrying: (retrying: boolean) => void;
}

export const useSessionHealthStore = create<SessionHealthState>((set) => ({
  status: 'ok',
  lastFailureReason: null,
  retrying: false,
  markOk: () => set({ status: 'ok', lastFailureReason: null }),
  markFailed: (reason) => set({ status: 'degraded', lastFailureReason: reason }),
  setRetrying: (retrying) => set({ retrying }),
}));
