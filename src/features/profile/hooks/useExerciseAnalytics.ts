'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import {
  getExerciseAnalytics,
  type ExerciseAnalytics,
  type RichExerciseSession,
} from '@/features/workout-engine/services/exercise-history.service';
import {
  getCustomGoal,
  saveCustomGoal,
} from '@/features/profile/services/exercise-goal.service';

export type TimeRange = '1m' | '3m' | 'all';
export type Metric = 'maxReps' | 'totalVolume';

/** Milliseconds per time range bucket used for client-side filtering. */
const RANGE_MS: Record<Exclude<TimeRange, 'all'>, number> = {
  '1m': 30 * 24 * 60 * 60 * 1000,
  '3m': 90 * 24 * 60 * 60 * 1000,
};

interface UseExerciseAnalyticsReturn {
  analytics: ExerciseAnalytics | null;
  /** Sessions filtered to the selected time range, oldest → newest. */
  filteredSessions: RichExerciseSession[];
  loading: boolean;
  error: boolean;
  /**
   * The target to show on the chart reference line.
   * Priority: user custom goal > session-derived target.
   * `null` when neither source has a meaningful value (> 1).
   */
  effectiveTarget: number | null;
  /** The user-set custom goal, or null if none saved yet. */
  customGoal: number | null;
  /** Persist a new custom goal and optimistically update local state. */
  saveGoal: (targetReps: number) => Promise<void>;
  savingGoal: boolean;
}

/**
 * Loads the complete analytics payload and custom goal for one exercise.
 *
 * - The full Firestore fetch fires once per exerciseId mount.
 * - Time-range filtering is done client-side via `useMemo` — instant, no reads.
 * - Custom goal is read in parallel with analytics; updates are optimistic.
 */
export function useExerciseAnalytics(
  exerciseId: string,
  timeRange: TimeRange,
): UseExerciseAnalyticsReturn {
  const [analytics, setAnalytics] = useState<ExerciseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [customGoal, setCustomGoal] = useState<number | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !exerciseId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    // Fire both reads in parallel so neither blocks the other.
    Promise.all([
      getExerciseAnalytics(uid, exerciseId),
      getCustomGoal(uid, exerciseId),
    ])
      .then(([result, goal]) => {
        if (cancelled) return;
        setAnalytics(result);
        setCustomGoal(goal);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  const filteredSessions = useMemo<RichExerciseSession[]>(() => {
    if (!analytics) return [];
    if (timeRange === 'all') return analytics.sessions;
    const cutoff = Date.now() - RANGE_MS[timeRange];
    return analytics.sessions.filter((s) => s.dateMs >= cutoff);
  }, [analytics, timeRange]);

  // Custom goal takes priority; fall back to the session-derived target.
  const effectiveTarget: number | null =
    customGoal ?? analytics?.latestTargetReps ?? null;

  const saveGoal = useCallback(
    async (targetReps: number) => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      // Optimistic update so the UI reflects immediately.
      setCustomGoal(targetReps);
      setSavingGoal(true);
      try {
        await saveCustomGoal(uid, exerciseId, targetReps);
      } catch (e) {
        // Roll back on failure.
        setCustomGoal((prev) => (prev === targetReps ? null : prev));
        console.error('[useExerciseAnalytics] saveGoal failed:', e);
      } finally {
        setSavingGoal(false);
      }
    },
    [exerciseId],
  );

  return {
    analytics,
    filteredSessions,
    loading,
    error,
    effectiveTarget,
    customGoal,
    saveGoal,
    savingGoal,
  };
}
