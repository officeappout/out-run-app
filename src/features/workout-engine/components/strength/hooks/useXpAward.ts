'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnimation, type AnimationControls } from 'framer-motion';
import { useToast } from '@/components/ui/Toast';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';

import type { CompletedExercise, Difficulty } from '../utils/summary.utils';

/**
 * useXpAward — Cloud-Function-backed XP award with Dopamine Chain animation.
 *
 * Absorbs:
 *   • XP-award status state machine (`pending` → `awarded` / `failed`)
 *   • Optimistic Zustand snapshot + rollback on Cloud Function failure
 *   • Dopamine Chain Step 2 elastic pulse → gates Step 3 (`streakChainReady`)
 *   • Mount-fire of the CF call (single-shot via `xpCallRef`)
 *   • Retry path exposed via `runAwardXP` callback
 *
 * **Behaviour fix (S-12 batch):**
 * The legacy code did `if (!result.success) throw …` — but
 * `useProgressionStore.awardStrengthXP` returns `{ xpEarned, newLevel, leveledUp }`
 * with no `success` field, so that branch fired on every successful call
 * (making the XP path always go to `failed`). The check has been removed —
 * we trust the resolved result, and the catch block handles thrown CF errors.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-5).
 */

export type XpStatus = 'pending' | 'awarded' | 'failed';

export interface UseXpAwardParams {
  /** Workout difficulty — fallback when `difficultyBolts` is absent. */
  difficulty: Difficulty;
  /** Numeric bolt difficulty (1-3) from the workout generator. */
  difficultyBolts?: 1 | 2 | 3;
  /** Workout duration in whole minutes (from `useSummaryAnalytics`). */
  durationMinutes: number;
  /** Total reps across all sets. */
  totalReps: number;
  /** Session exercises — used to count `totalSets`. */
  completedExercises: CompletedExercise[];
  /**
   * Recovery session — when true, the strength-XP Cloud Function
   * (`awardStrengthXP`) is NOT called, so a rest-day recovery workout earns no
   * strength XP/level. Defaults to false (normal workout).
   */
  isRecovery?: boolean;
  /**
   * Parametric seam for a FUTURE recovery-XP award. Only consulted when
   * `isRecovery` is true; defaults to 0 (no XP today — the current product
   * decision). To enable recovery-XP later, DO NOT just raise this number for
   * display: real XP is server-owned (axiom §2) and must route through the
   * Guardian (`awardWorkoutXP.ts`) with a value that traces to
   * XP_Progression_Truth — wire that here, then feed the earned amount back.
   */
  recoveryXp?: number;
  /**
   * Read-only history view of an already-saved workout — never call the
   * Guardian CF (`awardStrengthXP`) again. `savedXpEarned` is shown instead,
   * as-is, with no CF round-trip (the CF has zero server-side idempotency,
   * so a replayed call would mint duplicate real XP — see axioms.md LAW 0).
   */
  isReadOnly?: boolean;
  /** Already-awarded XP to display when `isReadOnly` is true. */
  savedXpEarned?: number;
}

export interface UseXpAwardResult {
  xpStatus: XpStatus;
  xpEarnedAmount: number;
  /** Framer-motion controls for the elastic XP pulse animation. */
  xpControls: AnimationControls;
  /** True once the elastic pulse animation has finished — gates Dopamine Step 3. */
  streakChainReady: boolean;
  /** Idempotent retry callback — wired to the "נסה שוב" button on failure. */
  runAwardXP: () => Promise<void>;
}

