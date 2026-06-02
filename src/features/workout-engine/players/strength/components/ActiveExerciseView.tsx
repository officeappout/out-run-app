'use client';

import React from 'react';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';
import FillingButton from './FillingButton';
import IsometricTimerCard from './IsometricTimerCard';
import ExerciseDetailContent from './ExerciseDetailContent';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';

/**
 * ActiveExerciseView — the live ACTIVE-phase player surface.
 *
 * Composes:
 *   • Full-screen ExerciseVideoPlayer (background)
 *   • Hidden <video preload="auto"> pre-fetch for the next exercise
 *   • IsometricTimerCard bottom sheet (for `time` exercises only)
 *   • Scrollable lyrics overlay (for rep-based exercises only):
 *     – central metric block (range + target)
 *     – pyramid step counter + upcoming-steps mini preview
 *     – exercise name
 *     – superset badge + cycle counter
 *     – primary CTA (FillingButton "סיימתי")
 *     – swap-exercise button
 *     – ExerciseDetailContent (cues, muscles, goal, equipment)
 *
 * Pure presentational — orchestrator owns:
 *   – state-machine routing (`workoutState === 'ACTIVE'`)
 *   – the activeKey derivation
 *   – the isTimeExercise decision (`exerciseType === 'time' && !isFollowAlongMode`)
 *   – every callback (onComplete, onSwap, onSetVideoProgress)
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-12).
 */

export interface ActiveExerciseMuscleGroups {
  primary: string[];
  secondary: string[];
}

export interface ActiveExerciseViewProps {
  /** Stable React key forcing remount on segment/exercise/round change. */
  activeKey: string;
  /** Whether the parent's fade-in opacity transition is at 1. */
  fadeIn: boolean;
  /** Whether the workout is currently paused (gates video + filling button). */
  isPaused: boolean;
  /** Resolved (offline-cached) video URL for the active exercise. */
  safeVideoUrl: string | null;
  /** Resolved (offline-cached) video URL for the next exercise — used as a hidden pre-fetch. */
  cachedNextVideoUrl: string | null;
  /** Stable id of the active exercise (used by ExerciseVideoPlayer + remount keys). */
  exerciseId: string;
  /** Name of the active exercise (drives the title under the metrics). */
  exerciseName: string;
  /** Type of the active exercise (`reps` / `time` / etc.). */
  exerciseType: string;
  /** Whether the active exercise should run as a time-based isometric (drives IsometricTimerCard vs scrollable card). */
  isTimeExercise: boolean;
  /** Duration in seconds for time-based exercises (`IsometricTimerCard.duration`). */
  exerciseDuration: number;
  /** Active side for unilateral exercises ("left" / "right" / null) — drives timer remount + side label. */
  currentSide: 'left' | 'right' | null;
  /** Range display text ("6-8 חזרות" / "30 שניות"). */
  repsOrDurationText: string;
  /** Smart-target picker value (cyan "(יעד: N)" pill). */
  targetValue: number;
  /** Whether the exercise is unilateral (suffixes "(לכל צד)" to the range text). */
  isUnilateral: boolean;
  /** Whether the active exercise is currently inside a pyramid sequence. */
  isPyramidActive: boolean;
  /** 1-based current round (also drives the pyramid "שלב N מתוך M" counter). */
  currentRound: number;
  /** Total rounds for the active exercise. */
  totalRounds: number;
  /** Remaining pyramid steps after the current round (preview row). */
  upcomingPyramidSteps: PyramidStep[];
  /** Whether the player is currently inside a superset block (drives badge). */
  isSupersetActive: boolean;
  /** Name of the superset partner exercise (shown next to the badge). */
  supersetPartnerName: string | null;
  /** Autocomplete duration for the FillingButton CTA (null disables the auto-fill animation). */
  autoCompleteTime: number;
  /** Execution-step cues piped to ExerciseDetailContent. */
  executionSteps: string[];
  /** Muscle groups (primary + secondary) piped to ExerciseDetailContent. */
  muscleGroups: ActiveExerciseMuscleGroups;
  /** Exercise goal text piped to ExerciseDetailContent. */
  exerciseGoal: string | null;
  /** Equipment id(s) of the active exercise piped to ExerciseDetailContent. */
  equipment?: string | string[];
  /** Workout location piped to ExerciseDetailContent (drives equipment SVG resolution). */
  workoutLocation?: string;
  /** External scroll-container ref (so the orchestrator can drive programmatic scrolls if needed). */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Primary completion action — fires from FillingButton click or video-ended. */
  onComplete: (elapsed?: number) => void;
  /** Optional swap-exercise action (renders the "החלפת תרגיל" CTA only when defined). */
  onSwap?: () => void;
  /** Video-progress callback piped to ExerciseVideoPlayer. */
  onSetVideoProgress?: (progress: number) => void;
}

