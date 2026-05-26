'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useInputPickerState — single source of truth for every picker, ref, effect,
 * and coach-hint piece of state consumed by both the Big-Screen INPUT layout
 * and the Log-Drawer RESTING sheet.
 *
 * Owns:
 *   • Picker config derivation
 *       isTimeExercise, pickerTargetValue, pickerUnitType, pickerMax,
 *       pickerInitialValue, inputSeedValue
 *   • Big-Screen INPUT state (bilateral & unilateral)
 *       inputRepsValue, inputRepsLeft, inputRepsRight
 *   • Log-Drawer unilateral state
 *       repsLeft, repsRight
 *   • Drawer stability gate
 *       isDrawerStable + drawerOpenTimeRef
 *   • Locked-achieved snapshot
 *       lockedAchievedRef (prevents picker initialization from clobbering the
 *       timer-recorded value once the drawer animates in)
 *   • Coach-hint state (fail / overachieve banner)
 *       coachHint + setCoachHint
 *   • Action handlers
 *       handlePickerChange, handleUnilateralSave
 *
 * Five effects move together with the state they manage:
 *   1. Re-seed Big-Screen pickers on every INPUT entry
 *   2. Drawer stability 280 ms post-open gate
 *   3. Locked-achieved snapshot lifecycle (capture on drawer open, clear on close)
 *   4. Coach-hint reset on exercise change
 *   5. Unilateral per-side reset on exercise / round / pendingSideData change
 *
 * Pure picker concerns — no JSX, no media, no drag, no state-machine ownership.
 * The orchestrator pipes in the minimum slice of `sm` it needs.
 *
 * Extracted from StrengthRunner.tsx (Decoupling Step R-3).
 */

type PickerUnitType = 'reps' | 'time';
type CoachHint = 'fail' | 'overachieve' | null;

export interface PickerConfig {
  isTimeExercise: boolean;
  pickerTargetValue: number;
  pickerUnitType: PickerUnitType;
  pickerMax: number;
  pickerInitialValue: number;
}

export interface InputPickerStateDeps {
  /** Current workout state machine phase. */
  workoutState: string;
  /** Live "achieved" value for the in-flight set (timer or autocomplete). */
  completedReps: number | null;
  /** Whether the bottom log drawer is currently animating in / staying open. */
  isLogDrawerOpen: boolean;
  /** Full active exercise from the state machine (read-only for symmetry/type/id). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeExercise: any | null;
  /** Effective duration (seconds) of the active time-based exercise. */
  exerciseDuration: number;
  /** History-aware preferred target (falls back to targetReps when null). */
  dynamicTarget: number | null;
  /** Coach-supplied rep target for the active set. */
  targetReps: number | null;
  /** Upper bound of the prescribed rep range (used to clamp picker maximum). */
  repsRangeMax: number | null;
  /** Last successfully saved reps for this exercise (seeds the picker default). */
  lastSavedReps: number | null;
  /** Recorded side data from an in-progress unilateral timed set. */
  pendingSideData: { left: number; right: number } | null;
  /** 1-based current round for the active exercise. */
  currentRound: number;
  /** State-machine setter — writes the live "achieved" value during picker drag. */
  setCompletedReps: (val: number) => void;
  /** State-machine action — commits a final repetition save (with optional side split). */
  handleRepetitionSave: (
    reps: number,
    sideData?: { left: number; right: number },
  ) => void;
}

export interface InputPickerStateApi {
  // Big-Screen INPUT pickers
  inputRepsValue: number;
  inputRepsLeft: number;
  inputRepsRight: number;
  setInputRepsValue: React.Dispatch<React.SetStateAction<number>>;
  setInputRepsLeft: React.Dispatch<React.SetStateAction<number>>;
  setInputRepsRight: React.Dispatch<React.SetStateAction<number>>;

  // Log-Drawer unilateral pickers
  repsLeft: number;
  repsRight: number;
  setRepsLeft: React.Dispatch<React.SetStateAction<number>>;
  setRepsRight: React.Dispatch<React.SetStateAction<number>>;

  // Drawer stability gate
  isDrawerStable: boolean;

  // Coach hint
  coachHint: CoachHint;
  setCoachHint: React.Dispatch<React.SetStateAction<CoachHint>>;

  // Locked-achieved snapshot (read inline by drawer JSX IIFE)
  lockedAchievedRef: React.MutableRefObject<number | null>;

  // Derived picker configuration
  pickerConfig: PickerConfig;

  // Action handlers
  handlePickerChange: (newVal: number) => void;
  handleUnilateralSave: () => void;
}

