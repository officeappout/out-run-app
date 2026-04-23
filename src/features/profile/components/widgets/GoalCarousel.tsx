'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useActiveProgramGoals } from '@/features/user/progression/hooks/useActiveProgramGoals';
import { getRecentExerciseIds } from '@/features/workout-engine/services/exercise-history.service';
import GoalCard from './GoalCard';
import type { LevelGoal } from '@/types/workout';

/**
 * Horizontal carousel of GoalCard widgets.
 *
 * Priority:
 *   1. Target goals from ALL user's active programs (merged, deduplicated).
 *   2. Fallback: user's top 2 most-trained exercises from exerciseHistory.
 *
 * The carousel is NEVER empty — it always renders data or a skeleton.
 * Cards navigate to ExerciseAnalyticsPage on tap.
 */
export default function GoalCarousel() {
  const { goals: programGoals, loading: goalsLoading } = useActiveProgramGoals();

  // ── Reliable userId from persisted store, not auth singleton ─────────────
  // auth.currentUser is null during the first render if Firebase hasn't resolved
  // yet, which breaks the fallback fetch guard. useUserStore is already hydrated
  // from localStorage so it returns the uid immediately.
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id ?? '';

  const router = useRouter();

  // ── Fallback state ────────────────────────────────────────────────────────
  const [fallbackGoals, setFallbackGoals] = useState<LevelGoal[]>([]);
  // Start true so the skeleton shows immediately — we don't know yet whether
  // primary goals will be populated. Set to false only once we know for certain.
  const [fallbackLoading, setFallbackLoading] = useState(true);
  const fallbackFetchedRef = useRef(false);

  useEffect(() => {
    // Still waiting for primary goals
    if (goalsLoading) return;

    // Primary goals exist — no fallback needed
    if (programGoals.length > 0) {
      setFallbackLoading(false);
      return;
    }

    // Primary goals confirmed empty: fetch fallback (once per mount)
    if (fallbackFetchedRef.current) return;
    fallbackFetchedRef.current = true;

    if (!userId) {
      setFallbackLoading(false);
      return;
    }

    setFallbackLoading(true);
    getRecentExerciseIds(userId, 2)
      .then((recent) => {
        const syntheticGoals: LevelGoal[] = recent.map((ex) => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          targetValue: 20,
          unit: 'reps' as const,
        }));
        setFallbackGoals(syntheticGoals);
      })
      .catch(() => {})
      .finally(() => setFallbackLoading(false));
  }, [goalsLoading, programGoals.length, userId]);

  // Loading while: primary goals loading OR (primary empty AND fallback still fetching)
  const isLoading = goalsLoading || (programGoals.length === 0 && fallbackLoading);
  const displayGoals = programGoals.length > 0 ? programGoals : fallbackGoals;

  const handleCardClick = (goal: LevelGoal) => {
    router.push(
      `/profile/exercise/${encodeURIComponent(goal.exerciseId)}?name=${encodeURIComponent(goal.exerciseName)}`,
    );
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100" dir="rtl">
      <h3 className="text-sm font-black text-gray-800 mb-3">יעדי תרגילים</h3>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-40 flex-shrink-0 h-44 bg-gray-100 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : displayGoals.length === 0 ? (
        /* Truly empty — no program goals AND no training history */
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <span className="text-3xl">🎯</span>
          <p className="text-sm font-bold text-gray-500 text-center leading-snug">
            עדיין לא התאמנת.
            <br />
            התחל אימון כדי לראות יעדים כאן.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {displayGoals.map((goal) => (
            <GoalCard
              key={goal.exerciseId}
              goal={goal}
              userId={userId}
              isFallback={programGoals.length === 0}
              onClick={() => handleCardClick(goal)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
