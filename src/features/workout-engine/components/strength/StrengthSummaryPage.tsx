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

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';

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

// ── Atoms (S-1) ──
import { PersonalRecords } from './components/summary-atoms';

// ── Sub-view components (S-8) ──
import SummaryStatsRow from './components/SummaryStatsRow';
import GainBreakdownCard from './components/GainBreakdownCard';
import LevelGoalsChecklist from './components/LevelGoalsChecklist';
import WeeklyAchievementsGrid from './components/WeeklyAchievementsGrid';
import XpStatusRow from './components/XpStatusRow';
import ExerciseBreakdownCard from './components/ExerciseBreakdownCard';
import LifestyleCTA from './components/LifestyleCTA';
import EmailCaptureDrawer from './components/EmailCaptureDrawer';
import LevelUpModal from './components/LevelUpModal';
import ProgramSuggestionCard from './components/ProgramSuggestionCard';

// ── Hooks (S-2 … S-7) ──
import { useSummaryAnalytics } from './hooks/useSummaryAnalytics';
import { useGoalEvaluation } from './hooks/useGoalEvaluation';
import { useEmailCapture } from './hooks/useEmailCapture';
import { useXpAward } from './hooks/useXpAward';
import { useActivitySync } from './hooks/useActivitySync';
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
   */
  onFinish: (xpData: { xpEarned: number; xpStatus: 'pending' | 'awarded' | 'failed' }) => void;

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
}: StrengthSummaryPageProps) {
  // ── User profile (for lifestyle CTA gate) ──
  const { profile } = useUserStore();
  const router = useRouter();

  // ── Program suggestions (Level Equivalence, mode:'suggest') ──
  // Dismissal is local-only (component state, no Firestore write) — a
  // dismissed suggestion simply reappears next time this screen reads
  // pendingProgramSuggestions from the profile, per the product decision
  // that "dismiss" defers rather than resolves.
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(new Set());
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
  //   5. useActivitySync       — consumes calories/coins/durationMinutes
  //   6. useXpAward            — consumes durationMinutes; fires AFTER
  //                              useActivitySync so the activity store's
  //                              currentStreak is updated before the CF call
  // ──────────────────────────────────────────────────────────────────────

  const email = useEmailCapture();

  const progression = useProgressionSync({
    programId: propProgramId,
    currentLevel,
    completedExercises,
    rawExerciseLog,
    durationMinutes: Math.max(1, Math.round(duration / 60)),
    precomputedProgression,
    isRecovery,
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

  useActivitySync({
    trainingType,
    durationMinutes: analytics.durationMinutes,
    calories: analytics.calories,
    coins: analytics.coins,
    programName,
    programId: propProgramId,
    rawExerciseLog,
    completedExercises,
    totalPlannedSets,
    difficulty,
    difficultyBolts,
    isRecovery,
    domainSets,
  });

  const xp = useXpAward({
    difficulty,
    difficultyBolts,
    durationMinutes: analytics.durationMinutes,
    totalReps,
    completedExercises,
    isRecovery,
  });

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

  return (
    <div
      className="fixed inset-0 z-[100] w-full h-full bg-slate-50 dark:bg-card-dark flex flex-col overflow-hidden"
      dir="rtl"
    >
      {/* Sticky Summary Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 bg-white dark:bg-card-dark border-b border-slate-100 dark:border-slate-800"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
      >
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm flex-shrink-0">
          <Trophy className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-0.5">סיכום אימון</p>
          <h1 className="text-xl font-black text-slate-900 dark:text-white line-clamp-3 break-words leading-snug">
            {programName}
          </h1>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
        <SummaryStatsRow
          calories={analytics.calories}
          formattedDuration={analytics.formattedDuration}
          streak={analytics.streak}
          streakFlameType={analytics.streakFlameType}
          streakChainReady={xp.streakChainReady}
        />

        <ProgramProgressCard
          programName={programName ?? 'תוכנית אימון'}
          iconKey={propProgramId ?? ''}
          currentLevel={analytics.liveLevel}
          maxLevel={maxLevel ?? 25}
          progressPercent={analytics.livePercent ?? 0}
          className="!max-w-none"
        />

        <GainBreakdownCard
          progressionResult={progression.progressionResult}
          weeklyStrengthSessions={analytics.weeklyStrengthSessions}
          weeklyGoalSessions={analytics.weeklyGoalSessions}
        />

        <ProgramSuggestionCard
          suggestions={visibleSuggestions}
          onAccept={handleAcceptSuggestion}
          onDismiss={handleDismissSuggestion}
        />

        <LevelGoalsChecklist evaluatedGoals={evaluatedGoals} />

        <PersonalRecords exercises={completedExercises} />

        <WeeklyAchievementsGrid
          coins={analytics.coins}
          weeklyStrengthSessions={analytics.weeklyStrengthSessions}
          weeklyGoalSessions={analytics.weeklyGoalSessions}
          daysWithActivity={analytics.daysWithActivity}
          weeklyMinutes={analytics.weeklyMinutes}
          xpStatusSlot={
            <XpStatusRow
              xpStatus={xp.xpStatus}
              xpEarnedAmount={xp.xpEarnedAmount}
              xpControls={xp.xpControls}
              onRetry={xp.runAwardXP}
            />
          }
        />

        <ExerciseBreakdownCard
          groupedExercises={analytics.groupedExercises}
          completedExercises={completedExercises}
        />
      </div>

      {showLifestyleCTA && (
        <LifestyleCTA onSchedule={handleScheduleLifestyle} onDismiss={handleDismissLifestyle} />
      )}

      {/* Footer button — pinned outside scroll */}
      <div
        className="shrink-0 z-[100] relative p-5 bg-white dark:bg-card-dark"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => onFinish({ xpEarned: xp.xpEarnedAmount, xpStatus: xp.xpStatus })}
          className="w-full bg-primary py-4 rounded-2xl text-white font-extrabold text-xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-all"
        >
          תודה על האימון!
        </button>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
      `}</style>

      {/* Global overlays */}
      <EmailCaptureDrawer
        isOpen={email.showEmailDrawer}
        showInlineAccount={email.showInlineAccount}
        onShowInlineAccount={() => email.setShowInlineAccount(true)}
        onCapture={email.handleEmailCaptured}
        onDismiss={email.dismissEmailDrawer}
      />

      <LevelUpModal
        isOpen={progression.showLevelUpModal && !!progression.progressionResult?.activeProgramGain.leveledUp}
        programName={programName}
        newLevel={progression.progressionResult?.activeProgramGain.newLevel}
        onClose={() => progression.setShowLevelUpModal(false)}
      />
    </div>
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