export function useInputPickerState(
  deps: InputPickerStateDeps,
): InputPickerStateApi {
  const {
    workoutState,
    completedReps,
    isLogDrawerOpen,
    activeExercise,
    exerciseDuration,
    dynamicTarget,
    targetReps,
    repsRangeMax,
    lastSavedReps,
    pendingSideData,
    currentRound,
    setCompletedReps,
    handleRepetitionSave,
  } = deps;

  // ── Picker config derivation ──────────────────────────────────────────────
  const isTimeExercise = activeExercise?.exerciseType === 'time';
  // Use dynamicTarget (history-aware) as the picker's goal marker; fall back to targetReps.
  const pickerTargetValue = Math.max(
    isTimeExercise
      ? exerciseDuration > 0
        ? exerciseDuration
        : 30
      : dynamicTarget ?? targetReps ?? 12,
    1,
  );
  const pickerUnitType: PickerUnitType = isTimeExercise ? 'time' : 'reps';
  const pickerMax = isTimeExercise
    ? 120
    : repsRangeMax ?? (targetReps ? targetReps * 2 : 50);
  const pickerInitialValue = lastSavedReps ?? pickerTargetValue;

  // HorizontalPicker handles unitType='time' natively (renders mm:ss from
  // total seconds), so a single `inputRepsValue` covers both reps and time.
  const inputSeedValue = completedReps ?? pickerTargetValue;

  // ── Big-Screen INPUT picker state ─────────────────────────────────────────
  const [inputRepsValue, setInputRepsValue] = useState(inputSeedValue);
  const [inputRepsRight, setInputRepsRight] = useState(inputSeedValue);
  const [inputRepsLeft, setInputRepsLeft] = useState(inputSeedValue);

  // Effect 1 — re-seed every time INPUT state is entered (new set completed).
  useEffect(() => {
    if (workoutState !== 'INPUT') return;
    const seed = completedReps ?? pickerTargetValue;
    setInputRepsValue(seed);
    setInputRepsRight(seed);
    setInputRepsLeft(seed);
  }, [workoutState, completedReps, pickerTargetValue]);

  // ── Drawer stability gate ─────────────────────────────────────────────────
  const [isDrawerStable, setIsDrawerStable] = useState(false);
  const drawerOpenTimeRef = useRef(0);

  // Effect 2 — don't render picker until drawer animation settles (~280 ms).
  useEffect(() => {
    if (isLogDrawerOpen) {
      drawerOpenTimeRef.current = Date.now();
      setIsDrawerStable(false);
      const timer = setTimeout(() => setIsDrawerStable(true), 280);
      return () => clearTimeout(timer);
    }
    setIsDrawerStable(false);
  }, [isLogDrawerOpen]);

  // ── Locked-achieved snapshot ──────────────────────────────────────────────
  // Prevents the picker's initial-value derivation from overwriting the
  // timer-recorded result during a drawer-open frame.
  const lockedAchievedRef = useRef<number | null>(null);

  // Effect 3 — capture on first non-zero completedReps after drawer opens,
  // clear when drawer closes.
  useEffect(() => {
    if (isLogDrawerOpen && completedReps != null && completedReps > 0) {
      if (lockedAchievedRef.current === null) {
        lockedAchievedRef.current = completedReps;
      }
    }
    if (!isLogDrawerOpen) {
      lockedAchievedRef.current = null;
    }
  }, [isLogDrawerOpen, completedReps]);

  // ── Coach hint state ──────────────────────────────────────────────────────
  const [coachHint, setCoachHint] = useState<CoachHint>(null);

  // Effect 4 — clear hint when active exercise changes.
  useEffect(() => {
    setCoachHint(null);
  }, [activeExercise?.id]);

  // ── Log-Drawer unilateral per-side state ──────────────────────────────────
  const [repsRight, setRepsRight] = useState(pickerInitialValue);
  const [repsLeft, setRepsLeft] = useState(pickerInitialValue);

  // Effect 5 — reset per-side values when exercise or set changes; for
  // unilateral timed sets, prefer the recorded sides from the state machine.
  useEffect(() => {
    if (pendingSideData) {
      setRepsRight(pendingSideData.right);
      setRepsLeft(pendingSideData.left);
    } else {
      setRepsRight(pickerInitialValue);
      setRepsLeft(pickerInitialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExercise?.id, currentRound, pendingSideData]);

  // ── Action handlers ───────────────────────────────────────────────────────
  const handlePickerChange = useCallback(
    (newVal: number) => {
      console.log(
        `[Runner Link] Received from picker: ${newVal} at ${Date.now() - drawerOpenTimeRef.current}ms since drawer open`,
      );
      if (newVal <= 0) return;
      setCompletedReps(newVal);
    },
    [setCompletedReps],
  );

  const handleUnilateralSave = useCallback(() => {
    const effective = Math.min(repsRight, repsLeft);
    handleRepetitionSave(effective, { left: repsLeft, right: repsRight });
  }, [repsRight, repsLeft, handleRepetitionSave]);

  return {
    inputRepsValue,
    inputRepsLeft,
    inputRepsRight,
    setInputRepsValue,
    setInputRepsLeft,
    setInputRepsRight,
    repsLeft,
    repsRight,
    setRepsLeft,
    setRepsRight,
    isDrawerStable,
    coachHint,
    setCoachHint,
    lockedAchievedRef,
    pickerConfig: {
      isTimeExercise,
      pickerTargetValue,
      pickerUnitType,
      pickerMax,
      pickerInitialValue,
    },
    handlePickerChange,
    handleUnilateralSave,
  };
}
