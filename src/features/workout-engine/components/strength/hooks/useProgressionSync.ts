'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useToast } from '@/components/ui/Toast';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { processWorkoutCompletion } from '@/features/user/progression/services/progression.service';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';

import type { CompletedExercise } from '../utils/summary.utils';

/**
 * useProgressionSync — domain + active-program level progression dispatcher.
 *
 * Encapsulates the 3-way progression branch from the legacy mount effect:
 *   1. **precomputedProgression provided** — use it directly, skip the call.
 *   2. **`progression_started_this_session` flag set AND not failed** — dopamine
 *      phase already ran (or is in flight) — skip to avoid double-write.
 *   3. **Neither flag set, or explicitly failed** — invoke
 *      `processWorkoutCompletion` (genuine first-run or retry path).
 *
 * On success:
 *   • Schedules the level-up modal (1.2s delay) if active program leveled up.
 *   • Awards one-time bonus XP for newly completed admin-defined goals.
 *   • Surfaces linked-program level-ups as staggered toasts.
 *   • Logs the "ready for split" suggestion list (FIX: uses `suggestedSplit`,
 *     the actual field on `ReadyForSplitStatus` — the legacy code referenced
 *     a non-existent `suggestedPrograms` field).
 *   • Warns the user if the Firestore write did not persist.
 *
 * Triggers a Goal Celebration confetti whenever the level-up modal opens.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-6).
 */

export interface UseProgressionSyncParams {
  /** Active program id from the workout source. */
  programId?: string;
  /** Current level in the active program — drives goal-bonus lookup. */
  currentLevel: number;
  /** Aggregated completed exercises (fallback when `rawExerciseLog` is absent). */
  completedExercises: CompletedExercise[];
  /** Raw exercise log from StrengthRunner (preferred over `completedExercises`). */
  rawExerciseLog?: {
    exerciseId: string;
    exerciseName: string;
    segmentId: string;
    confirmedReps: number[];
    targetReps: number;
  }[];
  /** Session duration in whole minutes. */
  durationMinutes: number;
  /** Pre-computed result from ActiveWorkoutPage — when present, skip the CF call. */
  precomputedProgression?: WorkoutCompletionResult | null;
}

export interface UseProgressionSyncResult {
  progressionResult: WorkoutCompletionResult | null;
  showLevelUpModal: boolean;
  setShowLevelUpModal: (v: boolean) => void;
}

