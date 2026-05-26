'use client';

import React from 'react';
import HorizontalPicker from './HorizontalPicker';
import ExerciseVideoPlayer from './ExerciseVideoPlayer';

/**
 * InputStateView — Big-Screen INPUT phase.
 *
 * Shown immediately after a set finishes and before the rest timer begins.
 * Renders:
 *   • A frozen background of the just-completed exercise's video
 *   • A bottom sheet anchored above the home-bar with:
 *     – A drag-handle pill
 *     – A bilingual prompt ("כמה חזרות הצלחת?" / "כמה שניות החזקת?")
 *     – Either dual unilateral horizontal pickers OR a single picker
 *     – A cyan "שמירה" confirmation CTA
 *
 * Pure presentational — orchestrator owns the visibility condition
 * (`workoutState === 'INPUT'`) and pipes all picker state via props.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-10).
 */

type PickerUnitType = 'reps' | 'time';

export interface InputPickerConfig {
  targetValue: number;
  unitType: PickerUnitType;
  max: number;
  initialValue: number;
}

export interface InputStateViewProps {
  /** Stable React key forcing remount on segment/exercise/round change. */
  activeKey: string;
  /** Whether the parent's fade-in opacity transition is at 1. */
  fadeIn: boolean;
  /** Resolved video URL of the just-completed exercise (frozen for context). */
  safeVideoUrl: string | null;
  /** Stable id of the active exercise (passed to ExerciseVideoPlayer). */
  exerciseId: string;
  /** Name of the active exercise. */
  exerciseName: string;
  /** Type of the active exercise (`reps` / `time` / etc.). */
  exerciseType: string;
  /** Whether the exercise is unilateral — renders dual right/left pickers. */
  isUnilateralForInput: boolean;
  /** Bilateral picker value. */
  inputRepsValue: number;
  /** Unilateral left-side picker value. */
  inputRepsLeft: number;
  /** Unilateral right-side picker value. */
  inputRepsRight: number;
  /** Bilateral picker setter. */
  onRepsChange: (val: number) => void;
  /** Unilateral left-side picker setter. */
  onRepsLeftChange: (val: number) => void;
  /** Unilateral right-side picker setter. */
  onRepsRightChange: (val: number) => void;
  /** Picker configuration (target, unit, bounds, initial). */
  pickerConfig: InputPickerConfig;
  /** Video-progress callback piped to ExerciseVideoPlayer. */
  onVideoProgress?: (progress: number) => void;
  /** Save CTA → fires the parent's `handleBigScreenInputSave`. */
  onSave: () => void;
}

export default function InputStateView({
  activeKey,
  fadeIn,
  safeVideoUrl,
  exerciseId,
  exerciseName,
  exerciseType,
  isUnilateralForInput,
  inputRepsValue,
  inputRepsLeft,
  inputRepsRight,
  onRepsChange,
  onRepsLeftChange,
  onRepsRightChange,
  pickerConfig,
  onVideoProgress,
  onSave,
}: InputStateViewProps) {
  const { targetValue, unitType, max } = pickerConfig;
  const pickerMin = unitType === 'time' ? 0 : 1;

  return (
    <div
      key={activeKey}
      className={`absolute inset-0 bg-black transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Video background (frozen — exercise is done) */}
      <ExerciseVideoPlayer
        key={`input-player-${activeKey}`}
        exerciseId={exerciseId}
        videoUrl={safeVideoUrl}
        exerciseName={exerciseName}
        exerciseType={exerciseType}
        isPaused
        hasAudio={false}
        onVideoProgress={onVideoProgress}
      />

      {/* Wheel overlay — bottom sheet anchored above safe area */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 bg-white dark:bg-slate-900 rounded-t-[28px] shadow-2xl px-5 pt-4"
        dir="rtl"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 24px))' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Heading — mirrors logDrawerContent wording */}
        <h2
          className="text-base font-bold text-slate-900 dark:text-white text-center mb-0.5"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {unitType === 'time'
            ? isUnilateralForInput ? 'כמה שניות לכל צד?' : 'כמה שניות החזקת?'
            : isUnilateralForInput ? 'כמה חזרות לכל צד?' : 'כמה חזרות הצלחת?'}
        </h2>

        {/* Horizontal ruler picker(s) */}
        {isUnilateralForInput ? (
          <div className="space-y-1">
            {/* Right side */}
            <div>
              <div className="flex items-center gap-1.5 justify-center mb-0.5">
                <span className="text-sm">✋</span>
                <p className="text-sm font-bold text-slate-700 dark:text-zinc-300" style={{ fontFamily: 'var(--font-simpler)' }}>ימין</p>
                <span className="text-xs font-semibold text-[#00B4FF]">
                  {inputRepsRight}{unitType === 'time' ? '"' : ''}
                </span>
              </div>
              <HorizontalPicker
                min={pickerMin}
                max={max}
                targetValue={targetValue}
                value={inputRepsRight}
                onChange={onRepsRightChange}
                unitType={unitType}
              />
            </div>

            <div className="h-px bg-slate-200 dark:bg-zinc-700 mx-6" />

            {/* Left side */}
            <div>
              <div className="flex items-center gap-1.5 justify-center mb-0.5">
                <span className="text-sm" style={{ transform: 'scaleX(-1)' }}>✋</span>
                <p className="text-sm font-bold text-slate-700 dark:text-zinc-300" style={{ fontFamily: 'var(--font-simpler)' }}>שמאל</p>
                <span className="text-xs font-semibold text-[#00B4FF]">
                  {inputRepsLeft}{unitType === 'time' ? '"' : ''}
                </span>
              </div>
              <HorizontalPicker
                min={pickerMin}
                max={max}
                targetValue={targetValue}
                value={inputRepsLeft}
                onChange={onRepsLeftChange}
                unitType={unitType}
              />
            </div>
          </div>
        ) : (
          <HorizontalPicker
            min={pickerMin}
            max={max}
            targetValue={targetValue}
            value={inputRepsValue}
            onChange={onRepsChange}
            unitType={unitType}
          />
        )}

        {/* Confirm button */}
        <button
          type="button"
          onClick={onSave}
          className="w-full mt-3 h-12 rounded-full font-bold text-base text-white shadow-lg active:scale-[0.97] transition-transform"
          style={{
            background: 'linear-gradient(to left, #00C9F2, #00AEEF)',
            fontFamily: 'var(--font-simpler)',
          }}
        >
          שמירה
        </button>
      </div>
    </div>
  );
}
