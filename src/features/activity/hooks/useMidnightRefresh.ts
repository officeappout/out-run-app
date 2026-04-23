'use client';

/**
 * useMidnightRefresh — Day-boundary clock for the entire app.
 *
 * Why this exists:
 *   The schedule's "today" highlight, the Completion Bridge, and the streak
 *   logic all depend on `getTodayString()`. Without an explicit clock, those
 *   values stay frozen at the moment a component mounted — so a user who
 *   leaves the app open across midnight sees yesterday marked as "today",
 *   logs a workout into the wrong bucket, and breaks their streak.
 *
 * What this provides:
 *   1. `useDateStore` — a tiny global Zustand atom holding `dateKey: 'YYYY-MM-DD'`.
 *   2. `useDateKey()` — selector hook to subscribe to the current dateKey.
 *   3. `useMidnightRefresh()` — mount-once side-effect that:
 *        • Schedules a setTimeout to fire at the next 00:00 (+ small jitter).
 *        • Listens to `visibilitychange` so a backgrounded tab catches up
 *          immediately when the user returns (mobile browsers throttle timers).
 *        • On rollover: bumps `dateKey` AND calls `useActivityStore.initialize`
 *          so today's activity bucket is archived and a fresh one is created.
 *
 * Mount this exactly once at the app root (ClientLayout) so every consumer
 * downstream of `useDayStatus` re-evaluates at the day boundary.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useActivityStore } from '../store/useActivityStore';
import { useUserStore } from '@/features/user';

// ── Date helpers ──────────────────────────────────────────────────────────────

function getTodayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function msUntilNextMidnight(): number {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // tomorrow
    0, 0, 1, 0,        // 00:00:01 — small jitter avoids races with system clock
  );
  return next.getTime() - now.getTime();
}

// ── Global date store ─────────────────────────────────────────────────────────

interface DateState {
  /** Current local-day key in 'YYYY-MM-DD' form. */
  dateKey: string;
  /** Re-read the system clock and update dateKey if changed. */
  bumpDate: () => void;
}

export const useDateStore = create<DateState>((set, get) => ({
  dateKey: getTodayString(),
  bumpDate: () => {
    const next = getTodayString();
    if (next !== get().dateKey) {
      set({ dateKey: next });
    }
  },
}));

/** Subscribe a component to the global day boundary. */
export const useDateKey = (): string => useDateStore((s) => s.dateKey);

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Mount once at the app root. Schedules the midnight tick, handles tab
 * background/foreground, and re-initializes the activity store at rollover
 * so the streak survives an open-overnight session.
 */
export function useMidnightRefresh(): void {
  const userId = useUserStore((s) => s.profile?.id);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const handleRollover = () => {
      if (cancelled) return;
      const before = useDateStore.getState().dateKey;
      useDateStore.getState().bumpDate();
      const after = useDateStore.getState().dateKey;

      // Only re-initialize the activity store if the day actually changed.
      // Defends against spurious bumps (e.g. visibilitychange firing during
      // the same day) so we don't wipe today's logged activity.
      if (after !== before && userId) {
        useActivityStore.getState().initialize(userId);
      }
    };

    const schedule = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        handleRollover();
        schedule(); // chain the next midnight
      }, msUntilNextMidnight());
    };

    // Catch up immediately when the tab becomes visible (mobile browsers
    // aggressively throttle background timers, so a setTimeout scheduled
    // for 00:00 may not fire on time if the tab was backgrounded).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleRollover();
        schedule();
      }
    };

    schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId]);
}
