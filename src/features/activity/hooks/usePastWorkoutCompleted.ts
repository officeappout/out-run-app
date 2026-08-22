'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Two parallel per-date maps returned by `usePastWorkoutCompleted`, built
 * from the SAME batch of `dailyProgress` reads (one Promise.all, not two).
 * Both maps are sparse — a date key is present only when that day's
 * `workoutCompleted` was true; `recoveryMap` mirrors that same date set so
 * `recoveryMap.get(iso)` is only ever meaningful for dates also present in
 * `completedMap` (a day that wasn't completed has no recovery concept).
 */
export interface PastWorkoutCompletionMaps {
  /** ISO date → true (S8 `dailyProgress.workoutCompleted`). */
  completedMap: Map<string, boolean>;
  /**
   * ISO date → true when that completed day's `dailyProgress.isRecovery`
   * was true (recovery-video-trio OR Budget-Floor cooldown, not bonus
   * effort). Gated by RECOVERY_DAY_BADGE_FIX_ENABLED — see feature-flags.ts;
   * always empty while the flag is off, since no document is ever written
   * with `isRecovery: true`.
   */
  recoveryMap: Map<string, boolean>;
}

/**
 * Fetch `dailyProgress.workoutCompleted` + `dailyProgress.isRecovery` (S8)
 * for a set of PAST ISO dates.
 *
 * One getDoc per date (respects the uid-prefix Firestore rule). Returns the
 * durable "did the workout / was it recovery-only" memory that keeps a past
 * day's flame (and its Beast-Mode-suppression) alive after it rolls from
 * "today" to "past", independent of the S7 schedule-entry `completed` flag.
 *
 * Shared by SmartWeeklySchedule (week strip) and MonthlyCalendarGrid so both
 * surfaces read the SAME S8 source for past-day completion (single source of
 * truth — see parking-lot "לו״ז — שני הצגים" Stage 1).
 */
export function usePastWorkoutCompleted(
  userId: string | undefined,
  pastIsos: string[],
): PastWorkoutCompletionMaps {
  const [completedMap, setCompletedMap] = useState<Map<string, boolean>>(new Map());
  const [recoveryMap, setRecoveryMap] = useState<Map<string, boolean>>(new Map());

  // Join into a stable primitive so the effect refires only when the SET of
  // past dates changes — a fresh array identity every render would thrash it.
  const key = pastIsos.join(',');

  useEffect(() => {
    if (!userId || !key) {
      setCompletedMap(new Map());
      setRecoveryMap(new Map());
      return;
    }
    let cancelled = false;
    const isos = key.split(',');

    (async () => {
      const results = await Promise.all(
        isos.map(async (iso) => {
          try {
            const ref = doc(db, 'dailyProgress', `${userId}_${iso}`);
            const snap = await getDoc(ref);
            const data = snap.exists() ? snap.data() : undefined;
            return [iso, !!data?.workoutCompleted, !!data?.isRecovery] as const;
          } catch {
            return [iso, false, false] as const;
          }
        }),
      );
      if (!cancelled) {
        const completedEntries = results.filter(([, done]) => done);
        setCompletedMap(new Map(completedEntries.map(([iso, done]) => [iso, done])));
        setRecoveryMap(new Map(completedEntries.map(([iso, , isRecovery]) => [iso, isRecovery])));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, key]);

  return { completedMap, recoveryMap };
}
