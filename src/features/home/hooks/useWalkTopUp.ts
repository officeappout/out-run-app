'use client';

/**
 * Weekly top-up of a walker's plan on home open (enable_home_v2, owner 20.10.2026):
 * at most once a day per device (localStorage guard), fire-and-forget, every failure
 * swallowed so home never breaks. Disabled → nothing.
 */
import { useEffect } from 'react';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';
import { isoDate } from '@/features/schedule/walking/walkSchedule';
import { topUpDueToday } from '@/features/schedule/walking/walkTopUp';

const guardKey = (uid: string) => `walk_topup_last_${uid}`;

function readGuard(uid: string): string | null {
  try {
    return window.localStorage.getItem(guardKey(uid));
  } catch {
    return null;
  }
}

function writeGuard(uid: string, iso: string): void {
  try {
    window.localStorage.setItem(guardKey(uid), iso);
  } catch {
    /* ignore */
  }
}

export function useWalkTopUp(opts: {
  uid: string | null | undefined;
  enabled: boolean;
  stepGoal: number | null;
  recurringTemplate?: RecurringTemplate | null;
  reminders?: { runningTime?: string; strengthTime?: string };
}): void {
  const { uid, enabled } = opts;
  useEffect(() => {
    if (!enabled || !uid || typeof window === 'undefined') return;
    const now = new Date();
    if (!topUpDueToday(readGuard(uid), now)) return;
    writeGuard(uid, isoDate(now));
    import('@/features/schedule/walking/walkTopUp.service')
      .then(({ topUpWalkPlan }) =>
        topUpWalkPlan({
          stepGoal: opts.stepGoal,
          recurringTemplate: opts.recurringTemplate ?? null,
          reminders: opts.reminders,
          now,
        }),
      )
      .catch((err) => console.warn('[useWalkTopUp] skipped', err));
    // Once per uid / enable; the guard keeps it to one run a day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, enabled]);
}
