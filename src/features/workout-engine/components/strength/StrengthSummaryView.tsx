"use client";

/**
 * StrengthSummaryView — the hook-free presentational half of the strength
 * post-workout summary. StrengthSummaryPage stays the orchestrator (hooks,
 * writes, handlers) and hands everything in here as props, so the view can
 * also render from fixtures (dev preview /debug/design-v2/summary).
 */

import React from 'react';
import { Trophy, Trash2, Flame, Layers, Flag } from 'lucide-react';
import AnimatedFlame from '@/components/ui/AnimatedFlame';
import { Button, Card, CardTile, IconTile, StatNumber } from '@/components/ui/v2';
import LevelRingCard from './components/LevelRingCard';
import { shouldShowLevelRing } from './utils/level-ring-visibility';
import type { CompletedExercise } from './utils/summary.utils';
import { PersonalRecords } from './components/summary-atoms';
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
import {
  SummaryHeroV2,
  StreakCardV2,
  ProgramCardV2,
  ImprovementsCardV2,
  PhaseBreakdownV2,
  type WeekCardV2Props,
} from './components/v2/StrengthSummaryV2Sections';
import TimedResultCardsV2 from './components/v2/TimedResultCardsV2';
import type { TimedBlockRecord } from '@/features/workout-engine/engines/timed/timed-record';
import type { PhaseSummary, SessionTotals } from './utils/phase-summary';
import { levelRingModel } from './utils/level-ring.util';
import { programRingModel, type ProgramProgressItem, type WeekDot } from '@/components/ui/v2';
import ReportProblemButton from '@/features/generation-review/components/ReportProblemButton';
import { useT } from '@/hooks/useT';
import { player, type PlayerT } from '@/messages/ns/player';

/** Home-v2 (enable_home_v2) data. Absent ⇒ today's summary, unchanged. */
export interface StrengthSummaryV2Data {
  phases: PhaseSummary[];
  /** Timed blocks (AMRAP score, EMOM minutes): this session's, or the saved doc's `timedBlocks`. */
  timedResults?: TimedBlockRecord[];
  totals: SessionTotals;
  /** Null in the read-only history view (the week card describes "now", not that past workout). */
  week: WeekCardV2Props | null;
  /** This week's streak dots + best streak (activity store). Null in the read-only history view. */
  streakWeek?: { days: WeekDot[]; best: number } | null;
}

/**
 * The v2 "התקדמות בתוכניות שלי" row from the real program level: the ring is
 * % inside the level, and today's gain (progressionResult) is the green arc.
 * Without a progression result (e.g. it failed) the ring shows no gain.
 */
export function strengthProgramItem(t: PlayerT, args: {
  programName: string;
  programId?: string;
  liveLevel: number;
  livePercent: number;
  maxLevel: number;
  progressionResult: ReturnType<typeof useProgressionSync>['progressionResult'];
}): ProgramProgressItem {
  const m = levelRingModel(t, args.liveLevel, args.maxLevel, args.livePercent);
  const gain = args.progressionResult?.success ? args.progressionResult.activeProgramGain : null;
  return {
    key: args.programId ?? 'program',
    name: args.programName,
    levelLabel: m.levelLabel,
    nextLabel: m.nextLabel,
    ring: programRingModel(m.percent, gain?.totalGain ?? 0, !!gain?.leveledUp),
    gain: gain?.totalGain ?? 0,
  };
}

type Analytics = ReturnType<typeof useSummaryAnalytics>;
type Xp = ReturnType<typeof useXpAward>;

