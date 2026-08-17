'use client';

/**
 * useWeeklyStrengthGoal (HOME_DAILY_GOAL_V1, item 2) — per-day strength daily-goal
 * progress for the current week, read from the `dailyProgress` docs that item 1
 * persists (`dailyStrengthPct` + `strengthGoalMet`). Feeds the StrengthVolumeWidget
 * SegmentedBar's partial-fill + orange(in-progress)/blue(counted) state.
 *
 * Returns `undefined` when the flag is OFF or there is no user → the widget falls
 * back to its legacy binary "filled segment per completed session" behaviour.
 *
 * Legacy days (written before the flag, so no dailyStrengthPct) degrade to the
 * binary reading: a completed strength day = pct 1 / met true, else 0 / false.
 *
 * Read via a single `documentId() in [...]` query (≤30 ids, no composite index).
 */

import { useEffect, useState } from 'react';
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { toISODate } from '@/features/user/scheduling/utils/dateUtils';

export interface DayStrengthGoalState {
  /** Local YYYY-MM-DD. */
  date: string;
  /** Fraction of the daily strength target completed (0..1). */
  pct: number;
  /** True when the day cleared the ⅔ threshold (counts as an active strength day). */
  met: boolean;
}

/** Sun→Sat ISO dates of the week containing `now` (matches the weekly-volume reset). */
function currentWeekDates(now: Date = new Date()): string[] {
  const sunday = new Date(now);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(now.getDate() - now.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return toISODate(d);
  });
}

export function useWeeklyStrengthGoal(enabled: boolean): DayStrengthGoalState[] | undefined {
  const uid = useUserStore((s) => s.profile?.id) ?? null;
  const [states, setStates] = useState<DayStrengthGoalState[] | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !uid) {
      setStates(undefined);
      return;
    }
    const dates = currentWeekDates();
    const ids = dates.map((d) => `${uid}_${d}`);
    const q = query(collection(db, 'dailyProgress'), where(documentId(), 'in', ids));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const byDate: Record<string, DayStrengthGoalState> = {};
        snap.forEach((docSnap) => {
          const d = docSnap.data() as {
            date?: string;
            dailyStrengthPct?: number;
            strengthGoalMet?: boolean;
            workoutCompleted?: boolean;
            workoutType?: string;
          };
          const isStrengthLegacy = !!d.workoutCompleted && d.workoutType === 'strength';
          const pct =
            typeof d.dailyStrengthPct === 'number' ? d.dailyStrengthPct : isStrengthLegacy ? 1 : 0;
          const met =
            typeof d.strengthGoalMet === 'boolean' ? d.strengthGoalMet : isStrengthLegacy;
          const date = d.date ?? '';
          if (date) byDate[date] = { date, pct: Math.max(0, Math.min(1, pct)), met };
        });
        setStates(dates.map((date) => byDate[date] ?? { date, pct: 0, met: false }));
      },
      () => setStates(undefined),
    );
    return () => unsub();
  }, [enabled, uid]);

  return states;
}

export default useWeeklyStrengthGoal;