export function useXpAward({
  difficulty,
  difficultyBolts,
  durationMinutes,
  totalReps,
  completedExercises,
  isRecovery = false,
  recoveryXp = 0,
  isReadOnly = false,
  savedXpEarned = 0,
}: UseXpAwardParams): UseXpAwardResult {
  const { showToast } = useToast();

  const [xpStatus, setXpStatus] = useState<XpStatus>('pending');
  const [xpEarnedAmount, setXpEarnedAmount] = useState(0);
  const xpCallRef = useRef(false);

  const xpControls = useAnimation();
  const [streakChainReady, setStreakChainReady] = useState(false);
  const hasFiredOnMount = useRef(false);

  const runAwardXP = useCallback(async () => {
    if (xpCallRef.current) return;
    xpCallRef.current = true;

    // Read-only guard: history view of an already-saved workout — never
    // call the Guardian CF again, just surface the value already awarded.
    if (isReadOnly) {
      setXpEarnedAmount(savedXpEarned);
      setXpStatus('awarded');
      return;
    }

    // Recovery guard: rest-day / recovery sessions do NOT award strength XP.
    // Skip the awardStrengthXP Cloud Function entirely (no strength XP/level, no
    // optimistic Zustand write to roll back). `recoveryXp` is the single seam for
    // a future recovery-XP award (0 today) — see UseXpAwardParams. Status still
    // resolves to 'awarded' so the Dopamine Chain (streak flame) proceeds, since
    // recovery still counts as daily activity.
    if (isRecovery) {
      setXpEarnedAmount(recoveryXp);
      setXpStatus('awarded');
      return;
    }

    // Snapshot pre-call Zustand values for rollback if the CF fails.
    const xpBefore = useProgressionStore.getState().globalXP;
    const levelBefore = useProgressionStore.getState().globalLevel;

    try {
      const bolts: 1 | 2 | 3 =
        difficultyBolts ?? (difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3);
      const totalSetsCount = completedExercises.reduce((acc, ex) => acc + ex.sets.length, 0);
      // useActivityStore.currentStreak is updated synchronously by syncWorkoutCompletion
      // (called by useActivitySync earlier in the same mount tick).
      // useProgressionStore.currentStreak may still be stale — take the max.
      const currentStreak = Math.max(
        useActivityStore.getState().currentStreak,
        useProgressionStore.getState().currentStreak,
      );

      const result = await useProgressionStore.getState().awardStrengthXP({
        durationMinutes,
        difficultyBolts: bolts,
        totalSets: totalSetsCount,
        totalReps,
        streak: currentStreak,
      });

      setXpEarnedAmount(result.xpEarned);
      setXpStatus('awarded');
      console.log(
        `[XP] +${result.xpEarned} XP → Level ${result.newLevel}${result.leveledUp ? ' (LEVEL UP!)' : ''}`,
      );
    } catch (e) {
      xpCallRef.current = false; // unlock so the retry button works
      // Roll back the optimistic Zustand update applied inside awardStrengthXP.
      useProgressionStore.setState({ globalXP: xpBefore, globalLevel: levelBefore });
      console.error('[XP] Failed to award XP — rolled back optimistic update:', e);
      setXpStatus('failed');
      showToast('error', 'לא הצלחנו לשמור את ה-XP. לחץ "נסה שוב" כדי לנסות שוב.');
    }
  }, [difficultyBolts, difficulty, completedExercises, durationMinutes, totalReps, showToast, isRecovery, recoveryXp, isReadOnly, savedXpEarned]);

  // Fire once on mount.  Declared after useActivitySync in the orchestrator so
  // syncWorkoutCompletion has already updated useActivityStore.currentStreak.
  useEffect(() => {
    if (hasFiredOnMount.current) return;
    hasFiredOnMount.current = true;
    runAwardXP();
  }, [runAwardXP]);

  // Dopamine Chain Step 2: elastic XP pulse → gates Step 3 (streak flame ignite)
  useEffect(() => {
    if (xpStatus !== 'awarded') return;
    xpControls
      .start({
        scale: [1, 1.35, 0.9, 1.15, 1],
        transition: { duration: 0.7, times: [0, 0.25, 0.55, 0.75, 1], ease: 'easeOut' },
      })
      .then(() => setStreakChainReady(true));
  }, [xpStatus, xpControls]);

  return { xpStatus, xpEarnedAmount, xpControls, streakChainReady, runAwardXP };
}
