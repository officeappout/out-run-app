"use client";

/**
 * StrengthSummaryView — the hook-free presentational half of the strength
 * post-workout summary. StrengthSummaryPage stays the orchestrator (hooks,
 * writes, handlers) and hands everything in here as props, so the view can
 * also render from fixtures (dev preview /debug/design-v2/summary).
 */

import React from 'react';
import { Trophy, Trash2 } from 'lucide-react';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import type { CompletedExercise } from './utils/summary.utils';
import { PersonalRecords } from './components/summary-atoms';
import SummaryStatsRow from './components/SummaryStatsRow';
import GainBreakdownCard from './components/GainBreakdownCard';
import LevelGoalsChecklist, { type LevelGoalsChecklistProps } from './components/LevelGoalsChecklist';
import WeeklyAchievementsGrid from './components/WeeklyAchievementsGrid';
import XpStatusRow from './components/XpStatusRow';
import ExerciseBreakdownCard from './components/ExerciseBreakdownCard';
import LifestyleCTA from './components/LifestyleCTA';
import EmailCaptureDrawer from './components/EmailCaptureDrawer';
import LevelUpModal from './components/LevelUpModal';
import ProgramSuggestionCard, { type ProgramSuggestionCardProps } from './components/ProgramSuggestionCard';
import type { useSummaryAnalytics } from './hooks/useSummaryAnalytics';
import type { useXpAward } from './hooks/useXpAward';
import type { useProgressionSync } from './hooks/useProgressionSync';
import type { useEmailCapture } from './hooks/useEmailCapture';

type Analytics = ReturnType<typeof useSummaryAnalytics>;
type Xp = ReturnType<typeof useXpAward>;

export interface StrengthSummaryViewProps {
  programName: string;
  programId?: string;
  maxLevel: number;
  isReadOnly: boolean;
  completedExercises: CompletedExercise[];
  analytics: Pick<
    Analytics,
    | 'calories'
    | 'formattedDuration'
    | 'streak'
    | 'streakFlameType'
    | 'liveLevel'
    | 'livePercent'
    | 'weeklyStrengthSessions'
    | 'weeklyGoalSessions'
    | 'coins'
    | 'daysWithActivity'
    | 'weeklyMinutes'
    | 'groupedExercises'
  >;
  xp: Pick<Xp, 'xpStatus' | 'xpEarnedAmount' | 'xpControls' | 'streakChainReady' | 'runAwardXP'>;
  progression: ReturnType<typeof useProgressionSync>;
  email: ReturnType<typeof useEmailCapture>;
  evaluatedGoals: LevelGoalsChecklistProps['evaluatedGoals'];
  visibleSuggestions: ProgramSuggestionCardProps['suggestions'];
  onAcceptSuggestion: ProgramSuggestionCardProps['onAccept'];
  onDismissSuggestion: ProgramSuggestionCardProps['onDismiss'];
  showLifestyleCTA: boolean;
  onScheduleLifestyle: () => void;
  onDismissLifestyle: () => void;
  /** History view only — see StrengthSummaryPageProps.onDelete. */
  onDelete?: () => void;
  /** True while the live-flow finish is in flight (double-tap guard). */
  isFinishing: boolean;
  /** Footer primary: close (read-only) or finish (live). Owned by the page. */
  onPrimaryAction: () => void;
}

export default function StrengthSummaryView({
  programName,
  programId,
  maxLevel,
  isReadOnly,
  completedExercises,
  analytics,
  xp,
  progression,
  email,
  evaluatedGoals,
  visibleSuggestions,
  onAcceptSuggestion,
  onDismissSuggestion,
  showLifestyleCTA,
  onScheduleLifestyle,
  onDismissLifestyle,
  onDelete,
  isFinishing,
  onPrimaryAction,
}: StrengthSummaryViewProps) {
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

        {/* Program-level progression display — hidden in isReadOnly mode.
            None of currentLevel/maxLevel/progressToNextLevel/levelGoals are
            ever persisted on a saved workout doc (confirmed — no real
            writer sets them), so rendering these with the component's
            static defaults would show fabricated progress for an old
            workout instead of nothing. Gated explicitly here rather than
            relying on GainBreakdownCard/LevelGoalsChecklist's own internal
            "no data" guards, so the hide is robust regardless of how those
            guards evolve. */}
        {!isReadOnly && (
          <ProgramProgressCard
            programName={programName ?? 'תוכנית אימון'}
            iconKey={programId ?? ''}
            currentLevel={analytics.liveLevel}
            maxLevel={maxLevel ?? 25}
            progressPercent={analytics.livePercent ?? 0}
            className="!max-w-none"
          />
        )}

        {!isReadOnly && (
          <GainBreakdownCard
            progressionResult={progression.progressionResult}
            weeklyStrengthSessions={analytics.weeklyStrengthSessions}
            weeklyGoalSessions={analytics.weeklyGoalSessions}
          />
        )}

        <ProgramSuggestionCard
          suggestions={visibleSuggestions}
          onAccept={onAcceptSuggestion}
          onDismiss={onDismissSuggestion}
        />

        {!isReadOnly && <LevelGoalsChecklist evaluatedGoals={evaluatedGoals} />}

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
        <LifestyleCTA onSchedule={onScheduleLifestyle} onDismiss={onDismissLifestyle} />
      )}

      {/* Footer button — pinned outside scroll */}
      <div
        className="shrink-0 z-[100] relative p-5 bg-white dark:bg-card-dark flex gap-3"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        {/* Delete trigger — isReadOnly history view only, and only when the
            caller wired an onDelete (WORKOUT_DELETE_EXPANDED_ENABLED at the
            call site). This component doesn't own the confirm/delete flow —
            tapping just calls the caller's onDelete(), same contract as
            FreeRunSummary's onDelete prop. */}
        {isReadOnly && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="מחק אימון"
            className="px-5 py-4 rounded-2xl font-bold bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 transition-all shadow-sm flex items-center justify-center"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        <button
          onClick={onPrimaryAction}
          disabled={!isReadOnly && isFinishing}
          className="flex-1 bg-primary py-4 rounded-2xl text-white font-extrabold text-xl shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isReadOnly ? 'סגור' : isFinishing ? 'שומר...' : 'תודה על האימון!'}
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
