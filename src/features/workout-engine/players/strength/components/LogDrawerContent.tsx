'use client';

import React from 'react';
import HorizontalPicker from './HorizontalPicker';

/**
 * LogDrawerContent — bottom-sheet RESTING-state input drawer.
 *
 * Rendered inside RestWithPreview as the `logDrawerNode` slot.  Displays:
 *   • A localized prompt ("how many reps / seconds?")
 *   • A loading spinner during the 280 ms drawer-stability gate
 *   • Either a dual unilateral picker (right / left) OR a single picker
 *   • A save-and-rest CTA that fires coach-hint detection then triggers save
 *   • An optional swap-exercise CTA (only when the parent provides onSwap)
 *
 * Pure presentational component — no state, no refs, no state-machine awareness.
 * All interaction wiring is piped through typed props from the parent.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-5).
 */

type PickerUnitType = 'reps' | 'time';
type CoachHint = 'fail' | 'overachieve' | null;

export interface LogDrawerPickerConfig {
  targetValue: number;
  unitType: PickerUnitType;
  max: number;
  initialValue: number;
}

export interface LogDrawerContentProps {
  /** Whether the drawer animation has settled (~280 ms gate). */
  isDrawerStable: boolean;
  /** Whether the active exercise is unilateral (renders dual right/left pickers). */
  isUnilateral: boolean;
  /** Picker configuration (target, unit type, bounds). */
  pickerConfig: LogDrawerPickerConfig;
  /** Ref carrying the "locked" timer/autocomplete value to seed the single picker. */
  lockedAchievedRef: React.MutableRefObject<number | null>;
  /** Live "achieved" value from the state machine for the in-flight set. */
  completedReps: number | null;
  /** Unilateral right-side picker value. */
  repsRight: number;
  /** Unilateral left-side picker value. */
  repsLeft: number;
  /** Setter for right-side picker. */
  onRepsRightChange: (val: number) => void;
  /** Setter for left-side picker. */
  onRepsLeftChange: (val: number) => void;
  /** Single-picker live change handler (writes to state-machine completedReps). */
  onPickerChange: (val: number) => void;
  /** Lower bound of the prescribed rep range (null = no lower bound enforced). */
  repsRangeMin: number | null;
  /** Upper bound of the prescribed rep range (null = no upper bound enforced). */
  repsRangeMax: number | null;
  /** Save-and-rest action for bilateral exercises (parent owns rep resolution). */
  onSaveBilateral: () => void;
  /** Save-and-rest action for unilateral exercises (parent owns rep resolution). */
  onSaveUnilateral: () => void;
  /** Coach-hint setter — fired with 'fail' / 'overachieve' / null based on range comparison. */
  onSetCoachHint: (hint: CoachHint) => void;
  /** Optional swap-exercise CTA (omit to hide the secondary button). */
  onSwap?: () => void;
}

