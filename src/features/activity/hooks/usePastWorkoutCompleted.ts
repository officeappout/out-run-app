'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Fetch `dailyProgress.workoutCompleted` (S8) for a set of PAST ISO dates.
 *
 * One getDoc per date (respects the uid-prefix Firestore rule). Returns a
 * Map<iso, true> of the days where an OUT workout was completed — the durable
 * "did the workout" memory that keeps a past day's flame alive after it rolls
 * from "today" to "past", independent of the S7 schedule-entry `completed` flag.
 *
 * Shared by SmartWeeklySchedule (week strip) and MonthlyCalendarGrid so both
 * surfaces read the SAME S8 source for past-day completion (single source of
 * truth — see parking-lot "לו״ז — שני הצגים" Stage 1).
 */
export function usePastWorkoutCompleted(
  userId: string | undefined,
  pastIsos: string[],
): Map<string, boolean> {
  const [map, setMap] = useState<Map<string, boolean>>(new Map());

  // Join into a stable primitive so the effect refires only when the SET of
  // past dates changes — a fresh array identity every render would thrash it.
  const key = pastIsos.join(',');

  useEffect(() => {
    if (!userId || !key) {
      setMap(new Map());
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
            return [iso, snap.exists() ? !!snap.data()?.workoutCompleted : false] as const;
          } catch {
            return [iso, false] as const;
          }
        }),
      );
      if (!cancelled) setMap(new Map(results.filter(([, done]) => done)));
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, key]);

  return map;
}
