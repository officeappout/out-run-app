'use client';

/**
 * Exercise page v2 — sessions in pages of 60 (newest first) + the custom goal.
 * Replaces the unbounded read of useExerciseAnalytics for the v2 page only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { getCustomGoal, saveCustomGoal } from '@/features/profile/services/exercise-goal.service';
import { getExerciseSessionsPage } from '@/features/profile/services/exercise-sessions-page.service';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';

export function useExerciseSessionsPaged(userId: string | null, exerciseId: string) {
  const [desc, setDesc] = useState<RichExerciseSession[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [customGoal, setCustomGoal] = useState<number | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const cursor = useRef<QueryDocumentSnapshot | null>(null);

  useEffect(() => {
    if (!userId || !exerciseId) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(false);
    cursor.current = null;
    Promise.all([getExerciseSessionsPage(userId, exerciseId), getCustomGoal(userId, exerciseId)])
      .then(([page, goal]) => {
        if (!alive) return;
        cursor.current = page.cursor;
        setDesc(page.sessions);
        setHasMore(page.hasMore);
        setCustomGoal(goal);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId, exerciseId]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getExerciseSessionsPage(userId, exerciseId, cursor.current);
      cursor.current = page.cursor;
      setDesc((prev) => [...prev, ...page.sessions]);
      setHasMore(page.hasMore);
    } catch (e) {
      console.warn('[ExerciseV2] loadMore failed', e);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, exerciseId, hasMore, loadingMore]);

  const saveGoal = useCallback(
    async (target: number) => {
      if (!userId) return;
      const before = customGoal;
      setCustomGoal(target);
      setSavingGoal(true);
      try {
        await saveCustomGoal(userId, exerciseId, target);
      } catch (e) {
        setCustomGoal(before);
        console.error('[ExerciseV2] saveGoal failed', e);
      } finally {
        setSavingGoal(false);
      }
    },
    [userId, exerciseId, customGoal],
  );

  /** Oldest → newest, for charts. */
  const asc = useMemo(() => [...desc].reverse(), [desc]);
  return { desc, asc, hasMore, loading, loadingMore, error, loadMore, customGoal, saveGoal, savingGoal };
}
