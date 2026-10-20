'use client';

/**
 * Profile v2 records (P-3). User-doc fields come with the profile (0 reads);
 * exercise bests = ONE bounded read of the 4 most recent exerciseHistory
 * docs that carry bestAt (single-field orderBy, no new index), only once the
 * records section is shown.
 */
import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { buildRecordTiles, type ExerciseBest, type RecordTile } from '../components/records/record-tiles';

export function useProfileRecords(enabled: boolean): { tiles: RecordTile[]; loading: boolean } {
  const profile = useUserStore((s) => s.profile);
  const storeLongest = useActivityStore((s) => s.longestStreak);
  const uid = profile?.id ?? null;
  const [exercises, setExercises] = useState<ExerciseBest[] | null>(null);

  useEffect(() => {
    if (!enabled || !uid || exercises) return;
    let alive = true;
    getDocs(query(collection(db, 'users', uid, 'exerciseHistory'), orderBy('bestAt', 'desc'), limit(4)))
      .then((snap) => {
        if (!alive) return;
        setExercises(
          snap.docs.map((d) => {
            const x = d.data() as { exerciseName?: string; bestReps?: number; bestAt?: number };
            return { exerciseId: d.id, name: x.exerciseName || d.id, bestReps: Number(x.bestReps) || 0, bestAt: typeof x.bestAt === 'number' ? x.bestAt : null };
          }),
        );
      })
      .catch((e) => {
        console.warn('[records] exercise bests read failed', e);
        if (alive) setExercises([]);
      });
    return () => {
      alive = false;
    };
  }, [enabled, uid, exercises]);

  const progression = profile?.progression;
  const tiles = useMemo(
    () =>
      buildRecordTiles({
        records: progression?.records,
        periodTotals: progression?.periodTotals,
        longestStreak: Math.max(Number(progression?.longestStreak) || 0, Number(storeLongest) || 0),
        exercises: exercises ?? [],
        nowMs: Date.now(),
      }),
    [progression?.records, progression?.periodTotals, progression?.longestStreak, storeLongest, exercises],
  );
  return { tiles, loading: enabled && exercises === null };
}