export interface StrengthSummaryViewProps {
  programName: string;
  /** Kept for the container contract (ProgramProgressCard icon key); the v2 level ring doesn't use it. */
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
  /** enable_home_v2 only — see StrengthSummaryV2Data. */
  v2?: StrengthSummaryV2Data;
  /** enable_home_v2 only — the "לשתף את האימון בפיד?" card (owned by the page). */
  feedShareSlot?: React.ReactNode;
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
  v2,
  feedShareSlot,
}: StrengthSummaryViewProps) {
  const t = useT(player);
  // Secondary stat derived from data the screen already shows (exercise breakdown).
  const totalSets = completedExercises.reduce((acc, ex) => acc + (ex.sets?.length ?? 0), 0);

  return (
    <div
      className="fixed inset-0 z-[100] w-full h-full bg-v2-surface dark:bg-card-dark flex flex-col overflow-hidden"
      dir="rtl"
    >
      {/* Sticky Summary Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 bg-white dark:bg-card-dark border-b border-v2-hairline dark:border-slate-800"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
      >
        <IconTile icon={Trophy} tone="accent" size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-extrabold text-v2-deep mb-0.5">{t('strengthSummary.header.title')}</p>
          <h1 className="text-[20px] font-black !tracking-v2-tight text-v2-ink dark:text-white line-clamp-3 break-words leading-snug">
            {programName}
          </h1>
        </div>
      </div>

      {/* Scrollable content */}
      {v2 ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
          {/* Approved A-6c order: hero → streak → programs → improvement →
              exercise breakdown. No XP display and no "פירוט התקדמות" in v2
              (the XP award itself still runs in useXpAward). */}
          <SummaryHeroV2
            formattedDuration={analytics.formattedDuration}
            calories={analytics.calories}
            totals={v2.totals}
            phases={v2.phases}
          />

          {v2.timedResults && v2.timedResults.length > 0 && <TimedResultCardsV2 results={v2.timedResults} />}

          {feedShareSlot}

          {!isReadOnly && (
            <ReportProblemButton types={['home_strength', 'kelly_workout']} wrapperClassName="flex justify-center" />
          )}

          {v2.streakWeek && (
            <StreakCardV2
              streak={analytics.streak}
              best={Math.max(v2.streakWeek.best, analytics.streak)}
              days={v2.streakWeek.days}
              week={v2.week}
            />
          )}

          {shouldShowLevelRing({ isReadOnly, progressionResult: progression.progressionResult }) && (
            <ProgramCardV2
              item={strengthProgramItem(t, {
                programName: programName ?? t('strengthSummary.programFallback'),
                programId,
                liveLevel: analytics.liveLevel,
                livePercent: analytics.livePercent ?? 0,
                maxLevel: maxLevel ?? 25,
                progressionResult: progression.progressionResult,
              })}
            />
          )}

          <ImprovementsCardV2 phases={v2.phases} />

          <ProgramSuggestionCard
            suggestions={visibleSuggestions}
            onAccept={onAcceptSuggestion}
            onDismiss={onDismissSuggestion}
          />

          {!isReadOnly && <LevelGoalsChecklist evaluatedGoals={evaluatedGoals} />}

          <h2 className="px-1 pt-2 text-[17px] font-black text-v2-ink">{t('strengthSummary.exercisesTitle')}</h2>
          <PhaseBreakdownV2 phases={v2.phases} />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
        {/* Hero — duration is this session's headline number; calories / sets
            / streak are the secondary stats (same data SummaryStatsRow showed,
            plus the set count from the exercise breakdown below). */}
        <Card padding="lg">
          <StatNumber
            value={0}
            format={() => analytics.formattedDuration}
            size="hero"
            label="זמן אימון" // i18n-allow-hebrew: legacy v1 (enable_home_v2 on)
          />
          <div className="mt-4 grid grid-cols-3 gap-2">
            <CardTile className="px-3 py-3">
              <IconTile icon={Flame} tone="accent" size="sm" className="mb-2" />
              <StatNumber value={analytics.calories} size="sm" label="קלוריות" /* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */ />
            </CardTile>
            <CardTile className="px-3 py-3">
              <IconTile icon={Layers} tone="accent" size="sm" className="mb-2" />
              <StatNumber value={totalSets} size="sm" label="סטים" /* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */ />
            </CardTile>
            <CardTile className="px-3 py-3">
              {/* Dopamine chain step 3: the static flag swaps for the animated
                  flame once the XP pulse settles (streakChainReady). */}
              <span className="mb-2 flex h-8 items-center">
                {xp.streakChainReady ? (
                  <AnimatedFlame activityType={analytics.streakFlameType} previousType="none" />
                ) : (
                  <IconTile icon={Flag} tone="accent" size="sm" />
                )}
              </span>
              <StatNumber value={analytics.streak} size="sm" label="אימונים ברצף" /* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */ />
            </CardTile>
          </div>
        </Card>

        {/* Program-level progression display — hidden in isReadOnly mode.
            None of currentLevel/maxLevel/progressToNextLevel/levelGoals are
            ever persisted on a saved workout doc (confirmed — no real
            writer sets them), so rendering these with the component's
            static defaults would show fabricated progress for an old
            workout instead of nothing. Gated explicitly here rather than
            relying on GainBreakdownCard/LevelGoalsChecklist's own internal
            "no data" guards, so the hide is robust regardless of how those
            guards evolve.
            G8.2: also hidden when progression was skipped because the user has
            no strength questionnaire (enable_no_auto_strength_level) — the ring
            would otherwise show a made-up fallback level. */}
        {shouldShowLevelRing({ isReadOnly, progressionResult: progression.progressionResult }) && (
          <LevelRingCard
            programName={programName ?? t('strengthSummary.programFallback')}
            currentLevel={analytics.liveLevel}
            maxLevel={maxLevel ?? 25}
            progressPercent={analytics.livePercent ?? 0}
          />
        )}

        {/* G8.2: the gain card follows the ring — hidden when progression was skipped for a user
            with no questionnaire (it would show "+0.0%"). Flag OFF never skips → unchanged. */}
        {shouldShowLevelRing({ isReadOnly, progressionResult: progression.progressionResult }) && (
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
      )}

      {showLifestyleCTA && (
        <LifestyleCTA onSchedule={onScheduleLifestyle} onDismiss={onDismissLifestyle} />
      )}

      {/* Footer button — pinned outside scroll */}
      <div
        className="shrink-0 z-[100] relative px-4 pt-3 bg-white dark:bg-card-dark border-t border-v2-hairline flex gap-2.5"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {/* Delete trigger — isReadOnly history view only, and only when the
            caller wired an onDelete (WORKOUT_DELETE_EXPANDED_ENABLED at the
            call site). This component doesn't own the confirm/delete flow —
            tapping just calls the caller's onDelete(), same contract as
            AerobicSummaryView's / HybridSummary's onDelete prop. */}
        {isReadOnly && onDelete && (
          <Button
            variant="ghost"
            size="lg"
            onClick={onDelete}
            aria-label={t('strengthSummary.footer.deleteAria')}
            className="!px-5 !text-v2-down"
          >
            <Trash2 size={20} strokeWidth={2.4} aria-hidden />
          </Button>
        )}
        <Button
          variant="primary"
          size="lg"
          onClick={onPrimaryAction}
          disabled={!isReadOnly && isFinishing}
          className="flex-1"
        >
          {isReadOnly
            ? t('strengthSummary.footer.close')
            : isFinishing
              ? t('strengthSummary.footer.saving')
              : t('strengthSummary.footer.thanks')}
        </Button>
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
