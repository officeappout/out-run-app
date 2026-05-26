'use client';

import React, { useCallback } from 'react';
import { Target } from 'lucide-react';
import SwapIcon from '@/features/workout-engine/components/SwapIcon';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { PyramidStep } from '../../types';

interface PyramidStepCardProps {
  /** Parent exercise wrapper — provides metric context + fallback name. */
  parentEx: EngineWorkoutExercise;
  /** The pyramid step descriptor we are rendering. */
  step: PyramidStep;
  /** Zero-based index — drives the "סט N" badge and key derivation. */
  stepIdx: number;
  /** Pre-resolved image URL (offline blob fallback already applied by parent). */
  cachedImageUrl: string;
  /** Whether the parent section is a superset (tones down border). */
  isSuperset: boolean;
  /** Whether the parent exercise is the user's primary goal exercise. */
  isGoal: boolean;
  /** Suffix appended for unilateral movements (e.g. " (לכל צד)"). */
  uniLabel: string;
  /** Fallback display name when `step.name` is missing. */
  parentName: string;
  /**
   * Tap-to-open-detail handler.  The handler receives both the parent
   * wrapper AND the specific step so it can synthesise a step-scoped
   * `EngineWorkoutExercise` for the detail drawer.
   */
  onTap?: (parentEx: EngineWorkoutExercise, step: PyramidStep) => void;
  /** Per-step swap handler with twin-sync semantics. */
  onSwapStep?: (parentEx: EngineWorkoutExercise, stepIdx: number) => void;
}

/**
 * One row of a pyramid sequence.
 *
 * Each step is its own self-contained card mirroring the visual layout of
 * `ExerciseCard`.  Wrapped in `React.memo` so unrelated parent re-renders
 * never cascade into the per-step subtree.
 */
function PyramidStepCardImpl({
  parentEx,
  step,
  stepIdx,
  cachedImageUrl,
  isSuperset,
  isGoal,
  uniLabel,
  parentName,
  onTap,
  onSwapStep,
}: PyramidStepCardProps) {
  // ── Display values ────────────────────────────────────────────────────
  // The data layer (`buildStep` in pyramid.processor.ts) is the source of
  // truth: `targetHold` is populated for time-based steps, `targetReps`
  // for rep-based steps.  No re-scaling or keyword detection happens here.
  const stepName = step.name || parentName;
  const stepUnit = step.targetHold !== undefined ? 'שניות' : 'חזרות';
  const stepTarget = step.targetHold ?? step.targetReps;
  const stepVolume = stepTarget != null
    ? `${stepTarget} ${stepUnit}${uniLabel}`
    : `${stepUnit}${uniLabel}`;
  const setLabel = `סט ${stepIdx + 1}`;

  // ── Stable click handlers ─────────────────────────────────────────────
  const handleTap = useCallback(() => {
    onTap?.(parentEx, step);
  }, [onTap, parentEx, step]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') onTap?.(parentEx, step);
  }, [onTap, parentEx, step]);

  const handleSwap = useCallback(() => {
    onSwapStep?.(parentEx, stepIdx);
  }, [onSwapStep, parentEx, stepIdx]);

  return (
    <div
      dir="rtl"
      role="button"
      tabIndex={0}
      onClick={handleTap}
      onKeyDown={handleKeyDown}
      className={`relative w-full bg-white dark:bg-[#1E293B] rounded-lg overflow-hidden border-[0.5px] cursor-pointer active:scale-[0.98] transition-transform h-[70px] ${
        isGoal
          ? 'ring-2 ring-cyan-400 border-cyan-200 dark:border-cyan-800 bg-cyan-50/30 dark:bg-cyan-900/20'
          : isSuperset
            ? 'border-[#E0E9FF]/40 dark:border-slate-800/50 shadow-none'
            : 'border-[#E0E9FF] dark:border-slate-700 shadow-sm'
      }`}
    >
      <div className="flex items-stretch h-full">
        {/* Thumbnail — per-step variant image */}
        <div className="w-[70px] flex-shrink-0 h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={stepName}
            className="w-full h-full object-cover"
            src={cachedImageUrl}
            loading="lazy"
          />
        </div>

        {/*
          Info — variant title + volume stacked vertically on the
          reading-start side, exactly like a standard exercise card.
          Cyan highlight is driven by `step.isSwapped` (per-step) so the
          accent stays scoped to just the altered twin(s), never the
          whole pyramid.
        */}
        <div className="flex-1 min-w-0 flex flex-col justify-center py-1.5 pr-3 pl-1">
          <div className="flex items-center gap-2">
            <span
              className={`font-bold text-[14px] leading-tight truncate ${
                isGoal || step.isSwapped
                  ? 'text-cyan-700 dark:text-cyan-300'
                  : 'text-black dark:text-white'
              }`}
              title={stepName}
            >
              {stepName}
            </span>
            {isGoal && stepIdx === 0 && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-cyan-100 text-cyan-700 text-[10px] font-bold rounded-full border border-cyan-200 flex-shrink-0">
                <Target size={9} />
                יעד
              </span>
            )}
          </div>
          <div className={`text-[13px] font-normal mt-0.5 ${
            isGoal || step.isSwapped
              ? 'text-cyan-600 dark:text-cyan-400'
              : 'text-slate-800 dark:text-slate-300'
          }`}>
            {stepVolume}
          </div>
        </div>

        {/* Reading-end column — minimal set badge over swap icon */}
        <div className="flex flex-col items-center justify-center gap-1 pl-3 pr-1 flex-shrink-0">
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {setLabel}
          </span>
          <SwapIcon
            size={18}
            onClick={handleSwap}
            isSwapped={step.isSwapped === true}
          />
        </div>
      </div>
    </div>
  );
}

const PyramidStepCard = React.memo(PyramidStepCardImpl);
PyramidStepCard.displayName = 'PyramidStepCard';

export default PyramidStepCard;
