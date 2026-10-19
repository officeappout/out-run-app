"use client";

/**
 * StrengthSummaryPage — lean orchestrator for the post-workout summary screen.
 *
 * After Decoupling Steps S-1 … S-9 (~1.4k lines → orchestrator-only) this
 * file only:
 *   1. Receives session props from the workout player.
 *   2. Wires 6 single-responsibility hooks together (the ordering matters —
 *      see the "Hook stack" section below).
 *   3. Bridges hook output → 14 sub-components (5 atoms + 9 views).
 *   4. Owns the static page shell (sticky header, scroll surface, footer
 *      "thanks" button, custom-scrollbar style block).
 *
 * Public surface (props + helper re-exports) is unchanged from pre-decoupling
 * for back-compat with `./index.ts` and direct importers.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { WHO_COMPLIANCE_BASELINE } from '@/features/activity/types/activity.types';
import { buildPhaseSummary, sessionTotals, type PlanSegment } from './utils/phase-summary';
import { timedResultsFor } from '@/features/workout-engine/players/strength/timed/state/timed-results';
import { useSummaryStreakWeek } from '@/features/workout-engine/summary/hooks/useSummaryStreakWeek';
import { IS_COMMUNITY_FEED_ENABLED } from '@/config/feature-flags';
import SummaryFeedShare from '@/features/social/components/SummaryFeedShare';
import { shareTotalsFromPhases } from '@/features/social/share-v2/summary-totals';
import { buildStrengthPostDetails } from '@/features/social/services/feed-post-details';
import {
  clearPendingShare,
  feedPrefsFrom,
  type SummaryShareDecision,
} from '@/features/social/services/feed-prefs';

// ── Shared types + helpers (re-exported at the bottom for back-compat) ──
import {
  type CompletedExercise,
  type Difficulty,
  type LevelGoalDef,
  calculateCalories,
  calculateCoins,
  formatDuration,
  MET_BY_DIFFICULTY,
  COIN_RATIO,
  COIN_BONUS_BY_DIFFICULTY,
} from './utils/summary.utils';

// ── Presentational view (hook-free; renders from props/fixtures) ──
import StrengthSummaryView, { type StrengthSummaryV2Data } from './StrengthSummaryView';

// ── Hooks (S-2 … S-7) ──
import { useSummaryAnalytics } from './hooks/useSummaryAnalytics';
import { useGoalEvaluation } from './hooks/useGoalEvaluation';
import { useEmailCapture } from './hooks/useEmailCapture';
import { useXpAward } from './hooks/useXpAward';
import { useProgressionSync } from './hooks/useProgressionSync';

// ============================================================================
// PROPS
// ============================================================================

export interface StrengthSummaryPageProps {
  /** Duration in seconds */
  duration: number;
  /** Total reps across all exercises */
  totalReps: number;
  /** List of completed exercises with their details */
  completedExercises: CompletedExercise[];
  /** Workout difficulty level */
  difficulty: Difficulty;
  /** Current streak (consecutive workouts) */
  streak?: number;
  /** Current program ID (e.g. 'full_body', 'push') - used for domain progression */
  programId?: string;
  /** Current program name */
  programName?: string;
  /** Current level in program */
  currentLevel?: number;
  /** Max level in program */
  maxLevel?: number;
  /** Progress percentage to next level */
  progressToNextLevel?: number;
  /**
   * Callback when user finishes viewing summary.
   * Receives the XP that was actually awarded by the Cloud Function so the
   * workout Firestore document can store the real value (not the base estimate).
   * Not called in `isReadOnly` mode — use `onClose` instead.
   */
  onFinish?: (xpData: {
    xpEarned: number;
    xpStatus: 'pending' | 'awarded' | 'failed';
    /**
     * enable_home_v2: the summary's "לשתף את האימון בפיד?" card choice.
     * Absent/null = the card was ignored → the feed post is decided exactly
     * as before (auto-publish or a pending share).
     */
    feedShare?: SummaryShareDecision | null;
  }) => void;

  // ── Read-only history view ─────────────────────────────────────────────
  /**
   * Renders this same live post-workout screen for an already-saved past
   * workout instead of the fresh-completion flow. Hard-bypasses every write
   * side effect (XP award CF, activity/coin/volume/muscle-shield writes,
   * domain progression, email-capture drawer) — see the 3 write hooks below.
   * Defaults to `false`, preserving the existing live-flow behavior exactly.
   */
  isReadOnly?: boolean;
  /** Already-awarded XP to display when `isReadOnly` is true. */
  savedXpEarned?: number;
  /** Close callback for `isReadOnly` mode (replaces `onFinish`). */
  onClose?: () => void;
  /**
   * Delete-trigger callback for `isReadOnly` mode — mirrors AerobicSummaryView's
   * contract exactly. This component doesn't own the confirm/delete flow;
   * tapping the trigger just calls the caller's `onDelete()`. Only rendered
   * when `isReadOnly && onDelete` are both present.
   */
  onDelete?: () => void;

  // ── Training OS fields ────────────────────────────────────────────────
  /** Whether this workout was a recovery session (skip volume budget) */
  isRecovery?: boolean;
  /** Total planned sets from the generated workout */
  totalPlannedSets?: number;
  /** Numeric difficulty (1-3) if available */
  difficultyBolts?: 1 | 2 | 3;

  // ── Persona Engine fields ──────────────────────────────────────────────
  /**
   * Training type of the source Program ('strength' | 'cardio').
   * Determines which ActivityCategory ring the workout minutes fill.
   */
  trainingType?: 'strength' | 'cardio';

  // ── Program Goal Sync ────────────────────────────────────────────────
  /** Admin-defined level goals from ProgramLevelSettings. */
  levelGoals?: LevelGoalDef[];

  // ── Phase 4.6: Real Scoring Pipeline ──────────────────────────────
  /** Raw exercise log from StrengthRunner with correct targetReps per exercise. */
  rawExerciseLog?: {
    exerciseId: string;
    exerciseName: string;
    segmentId: string;
    confirmedReps: number[];
    targetReps: number;
  }[];

  /**
   * Pre-computed progression result from ActiveWorkoutPage.
   * When provided, SummaryPage skips calling processWorkoutCompletion.
   */
  precomputedProgression?: WorkoutCompletionResult | null;

  /** Per-domain set counts for weekly volume tracking (Phase 3). */
  domainSets?: Record<string, number>;

  // ── Home v2 (enable_home_v2) — display-only inputs ────────────────────
  /**
   * The workout plan's real segments (phase / block / planned sets / targets).
   * Only read by the v2 exercise breakdown; absent (history) ⇒ phases fall
   * back to each exercise's category and planned counts stay unknown.
   */
  workoutSegments?: PlanSegment[];
  /** exerciseId → last session's per-set values (Progression Memory), for "improved vs last time". */
  previousSets?: Record<string, number[]>;
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export default function StrengthSummaryPage({
  duration,
  totalReps,
  completedExercises,
  difficulty,
  streak: propStreak = 0,
  programId: propProgramId,
  programName = 'תוכנית כל הגוף',
  currentLevel = 5,
  maxLevel = 25,
  progressToNextLevel = 80,
  onFinish,
  isRecovery = false,
  totalPlannedSets,
  difficultyBolts,
  trainingType,
  levelGoals,
  rawExerciseLog,
  precomputedProgression,
  domainSets,
  workoutSegments,
  previousSets,
  isReadOnly = false,
  savedXpEarned = 0,
  onClose,
  onDelete,
}: StrengthSummaryPageProps) {
  // ── User profile (for lifestyle CTA gate) ──
  const { profile } = useUserStore();
  const router = useRouter();
  const isSuperAdmin = !!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin;
  const { flags } = useFeatureFlags(isSuperAdmin);
  const homeV2 = flags.enableHomeV2;

  // ── Feed share card (enable_home_v2, live flow only) ──
  // Offered only when the post would otherwise wait as a share prompt (auto-
  // publish off for strength) and the feed is on. The choice is handed to
  // onFinish — the post itself is still made by the finish handler's
  // createWorkoutPost (no new write path).
  const [feedShare, setFeedShare] = useState<SummaryShareDecision | null>(null);
  const strengthAutoPublish = feedPrefsFrom(
    (profile?.social as { feedPrefs?: unknown } | undefined)?.feedPrefs,
  ).autoPublish.strength;
  const showFeedShare =
    homeV2 && !isReadOnly && !!onFinish && IS_COMMUNITY_FEED_ENABLED && flags.enableCommunityFeed && !strengthAutoPublish;

  // ── Program suggestions (Level Equivalence, mode:'suggest') ──
  // Dismissal is local-only (component state, no Firestore write) — a
  // dismissed suggestion simply reappears next time this screen reads
  // pendingProgramSuggestions from the profile, per the product decision
  // that "dismiss" defers rather than resolves.
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
  // Bug-fix round, 07.10.2026 — the Finish button had no disabled state,
  // so a double/triple-tap during handleSummaryFinish's multi-second
  // async save chain wrote 2-3 independent `workouts` docs for one real
  // session (that handler now also has its own module-level in-flight
  // guard, mirroring useRunningPlayer.ts/useHybridRun.ts — this is the
  // UI-level half of the same fix, giving the user visible feedback
  // instead of a silently-ignored second tap).
  const [isFinishing, setIsFinishing] = useState(false);
  const visibleSuggestions = (profile?.progression?.pendingProgramSuggestions ?? []).filter(
    (s) => !dismissedSuggestionIds.has(s.ruleId),
  );
  const handleAcceptSuggestion = (targetProgramId: string) => {
    // No level/percent is invented — routes to that program's own real
    // questionnaire (same single-skill path a new user picking it manually
    // would get), reusing the existing mini-assessment launcher.
    startMiniDomainAssessment(router, targetProgramId, '/home', 'skill');
  };
  const handleDismissSuggestion = (ruleId: string) => {
    setDismissedSuggestionIds((prev) => new Set(prev).add(ruleId));
  };

  // ── Hydration-safe sessionStorage read (avoid SSR mismatch) ──
  const [skippedBridge, setSkippedBridge] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSkippedBridge(sessionStorage.getItem('skipped_bridge') === 'true');
    }
  }, []);

  // ──────────────────────────────────────────────────────────────────────
  // Hook stack — declaration order matters.
  //
  //   1. useEmailCapture       — independent (account-secure drawer)
  //   2. useProgressionSync    — emits progressionResult (drives analytics)
  //   3. useSummaryAnalytics   — emits durationMinutes/calories/coins
  //   4. useGoalEvaluation     — independent (per-session goal checklist)
  //   5. useXpAward            — consumes durationMinutes
  //
  // The activity/streak write (formerly useActivitySync, step 5 here) no
  // longer fires on mount — it's a correctness fix (04.10.2026 streak
  // investigation): firing it the instant this screen is reached, before the
  // workout doc was ever saved, let an abandoned summary screen (app kill,
  // crash, back-navigation) write a streaks/{uid} update with nothing behind
  // it. It now runs via the standalone runActivitySync(), called from
  // active/page.tsx's handleSummaryFinish right after saveWorkoutToHistory
  // succeeds — same relocation running/hybrid's finishWorkout/finishHybrid
  // already use. One consequence: useXpAward below now reads
  // useActivityStore's currentStreak BEFORE this session's increment lands
  // (that increment happens later, at Finish) — it used to read the
  // already-incremented value. See useXpAward.ts's own comment on this.
  // ──────────────────────────────────────────────────────────────────────

  const email = useEmailCapture({ isReadOnly });

  const progression = useProgressionSync({
    programId: propProgramId,
    currentLevel,
    completedExercises,
    rawExerciseLog,
    durationMinutes: Math.max(1, Math.round(duration / 60)),
    precomputedProgression,
    isRecovery,
    isReadOnly,
  });

  const analytics = useSummaryAnalytics({
    duration,
    difficulty,
    completedExercises,
    propStreak,
    currentLevel,
    progressToNextLevel,
    progressionResult: progression.progressionResult,
  });

  const { evaluatedGoals } = useGoalEvaluation({
    levelGoals,
    programId: propProgramId,
    currentLevel,
    completedExercises,
  });

  const xp = useXpAward({
    difficulty,
    difficultyBolts,
    durationMinutes: analytics.durationMinutes,
    totalReps,
    completedExercises,
    isRecovery,
    isReadOnly,
    savedXpEarned,
  });

  // ── Home v2 data (display-only; flag OFF ⇒ undefined ⇒ today's view) ──
  // Streak dots: read-only activity-store read. Today counts as trained in
  // the live flow (this session's activity write runs later, at Finish).
  const streakWeek = useSummaryStreakWeek({ todayDone: !isReadOnly });
  const v2Phases = useMemo(
    () =>
      homeV2
        ? buildPhaseSummary({
            completedExercises,
            rawLog: rawExerciseLog,
            segments: workoutSegments,
            previousSets,
          })
        : null,
    [homeV2, completedExercises, rawExerciseLog, workoutSegments, previousSets],
  );
  let v2: StrengthSummaryV2Data | undefined;
  if (v2Phases) {
    // Activity-store weekly numbers are read BEFORE this session's sync (it
    // runs at Finish — see the hook-stack note above), so the live view adds
    // this one session exactly as runActivitySync will.
    const isCardio = trainingType === 'cardio';
    const scheduled = profile?.lifestyle?.scheduleDays?.length ?? 0;
    // Timed blocks finished in THIS session (in-memory; a history view has none).
    const timedResults = isReadOnly
      ? []
      : timedResultsFor((workoutSegments ?? []).map((s, i) => (s as { id?: string }).id || String(i))).map((r) => r.result);
    v2 = {
      phases: v2Phases,
      ...(timedResults.length > 0 ? { timedResults } : {}),
      totals: sessionTotals(v2Phases),
      streakWeek: isReadOnly ? null : streakWeek,
      week: isReadOnly
        ? null
        : {
            categoryLabel: isCardio ? 'אימוני אירובי השבוע' : 'אימוני כוח השבוע',
            sessions: analytics.weeklyCategorySessions[isCardio ? 'cardio' : 'strength'] + 1,
            plannedSessions: !isCardio && scheduled > 0 ? scheduled : null,
            minutes: analytics.weeklyAerobicMinutes + analytics.durationMinutes,
            whoMinutes: WHO_COMPLIANCE_BASELINE.weeklyAerobicMinutes,
          },
    };
  }

  // ── Lifestyle CTA handlers (inline — pure navigation/storage) ──
  const handleScheduleLifestyle = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/home?openWizard=true';
    }
  };
  const handleDismissLifestyle = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dismissed_lifestyle_cta', 'true');
    }
  };

  const showLifestyleCTA = !profile?.lifestyle?.scheduleDays && skippedBridge;

  const handlePrimaryAction = () => {
    if (isReadOnly) {
      onClose?.();
    } else {
      if (isFinishing) return;
      setIsFinishing(true);
      onFinish?.({
        xpEarned: xp.xpEarnedAmount,
        xpStatus: xp.xpStatus,
        ...(showFeedShare && feedShare ? { feedShare } : {}),
      });
    }
  };

  return (
    <StrengthSummaryView
      programName={programName}
      programId={propProgramId}
      maxLevel={maxLevel}
      isReadOnly={isReadOnly}
      completedExercises={completedExercises}
      analytics={analytics}
      xp={xp}
      progression={progression}
      email={email}
      evaluatedGoals={evaluatedGoals}
      visibleSuggestions={visibleSuggestions}
      onAcceptSuggestion={handleAcceptSuggestion}
      onDismissSuggestion={handleDismissSuggestion}
      showLifestyleCTA={showLifestyleCTA}
      onScheduleLifestyle={handleScheduleLifestyle}
      onDismissLifestyle={handleDismissLifestyle}
      onDelete={onDelete}
      isFinishing={isFinishing}
      onPrimaryAction={handlePrimaryAction}
      v2={v2}
      feedShareSlot={
        showFeedShare ? (
          <SummaryFeedShare
            workout={{
              activityCategory: 'strength',
              durationMinutes: analytics.durationMinutes,
              title: programName,
              // For the "שיתוף לרשתות" image: the exercises this summary
              // shows (no level here — the post gets it at finish).
              ...buildStrengthPostDetails({ phases: v2Phases }),
              // v2 share templates: totals + when (display only).
              ...shareTotalsFromPhases(v2Phases),
              durationSeconds: duration,
              dateMs: Date.now(),
            }}
            onPublish={async (choice) => {
              setFeedShare({ kind: 'publish', choice });
              clearPendingShare();
              return 'queued';
            }}
            onSkip={() => {
              setFeedShare({ kind: 'skip' });
              clearPendingShare();
            }}
          />
        ) : undefined
      }
    />
  );
}

// ============================================================================
// PUBLIC RE-EXPORTS — preserve barrel API after decoupling Steps S-1 … S-9
// ============================================================================
// Helpers, constants, and shared types live in `./utils/summary.utils` but
// consumers of `./index.ts` (and direct importers of this file) expect them
// here.  Re-exporting keeps the public surface 100% backward compatible.

export {
  calculateCalories,
  calculateCoins,
  formatDuration,
  MET_BY_DIFFICULTY,
  COIN_RATIO,
  COIN_BONUS_BY_DIFFICULTY,
};
export type { Difficulty, CompletedExercise, LevelGoalDef };