export default function ActiveExerciseView({
  activeKey,
  fadeIn,
  isPaused,
  safeVideoUrl,
  cachedNextVideoUrl,
  exerciseId,
  exerciseName,
  exerciseType,
  isTimeExercise,
  exerciseDuration,
  currentSide,
  repsOrDurationText,
  targetValue,
  isUnilateral,
  isPyramidActive,
  currentRound,
  totalRounds,
  upcomingPyramidSteps,
  isSupersetActive,
  supersetPartnerName,
  autoCompleteTime,
  executionSteps,
  muscleGroups,
  exerciseGoal,
  equipment,
  workoutLocation,
  scrollRef,
  onComplete,
  onSwap,
  onSetVideoProgress,
}: ActiveExerciseViewProps) {
  return (
    <div
      key={activeKey}
      className={`absolute inset-0 bg-black transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Video background layer */}
      <ExerciseVideoPlayer
        key={`player-${activeKey}`}
        exerciseId={exerciseId}
        videoUrl={safeVideoUrl}
        exerciseName={exerciseName}
        exerciseType={exerciseType}
        isPaused={isPaused}
        hasAudio={false}
        onVideoProgress={onSetVideoProgress}
        onVideoEnded={isTimeExercise ? undefined : () => onComplete()}
      />

      {/* Pre-fetch next exercise video (uses cached blob when offline) */}
      {cachedNextVideoUrl && (
        <video src={cachedNextVideoUrl} preload="auto" className="hidden" muted playsInline {...{"webkit-playsinline": "true"}} />
      )}

      {/* Isometric timer drawer — bottom sheet for time-based exercises */}
      {isTimeExercise && (
        <IsometricTimerCard
          key={`timer-${currentSide || 'bilateral'}`}
          duration={exerciseDuration > 0 ? exerciseDuration : 30}
          exerciseName={exerciseName}
          repsOrDurationText={repsOrDurationText}
          onComplete={(elapsed) => onComplete(elapsed)}
          side={currentSide}
        />
      )}

      {/* Scrollable overlay — spacer lets video show, then the white card peeks up */}
      {!isTimeExercise && (
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overscroll-contain z-10"
        >
          {/* Spacer — pushes card to bottom; maximises visible video */}
          <div className="pointer-events-none" style={{ height: 'calc(100dvh - 180px)' }} />

          {/* Card — compact, content-hugging */}
          <div
            className="relative bg-white dark:bg-slate-950 rounded-t-[28px] shadow-2xl px-5 pt-2"
            dir="rtl"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
          >
            {/* Scroll hint — drag handle */}
            <div className="flex justify-center mb-1.5">
              <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>

            {/* ── Central Metrics: Range (XL Black) + Target (Blue) ────── */}
            {repsOrDurationText && (
              <div className="flex items-baseline justify-center gap-2 mb-0.5">
                <span
                  className="text-4xl font-black"
                  style={{ fontFamily: 'var(--font-simpler)', color: '#000000' }}
                >
                  {repsOrDurationText}{isUnilateral ? ' (לכל צד)' : ''}
                </span>
                {targetValue > 0 && (
                  <span
                    className="text-sm font-bold"
                    style={{ fontFamily: 'var(--font-simpler)', color: '#00B4FF' }}
                  >
                    (יעד: {targetValue})
                  </span>
                )}
              </div>
            )}

            {/* ── Pyramid step indicator ───────────────────────────────── */}
            {isPyramidActive && (
              <div className="flex flex-col items-center gap-0.5 mb-1" dir="rtl">
                {/* Step counter — same visual register as superset "סבב N מתוך M" */}
                <span
                  className="text-[11px] font-bold text-[#00BAF7] uppercase tracking-wider"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  שלב {currentRound} מתוך {totalRounds}
                </span>

                {/* Upcoming steps mini-preview */}
                {upcomingPyramidSteps.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap justify-center">
                    {upcomingPyramidSteps.map((step, idx) => {
                      const val = step.targetHold ?? step.targetReps;
                      const unit = step.targetHold != null ? 'שנ׳' : 'חז׳';
                      return (
                        <span
                          key={idx}
                          className="text-[10px] text-slate-400 dark:text-slate-500"
                          style={{ fontFamily: 'var(--font-simpler)' }}
                        >
                          {idx === 0 ? '▸' : '→'} {val} {unit}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Exercise name — secondary, below the metrics */}
            <p
              className="text-base font-semibold text-slate-900 dark:text-white text-center mb-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {exerciseName}
            </p>

            {/* Superset badge + round counter */}
            {isSupersetActive && supersetPartnerName && (
              <div className="flex flex-col items-center gap-1 mb-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-50 border border-violet-200 dark:bg-violet-950/60 dark:border-violet-700 rounded-full">
                  <span className="text-[10px] font-bold text-violet-600 dark:text-violet-300 uppercase tracking-wider" style={{ fontFamily: 'var(--font-simpler)' }}>
                    סופרסט
                  </span>
                  <span className="text-[10px] text-violet-400" style={{ fontFamily: 'var(--font-simpler)' }}>
                    × {supersetPartnerName}
                  </span>
                </div>
                {totalRounds > 1 && (
                  <span
                    className="text-[11px] font-semibold text-violet-500 dark:text-violet-400"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    סבב {currentRound} מתוך {totalRounds}
                  </span>
                )}
              </div>
            )}

            {/* Primary CTA */}
            <div className="mb-2">
              <FillingButton
                key={`fill-${activeKey}`}
                autoCompleteTime={autoCompleteTime}
                onClick={() => onComplete()}
                label="סיימתי"
                isPaused={isPaused}
              />
            </div>

            {/* Swap button — tight below CTA */}
            {onSwap && (
              <div className="flex justify-center mb-1">
                <button
                  onClick={onSwap}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 active:scale-[0.97] transition-transform"
                >
                  <img src="/assets/icons/ui/swap.svg" className="w-4 h-4 dark:invert" alt="Swap" />
                  <span
                    className="text-sm font-bold text-slate-600 dark:text-slate-300"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    החלפת תרגיל
                  </span>
                </button>
              </div>
            )}

            {/* ── Below the fold — unified ExerciseDetailContent ────────── */}
            <div className="-mx-5 mt-4">
              <ExerciseDetailContent
                exerciseName={exerciseName}
                videoUrl={null}
                hideHeroVideo
                hideTitle
                primaryMuscle={muscleGroups.primary[0] || null}
                secondaryMuscles={muscleGroups.secondary.length > 0 ? muscleGroups.secondary : undefined}
                cues={executionSteps.length > 0 ? executionSteps : undefined}
                goal={exerciseGoal}
                equipment={equipment}
                workoutLocation={workoutLocation}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