export function useProgressionSync({
  programId,
  currentLevel,
  completedExercises,
  rawExerciseLog,
  durationMinutes,
  precomputedProgression,
}: UseProgressionSyncParams): UseProgressionSyncResult {
  const { showToast } = useToast();
  const { celebrate } = useGoalCelebration();

  const [progressionResult, setProgressionResult] = useState<WorkoutCompletionResult | null>(
    precomputedProgression ?? null,
  );
  const [showLevelUpModal, setShowLevelUpModal] = useState(false);
  const hasFired = useRef(false);

  // Confetti whenever the level-up modal opens.
  useEffect(() => {
    if (showLevelUpModal) {
      celebrate('level_up', 300);
    }
  }, [showLevelUpModal, celebrate]);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    // Branch 1: pre-computed result.
    if (precomputedProgression) {
      console.log('[Progression] Using precomputed result from ActiveWorkoutPage — skipping duplicate call');
      if (precomputedProgression.success && precomputedProgression.activeProgramGain.leveledUp) {
        setTimeout(() => setShowLevelUpModal(true), 1200);
      }
      return;
    }

    // Branch 2: dopamine phase already ran/started — skip.
    const progressionStarted = typeof window !== 'undefined' &&
      sessionStorage.getItem('progression_started_this_session') === 'true';
    const progressionFailed = typeof window !== 'undefined' &&
      sessionStorage.getItem('progression_failed_this_session') === 'true';

    if (progressionStarted && !progressionFailed) {
      console.log('[Progression] Skipping fallback — dopamine phase already started progression');
      return;
    }

    // Branch 3: fallback first-run or retry path.
    const triggerDomainProgression = async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        // Resolve the active program id (prop → user doc → default).
        let resolvedProgramId: string | undefined = programId;
        if (!resolvedProgramId) {
          const userDocRef = doc(db, 'users', uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            resolvedProgramId =
              userData.currentProgramId ||
              userData.progression?.activePrograms?.[0]?.id ||
              'full_body';
          } else {
            resolvedProgramId = 'full_body';
          }
        }
        // After the fallback chain above this is always defined; widen-narrow for TS.
        const activeProgramId: string = resolvedProgramId ?? 'full_body';

        const exerciseResults = rawExerciseLog && rawExerciseLog.length > 0
          ? rawExerciseLog.map((entry) => ({
              exerciseId: entry.exerciseId,
              exerciseName: entry.exerciseName,
              programLevels: {} as Record<string, number>,
              setsCompleted: entry.confirmedReps.length,
              repsPerSet: entry.confirmedReps,
              targetReps: entry.targetReps,
              isCompound: false,
            }))
          : completedExercises
              .filter((ex) => ex.category === 'main' || ex.category === 'superset')
              .map((ex) => ({
                exerciseId: ex.id,
                exerciseName: ex.name,
                programLevels: {} as Record<string, number>,
                setsCompleted: ex.sets.length,
                repsPerSet: ex.sets,
                targetReps: ex.sets.length > 0 ? Math.max(...ex.sets) : 10,
                isCompound: ex.category === 'superset',
              }));

        if (exerciseResults.length === 0) {
          console.log('[Progression] No main/superset exercises to process — skipping domain progression');
          return;
        }

        const result = await processWorkoutCompletion({
          userId: uid,
          activeProgramId,
          exercises: exerciseResults,
          totalDuration: durationMinutes,
          completedAt: new Date(),
        });

        setProgressionResult(result);

        if (result.success) {
          const gain = result.activeProgramGain;
          console.log(
            `[Progression] Domain progression: ${activeProgramId} +${gain.totalGain.toFixed(1)}%` +
              ` (base=${gain.baseGain.toFixed(1)}, perf=${gain.bonusGain.toFixed(1)}, goals=${gain.goalBonusGain.toFixed(1)})` +
              (gain.leveledUp ? ` → LEVEL UP to ${gain.newLevel}!` : ` (now ${gain.newPercent.toFixed(1)}%)`),
          );

          if (gain.leveledUp) {
            setTimeout(() => setShowLevelUpModal(true), 1200);
          }

          // ── Unified Rewards: one-time Global XP bonus for newly completed goals ──
          if (gain.newlyCompletedGoalIds && gain.newlyCompletedGoalIds.length > 0) {
            try {
              const levelSettings = await getProgramLevelSetting(activeProgramId, currentLevel);
              const allGoals = levelSettings?.targetGoals ?? [];
              const bonusXP = gain.newlyCompletedGoalIds.reduce((sum, id) => {
                const goal = allGoals.find((g: { exerciseId?: string; xpBonus?: number }) => g.exerciseId === id);
                return sum + (goal?.xpBonus ?? 0);
              }, 0);
              if (bonusXP > 0) {
                useProgressionStore
                  .getState()
                  .awardBonusXP(bonusXP, 'goal-completion')
                  .then(({ xpEarned }) => {
                    console.log(
                      `[Progression] Goal XP bonus: +${xpEarned} Global XP for ${gain.newlyCompletedGoalIds!.length} completed goal(s)`,
                    );
                  })
                  .catch(() => {});
              }
            } catch (e) {
              console.warn('[Progression] Could not award goal XP bonus (non-critical):', e);
            }
          }

          // ── Linked program level-ups → staggered toasts ──
          if (result.linkedProgramGains.length > 0) {
            console.log(
              '[Progression] Linked programs updated:',
              result.linkedProgramGains.map((lp) => `${lp.programId} +${lp.gain.toFixed(1)}%`).join(', '),
            );

            const linkedLevelUps = result.linkedProgramGains.filter((lp) => lp.leveledUp);
            linkedLevelUps.forEach((lp, idx) => {
              const offsetMs = 2500 + idx * 1500; // 2.5s, then +1.5s per extra
              setTimeout(() => {
                const display = lp.programId.replace(/_/g, ' ');
                showToast('success', `🏆 עלית רמה ב${display} → רמה ${lp.newLevel}!`);
              }, offsetMs);
            });
          }

          // Fix: ReadyForSplitStatus exposes `suggestedSplit`, not `suggestedPrograms`.
          if (result.readyForSplit?.isReady) {
            console.log(
              `[Progression] Ready for split! Suggested: ${result.readyForSplit.suggestedSplit?.join(', ')}`,
            );
          }

          if (!result.trackWriteSucceeded) {
            showToast('error', 'ההתקדמות חושבה אך לא נשמרה. בדוק חיבור לאינטרנט.');
          }
        } else {
          console.warn('[Progression] processWorkoutCompletion returned failure');
          showToast('error', 'שגיאה בחישוב ההתקדמות. נסה שוב.');
        }
      } catch (e) {
        console.error('[Progression] Failed to process domain progression:', e);
      }
    };
    triggerDomainProgression();
  // Intentional mount-only fire; the ref guard handles correctness.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { progressionResult, showLevelUpModal, setShowLevelUpModal };
}
