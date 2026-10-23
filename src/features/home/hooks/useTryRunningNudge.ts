'use client';

/**
 * "מוכן לנסות לרוץ?" nudge state (enable_home_two_cards_v1). One batched read of the last ~5
 * weeks of schedule days, only for a walk-only user with the flag on (no read otherwise), then
 * shouldShowTryRunning. "לא עכשיו" is a local per-user stamp (30 days).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getScheduleEntriesForDates } from '@/features/user/scheduling/services/userSchedule.service';
import { isPlannedWalkEntry } from '@/features/schedule/walking/walkEntry';
import { EMPTY_WALK_STREAK, walkStreakDates, walkStreakFrom, type WalkStreak } from '../utils/walk-streak';
import { shouldShowTryRunning, tryRunningDismissKey } from '../utils/try-running';

function readStamp(uid: string | null | undefined): number | null {
  if (!uid || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(tryRunningDismissKey(uid));
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

export interface TryRunningNudge {
  show: boolean;
  streak: WalkStreak;
  dismiss: () => void;
}

export function useTryRunningNudge(uid: string | null | undefined, enabled: boolean, walkOnly: boolean): TryRunningNudge {
  const [streak, setStreak] = useState<WalkStreak>(EMPTY_WALK_STREAK);
  const [dismissVersion, setDismissVersion] = useState(0);
  const active = enabled && walkOnly && !!uid;

  useEffect(() => {
    if (!active || !uid) {
      setStreak(EMPTY_WALK_STREAK);
      return;
    }
    // Already dismissed: skip the read altogether.
    if (!shouldShowTryRunning({ enabled: true, walkOnly: true, streakWeeks: 99, dismissedAtMs: readStamp(uid), nowMs: Date.now() })) return;
    let alive = true;
    getScheduleEntriesForDates(uid, walkStreakDates())
      .then((byDate) => {
        if (alive && byDate) setStreak(walkStreakFrom(byDate, isPlannedWalkEntry));
      })
      .catch((err) => console.warn('[useTryRunningNudge] read failed', err));
    return () => {
      alive = false;
    };
  }, [active, uid]);

  const dismiss = useCallback(() => {
    if (uid) {
      try { window.localStorage.setItem(tryRunningDismissKey(uid), String(Date.now())); } catch { /* private mode / quota */ }
    }
    setDismissVersion((v) => v + 1);
  }, [uid]);

  const show = useMemo(
    () => shouldShowTryRunning({ enabled, walkOnly, streakWeeks: streak.weeks, dismissedAtMs: readStamp(uid), nowMs: Date.now() }),
    // dismissVersion: re-read the stamp after "לא עכשיו".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, walkOnly, streak.weeks, uid, dismissVersion],
  );
  return { show, streak, dismiss };
}
