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
import { Target } from 'lucide-react';
import { useUiGender } from '@/hooks/useUiGender';
import { pickGendered } from '@/lib/i18n/gender-copy';

/** No workouts yet (gender copy, decisions 1 + 21.10.2026). */
const EMPTY_GOALS_HINT = {
  male: 'התחל אימון כדי לראות יעדים כאן.',
  female: 'התחילי אימון כדי לראות יעדים כאן.',
  other: 'אחרי האימון הראשון, היעדים יופיעו כאן.',
};

export default function GoalCarousel({ v2 = false }: { v2?: boolean } = {}) {
  const gender = useUiGender();
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

  if (v2) {
    return (
      <div dir="rtl">
        <h3 className="mb-3 text-[15px] font-black text-v2-ink">יעדי תרגילים</h3>
        {isLoading ? (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-hide">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 w-40 flex-shrink-0 animate-pulse rounded-[20px] bg-white shadow-v2-ring" />
            ))}
          </div>
        ) : displayGoals.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-v2-card bg-white px-5 py-6 text-center shadow-v2-card">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-v2-tint text-v2-deep">
              <Target className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-[14px] font-bold leading-snug text-v2-ink-2">
              עדיין לא התאמנת.
              <br />
              {pickGendered(gender, EMPTY_GOALS_HINT)}
            </p>
          </div>
        ) : (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-hide">
            {displayGoals.map((goal) => (
              <GoalCard
                key={goal.exerciseId}
                goal={goal}
                userId={userId}
                isFallback={programGoals.length === 0}
                onClick={() => handleCardClick(goal)}
                v2
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div dir="rtl">
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
            {pickGendered(gender, EMPTY_GOALS_HINT)}
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