export default function LogDrawerContent({
  isDrawerStable,
  isUnilateral,
  pickerConfig,
  lockedAchievedRef,
  completedReps,
  repsRight,
  repsLeft,
  onRepsRightChange,
  onRepsLeftChange,
  onPickerChange,
  repsRangeMin,
  repsRangeMax,
  onSaveBilateral,
  onSaveUnilateral,
  onSetCoachHint,
  onSwap,
}: LogDrawerContentProps) {
  const { targetValue, unitType, max, initialValue } = pickerConfig;
  const pickerMin = unitType === 'time' ? 0 : 1;

  // Save handlers — coach-hint detection lives here so the component owns its
  // own UX feedback loop, but the actual save mutation is delegated to the parent.
  const handleUnilateralClick = () => {
    const effective = Math.min(repsRight, repsLeft);
    if (unitType === 'reps') {
      if (repsRangeMin !== null && effective < repsRangeMin) onSetCoachHint('fail');
      else if (repsRangeMax !== null && effective > repsRangeMax) onSetCoachHint('overachieve');
      else onSetCoachHint(null);
    }
    onSaveUnilateral();
  };

  const handleBilateralClick = () => {
    const repsToSave =
      completedReps ?? lockedAchievedRef.current ?? initialValue ?? targetValue;
    if (!repsToSave || repsToSave <= 0) {
      onSaveBilateral();
      return;
    }
    if (repsRangeMin !== null && repsToSave < repsRangeMin) onSetCoachHint('fail');
    else if (repsRangeMax !== null && repsToSave > repsRangeMax) onSetCoachHint('overachieve');
    else onSetCoachHint(null);
    onSaveBilateral();
  };

  return (
    <div
      className="bg-white dark:bg-[#0F172A] rounded-t-[24px] px-4 pt-2.5 shadow-2xl"
      dir="rtl"
      style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 24px))' }}
    >
      <h2
        className="text-base font-bold text-slate-900 dark:text-white text-center mb-0.5"
        style={{ fontFamily: 'var(--font-simpler)' }}
      >
        {unitType === 'time'
          ? isUnilateral ? 'כמה שניות לכל צד?' : 'כמה שניות החזקת?'
          : isUnilateral ? 'כמה חזרות לכל צד?' : 'כמה חזרות הצלחת מהתרגיל הקודם?'}
      </h2>

      {!isDrawerStable ? (
        <div className="w-full h-[72px] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#00B4FF] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : isUnilateral && (unitType === 'reps' || unitType === 'time') ? (
        <div className="space-y-1">
          {/* Right side picker */}
          <div>
            <div className="flex items-center gap-1.5 justify-center mb-0.5">
              <span className="text-sm">✋</span>
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-300" style={{ fontFamily: 'var(--font-simpler)' }}>ימין</p>
              <span className="text-xs font-semibold text-[#00B4FF]">{repsRight}{unitType === 'time' ? '"' : ''}</span>
            </div>
            <HorizontalPicker
              min={pickerMin}
              max={max}
              targetValue={targetValue}
              value={repsRight}
              onChange={onRepsRightChange}
              unitType={unitType}
            />
          </div>

          {/* Separator */}
          <div className="h-px bg-slate-200 dark:bg-zinc-700 mx-6" />

          {/* Left side picker */}
          <div>
            <div className="flex items-center gap-1.5 justify-center mb-0.5">
              <span className="text-sm" style={{ transform: 'scaleX(-1)' }}>✋</span>
              <p className="text-sm font-bold text-slate-700 dark:text-zinc-300" style={{ fontFamily: 'var(--font-simpler)' }}>שמאל</p>
              <span className="text-xs font-semibold text-[#00B4FF]">{repsLeft}{unitType === 'time' ? '"' : ''}</span>
            </div>
            <HorizontalPicker
              min={pickerMin}
              max={max}
              targetValue={targetValue}
              value={repsLeft}
              onChange={onRepsLeftChange}
              unitType={unitType}
            />
          </div>
        </div>
      ) : (() => {
        const achieved = lockedAchievedRef.current;
        const pickerValue = (achieved != null && achieved > 0)
          ? achieved
          : (completedReps != null && completedReps > 0)
            ? completedReps
            : targetValue;
        console.log('[Picker Debug] locked:', achieved, 'completedReps:', completedReps, 'target:', targetValue, '→ value:', pickerValue);
        return (
          <HorizontalPicker
            min={pickerMin}
            max={max}
            targetValue={targetValue}
            value={pickerValue}
            onChange={onPickerChange}
            unitType={unitType}
          />
        );
      })()}

      <button
        onClick={isUnilateral ? handleUnilateralClick : handleBilateralClick}
        className="w-full mt-3 h-14 rounded-full font-bold text-base text-white active:scale-[0.97] transition-transform"
        style={{
          background: 'linear-gradient(to left, #00C9F2, #00AEEF)',
          boxShadow: '0 4px 18px rgba(0, 185, 242, 0.38)',
          fontFamily: 'var(--font-simpler)',
        }}
      >
        שמירה ומעבר למנוחה
      </button>

      {/* Swap button — consistent with Active screen */}
      {onSwap && (
        <button
          onClick={onSwap}
          className="w-full mt-2 h-10 inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 active:scale-[0.97] transition-transform"
        >
          <img src="/assets/icons/ui/swap.svg" className="w-4 h-4 dark:invert" alt="Swap" />
          <span
            className="text-sm font-bold text-slate-600 dark:text-slate-300"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            החלפת תרגיל
          </span>
        </button>
      )}
    </div>
  );
}
