'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { WorkoutPlan, WorkoutSegment, Exercise as WorkoutExercise } from '@/features/parks';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
import { useWorkoutTimers } from './useWorkoutTimers';
import { usePyramidManager } from './usePyramidManager';
import { effectiveSetsForExercise } from '../logic/set-target.utils';
import { computeAdvanceDecision } from '../protocols/compute-advance';
import type { AdvanceContext } from '../protocols/advance-strategy.types';
import { resolveBlockProtocol, type BlockProtocolInfo } from '../protocols/block-protocol';
import { tabataIntervalInfo, tabataMemberCosts } from '../protocols/tabata.advance';
import { useSupersetPredicates } from './useSupersetPredicates';
import { useExerciseDerivedValues } from './useExerciseDerivedValues';
import { useExerciseLog } from './useExerciseLog';
// NextExerciseInfo now lives in useExerciseDerivedValues — imported for local use and re-exported
import type { NextExerciseInfo } from './useExerciseDerivedValues';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';
export type { NextExerciseInfo } from './useExerciseDerivedValues';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Phase 2 State Machine — `RESTING` replaces both `REPETITION_PICKER` and
 * `TRANSITION`. The log drawer is a boolean flag, not a separate state.
 */
export type WorkoutState = 'PREPARING' | 'ACTIVE' | 'INPUT' | 'RESTING' | 'PAUSED';

export interface ExerciseResultLog {
  exerciseId: string;
  exerciseName: string;
  segmentId: string;
  confirmedReps: number[];
  targetReps: number;
  /** Per-side reps for unilateral exercises (right side / ימין) */
  confirmedRepsRight?: number[];
  /** Per-side reps for unilateral exercises (left side / שמאל) */
  confirmedRepsLeft?: number[];
}

// NextExerciseInfo moved to useExerciseDerivedValues.ts (SM-3); re-exported above.

// ── Hybrid Workout Block Context ──────────────────────────────────────────

export type WorkoutBlockType = 'STRENGTH_BLOCK' | 'CARDIO_BLOCK' | 'WARMUP_BLOCK' | 'COOLDOWN_BLOCK' | string;

export interface WorkoutBlockContext {
  blockId?: string;
  blockType?: WorkoutBlockType;
  initialElapsedTime?: number;
}

export interface ForceTransitionPayload {
  reason?: string;
  data?: Record<string, unknown>;
}

// ── Result Interface ──────────────────────────────────────────────────────

export interface WorkoutStateMachineResult {
  workoutState: WorkoutState;
  currentSegmentIndex: number;
  currentExerciseIndex: number;
  isPaused: boolean;
  completedReps: number | null;
  fadeIn: boolean;
  videoProgress: number;

  /** True when the log-reps drawer is visible over RestWithPreview */
  isLogDrawerOpen: boolean;

  elapsedTime: number;
  preparationCountdown: number;
  restTimeLeft: number;
  formatTime: (seconds: number) => string;

  activeExercise: WorkoutExercise | null;
  currentSegment: WorkoutSegment | undefined;
  exerciseType: 'reps' | 'time' | 'follow-along';
  isFollowAlongMode: boolean;
  segmentRestTime: number;
  exerciseDuration: number;
  targetReps: number | null;
  /** Lower bound of the reps range (strict minimum). Prefers structured repsRange.min. */
  repsRangeMin: number | null;
  /** Upper bound of the reps range, e.g. 12 for "8-12 חזרות". Null if no range. */
  repsRangeMax: number | null;
  /**
   * Smart target for the current set, adjusted by last-session history.
   * If all last-session sets hit targetReps, this is targetReps + 1 (clamped to repsRangeMax).
   * Falls back to targetReps when no history exists.
   */
  dynamicTarget: number | null;
  autoCompleteTime: number;
  totalExercises: number;
  globalExerciseIndex: number;
  progressBars: Array<{ isActive: boolean; isCurrent: boolean }>;
  exerciseName: string;
  executionSteps: string[];
  exerciseGoal: string | null;
  muscleGroups: { primary: string[]; secondary: string[] };
  exerciseVideoUrl: string | null;
  /** Bare Bunny UUID for the active exercise — drives network-aware resolution. */
  exerciseBunnyVideoId: string | null;
  /** Long-form instructional video for the active exercise, if uploaded. */
  exerciseFullTutorial: ExternalVideo | null;
  nextExercise: NextExerciseInfo;
  repsOrDurationText: string;

  /** Current round (1-based) within the segment */
  currentRound: number;
  /** Total rounds for the current segment (from exercise.sets or 1) */
  totalRounds: number;
  /** Tabata interval position (1-based current / total rounds), or null when not in a tabata block */
  tabataInterval: { current: number; total: number } | null;
  /** Last confirmed reps for the current exercise (from previous set), or null */
  lastSavedReps: number | null;
  /** True when the current exercise is part of an antagonist superset pair */
  isSupersetActive: boolean;
  /** Display name of the paired exercise (superset partner), or null */
  supersetPartnerName: string | null;
  /**
   * True when we are Exercise A in the pair (the partner B comes next).
   * Used to show a micro-rest cue ("מעבר לבן זוג הסופרסט") on the rest screen.
   * False when we are B (full recovery rest follows before returning to A).
   */
  isNextPartnerExercise: boolean;

  blockId: string | undefined;
  blockType: WorkoutBlockType | undefined;

  /** Current side for unilateral timed exercises: 'right' → 'left' → null */
  currentSide: 'right' | 'left' | null;
  /** Stored side values after both sides are done (for the log drawer) */
  pendingSideData: { right: number; left: number } | null;

  /**
   * Active pyramid step for the current set, or null when the active
   * exercise has no `pyramidSequence`.  Drives dynamic overrides for
   * exerciseName / targetReps / exerciseVideoUrl.
   */
  pyramidStep: PyramidStep | null;
  /** True when the active exercise is running a Mechanical Pyramid. */
  isPyramidActive: boolean;

  /**
   * Validated block-scoped protocol of the current segment (tabata), or null.
   * When set, the UI forces the timer card (autoStart + autoCompleteAtTarget)
   * for every exercise in the segment and the machine skips INPUT.
   */
  blockProtocol: BlockProtocolInfo | null;

  handleExerciseComplete: (reps?: number) => void;
  /** Saves reps AND closes the drawer. Pass forceSkipRest to bypass RESTING entirely. Pass editSetIndex to update a specific set in-place (re-edit). */
  handleRepetitionSave: (reps: number, sideData?: { left: number; right: number }, forceSkipRest?: boolean, editSetIndex?: number) => void;
  skipRest: () => void;
  togglePause: () => void;
  setCompletedReps: React.Dispatch<React.SetStateAction<number | null>>;
  setVideoProgress: React.Dispatch<React.SetStateAction<number>>;

  forceTransition: (targetState: WorkoutState, payload?: ForceTransitionPayload) => void;
  getExerciseLog: () => ExerciseResultLog[];
  /** Reactive snapshot of exercise log — triggers re-renders on every log mutation */
  exerciseLogSnapshot: ExerciseResultLog[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_REST_TIME = 10;

// SUPERSET_TRANSITION_REST (10 s) now lives in useSupersetPredicates.ts (SM-2).

// ============================================================================
// HOOK
// ============================================================================

export function useWorkoutStateMachine(
  workout: WorkoutPlan,
  onComplete?: (exerciseLog?: ExerciseResultLog[]) => void,
  onPause?: () => void,
  onResume?: () => void,
  blockContext?: WorkoutBlockContext,
  /** Pre-fetched map of exerciseId → last-session confirmed reps (for smart target selection) */
  exerciseHistoryMap?: Record<string, number[]>,
): WorkoutStateMachineResult {
  // --------------------------------------------------------------------------
  // REFS
  // --------------------------------------------------------------------------

  const transitionLock = useRef(false);
  const prevIndicesRef = useRef({ segment: 0, exercise: 0, set: 0 });
  const workoutIdRef = useRef(workout.id);
  // --------------------------------------------------------------------------
  // STATE
  // --------------------------------------------------------------------------

  const [workoutState, setWorkoutState] = useState<WorkoutState>('PREPARING');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [completedReps, setCompletedReps] = useState<number | null>(null);
  useEffect(() => {
    console.log('[Machine State] completedReps updated to:', completedReps);
  }, [completedReps]);
  const [fadeIn, setFadeIn] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);

  /**
   * The log-reps drawer is a UI layer over the RESTING screen.
   * Setting this to false does NOT restart the rest timer.
   */
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);

  /**
   * Straight Sets — tracks which set (0-based) of the CURRENT exercise.
   * E.g. if exercise A has 3 sets: 0 → 1 → 2, then advance to exercise B set 0.
   * A ref mirrors the state so moveToNext reads the canonical value
   * even if called twice before React flushes.
   */
  const [currentSetIndex, _setCurrentSetIndex] = useState(0);
  const currentSetRef = useRef(0);
  const setCurrentSetIndex = useCallback((val: number | ((prev: number) => number)) => {
    _setCurrentSetIndex((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      currentSetRef.current = next;
      return next;
    });
  }, []);

  // ── Unilateral timed exercise: side-by-side tracking ────────────────────
  const [currentSide, setCurrentSide] = useState<'right' | 'left' | null>(null);
  const [pendingSideData, setPendingSideData] = useState<{ right: number; left: number } | null>(null);
  const pendingRightElapsed = useRef<number | null>(null);
  // Tabata unilateral: the clocked rest BETWEEN the two sides of the SAME
  // exercise must resume ACTIVE (left side) instead of advancing the cursor.
  const tabataSideRestRef = useRef(false);

  // --------------------------------------------------------------------------
  // HELPERS — Exercise Access (stable callbacks)
  // --------------------------------------------------------------------------

  const getExercises = useCallback(
    (segment: WorkoutSegment | undefined): WorkoutExercise[] | null => {
      if (!segment) return null;
      const seg = segment as any;
      if (Array.isArray(seg.exercises)) return seg.exercises;
      if (Array.isArray(seg.items)) return seg.items;
      if (Array.isArray(seg.list)) return seg.list;
      if (Array.isArray(seg.workout_exercises)) return seg.workout_exercises;
      if (Array.isArray(seg.workoutExercises)) return seg.workoutExercises;
      return null;
    },
    [],
  );

  const findNextValidSegmentIndex = useCallback(
    (startIndex: number): number | null => {
      for (let i = startIndex; i < workout.segments.length; i++) {
        const exercises = getExercises(workout.segments[i]);
        if (exercises && exercises.length > 0) return i;
      }
      return null;
    },
    [workout.segments, getExercises],
  );

  // --------------------------------------------------------------------------
  // HELPERS — Per-exercise sets count
  // --------------------------------------------------------------------------

  // Stage 0: sequence length is now authoritative (with a desync warn) — a
  // sets↔sequence mismatch previously orphaned tail steps (null targets,
  // stuck step-1 video/name) or silently truncated the pyramid. Legacy
  // behavior preserved exactly for non-sequence exercises. Single source:
  // set-target.utils.
  const getSetsForExercise = useCallback(
    (ex: WorkoutExercise | null | undefined): number => effectiveSetsForExercise(ex),
    [],
  );

  // ── SM-4: Exercise log — ref, version counter, write API ─────────────────
  // Placed here (before moveToNext) so exerciseLogRef is in scope for the
  // onComplete call inside moveToNext.  pyramidStep is NOT passed as an input
  // because usePyramidManager (SM-1) is called later in the MEMOS section;
  // autoSaveTargetReps inlines the pyramid lookup directly instead.
  const {
    exerciseLogRef,
    logVersion,
    bumpLog,
    autoSaveTargetReps,
    getExerciseLog,
    exerciseLogSnapshot,
  } = useExerciseLog({
    workout,
    currentSegmentIndex,
    currentExerciseIndex,
    currentSetIndex,
    getExercises,
  });

  // --------------------------------------------------------------------------
  // moveToNext — advances indices + sets workoutState to ACTIVE
  // This is called when rest finishes (timer or skip).
  // --------------------------------------------------------------------------

  const moveToNextRef = useRef<() => void>(() => {});
  const moveInFlightRef = useRef(false);

  /**
   * Advances the workout to the next step.
   *
   * Straight Sets (default): A(1/3) → A(2/3) → A(3/3) → B(1/2) → B(2/2) → C …
   *
   * Superset Flow (when exercise.pairedWith is set):
   *   A and B alternate each round, sharing the same setIndex (= round counter).
   *   A(round1) → B(round1) → A(round2) → B(round2) → A(round3) → B(round3) → C …
   *   - "First" in pair = lower index in the segment array.
   *   - Moving A→B: keep setIndex (same round, go to partner).
   *   - Moving B→A: increment setIndex (next round, go back to first).
   *   - When all rounds done: advance to the exercise AFTER the last partner.
   *
   * Reads currentSetRef (not the stale closure) to prevent double-increment.
   * Re-entry guard (moveInFlightRef) prevents timer/skip overlap from double-firing.
   */
  const moveToNext = useCallback(() => {
    if (moveInFlightRef.current) return;
    moveInFlightRef.current = true;

    const setIdx = currentSetRef.current;

    setCurrentExerciseIndex((prevExerciseIndex) => {
      // Stage 1a: the decision logic lives in the pure, characterization-
      // tested computeAdvanceDecision (protocols/compute-advance.ts) —
      // extracted VERBATIM from the monolith that used to live here. The
      // decision is computed INSIDE this updater on `prevExerciseIndex`
      // (React batching semantics preserved); this switch only applies it.
      const decision = computeAdvanceDecision({
        segments: workout.segments,
        currentSegmentIndex,
        prevExerciseIndex,
        setIdx,
        log: exerciseLogRef.current,
        getExercises: getExercises as unknown as AdvanceContext['getExercises'],
        getSets: getSetsForExercise as unknown as AdvanceContext['getSets'],
      });

      switch (decision.kind) {
        case 'sameExercise':
          setCurrentSetIndex(decision.nextSetIdx);
          setWorkoutState('ACTIVE');
          return prevExerciseIndex;
        case 'goToExercise':
          if (decision.nextSetIdx !== null) setCurrentSetIndex(decision.nextSetIdx);
          setWorkoutState('ACTIVE');
          return decision.exerciseIndex;
        case 'nextSegment':
          setCurrentSegmentIndex(decision.segmentIndex);
          setCurrentSetIndex(0);
          setWorkoutState('ACTIVE');
          return 0;
        case 'workoutComplete':
          setTimeout(() => onComplete?.(exerciseLogRef.current), 0);
          return 0;
      }
    });

    requestAnimationFrame(() => { moveInFlightRef.current = false; });
  }, [workout, currentSegmentIndex, getExercises, getSetsForExercise, findNextValidSegmentIndex, onComplete, setCurrentSetIndex]);

  // Keep a ref so onRestComplete can call the latest version
  useEffect(() => { moveToNextRef.current = moveToNext; });

  // --------------------------------------------------------------------------
  // REST COMPLETE HANDLER — called by useWorkoutTimers when restTimeLeft hits 0
  //
  // Fix #2: The timer is decoupled from UI — this callback doesn't reset anything.
  // Fix #3: If the log drawer is still open, auto-save and auto-close it.
  // --------------------------------------------------------------------------

  const handleRestTimerDone = useCallback(() => {
    if (transitionLock.current || moveInFlightRef.current) return;
    // Tabata unilateral side-rest: resume ACTIVE on the left side of the
    // SAME exercise — no cursor advance, no lock (no index will change).
    if (tabataSideRestRef.current) {
      tabataSideRestRef.current = false;
      console.log('[Engine][Tabata] side rest done — left side starts');
      setFadeIn(false);
      setTimeout(() => {
        setWorkoutState('ACTIVE');
        setFadeIn(true);
      }, 100);
      return;
    }
    transitionLock.current = true;
    // Log is already committed by handleExerciseComplete before RESTING,
    // so the rest-timer callback only needs to advance the cursor.
    console.log('[Engine] Rest timer hit 0 — advancing');
    setFadeIn(false);
    setTimeout(() => {
      moveToNextRef.current();
      setFadeIn(true);
    }, 100);
  }, []);

  // --------------------------------------------------------------------------
  // TIMER HOOK
  // --------------------------------------------------------------------------

  const handlePrepComplete = useCallback(() => {
    setWorkoutState('ACTIVE');
  }, []);

  const {
    elapsedTime,
    preparationCountdown,
    restTimeLeft,
    setRestTimeLeft,
    formatTime,
    resetTimers,
  } = useWorkoutTimers({
    workoutState,
    isPaused,
    onPreparationComplete: handlePrepComplete,
    onRestComplete: handleRestTimerDone,
    initialElapsedTime: blockContext?.initialElapsedTime,
  });

  // --------------------------------------------------------------------------
  // EFFECT — Hard Lock Release
  // --------------------------------------------------------------------------

  useEffect(() => {
    const prev = prevIndicesRef.current;
    const hasChanged =
      prev.segment !== currentSegmentIndex ||
      prev.exercise !== currentExerciseIndex ||
      prev.set !== currentSetIndex;

    if (hasChanged) {
      console.log('[Engine] Index changed — releasing lock', {
        from: prev,
        to: { segment: currentSegmentIndex, exercise: currentExerciseIndex, set: currentSetIndex },
      });
      prevIndicesRef.current = {
        segment: currentSegmentIndex,
        exercise: currentExerciseIndex,
        set: currentSetIndex,
      };
      requestAnimationFrame(() => {
        transitionLock.current = false;
        console.log('[Engine] Lock Released');
      });
    }
  }, [currentSegmentIndex, currentExerciseIndex, currentSetIndex]);

  // --------------------------------------------------------------------------
  // EFFECT — Workout Plan ID Change Detection
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (workout.id !== workoutIdRef.current) {
      console.log('[Engine] Workout plan ID changed, resetting');
      workoutIdRef.current = workout.id;
      setCurrentSegmentIndex(0);
      setCurrentExerciseIndex(0);
      setCurrentSetIndex(0);
      setWorkoutState('PREPARING');
      setIsLogDrawerOpen(false);
      prevIndicesRef.current = { segment: 0, exercise: 0, set: 0 };
      transitionLock.current = false;
    }
  }, [workout.id]);

  // --------------------------------------------------------------------------
  // MEMOS — Derived values
  // --------------------------------------------------------------------------

  const activeExercise = useMemo(() => {
    const segment = workout.segments[currentSegmentIndex];
    const exercises = getExercises(segment);
    return exercises?.[currentExerciseIndex] || null;
  }, [workout, currentSegmentIndex, currentExerciseIndex, getExercises]);

  const currentSegment = useMemo(
    () => workout.segments[currentSegmentIndex],
    [workout, currentSegmentIndex],
  );

  // ── Block-scoped protocol (Stage 2): tabata clock owns the segment ───────
  const blockProtocol = useMemo(
    () => resolveBlockProtocol(currentSegment),
    [currentSegment],
  );

  // ── Tabata interval position (1-based / rounds) for the header counter ───
  // Replaces the misleading set counter (currentRound = cycle, totalRounds =
  // the exercise's own sets). A unilateral member spans two intervals — the
  // left side is the visit's second interval.
  const tabataInterval = useMemo<{ current: number; total: number } | null>(() => {
    if (blockProtocol?.id !== 'tabata') return null;
    const exercises = (getExercises(currentSegment) ?? []) as unknown as Array<Record<string, unknown>>;
    const { intervalIndex } = tabataIntervalInfo({
      costs: tabataMemberCosts(exercises),
      exerciseIndex: currentExerciseIndex,
      setIdx: currentSetIndex,
      rounds: blockProtocol.config.rounds,
    });
    const current = intervalIndex + 1 + (currentSide === 'left' ? 1 : 0);
    return { current: Math.min(current, blockProtocol.config.rounds), total: blockProtocol.config.rounds };
  }, [blockProtocol, currentSegment, currentExerciseIndex, currentSetIndex, currentSide, getExercises]);

  // ── SM-1: Pyramid protocol — pure derivations (see usePyramidManager.ts) ──
  const { pyramidStep, isPyramidActive } = usePyramidManager({ activeExercise, currentSetIndex });

  // ── SM-2: Superset predicates — read-only pair state ─────────────────────
  // computeEffectiveRestTime accepts segmentRestTime as a parameter (not a
  // hook input) so this hook can be declared before segmentRestTime is memoised.
  const {
    isSupersetActive,
    supersetPartnerName,
    isNextPartnerExercise,
    computeEffectiveRestTime,
  } = useSupersetPredicates({ activeExercise, currentSegment, currentExerciseIndex, getExercises });

  // ── SM-3: All 20+ display-value memos (see useExerciseDerivedValues.ts) ──
  const {
    isFollowAlongMode,
    exerciseType,
    isUnilateralTimed,
    segmentRestTime,
    exerciseDuration,
    targetReps,
    repsRangeMin,
    repsRangeMax,
    dynamicTarget,
    autoCompleteTime,
    totalExercises,
    globalExerciseIndex,
    progressBars,
    exerciseName,
    executionSteps,
    exerciseGoal,
    muscleGroups,
    exerciseVideoUrl,
    exerciseBunnyVideoId,
    exerciseFullTutorial,
    nextExercise,
    repsOrDurationText,
    lastSavedReps,
    setsForCurrentExercise,
  } = useExerciseDerivedValues({
    workout,
    currentSegmentIndex,
    currentExerciseIndex,
    currentSetIndex,
    activeExercise,
    currentSegment,
    exerciseHistoryMap,
    pyramidStep,
    logVersion,
    exerciseLogRef,
    getExercises,
    getSetsForExercise,
  });

  // ── Unilateral side-tracking effect (side-effect; stays in orchestrator) ─
  useEffect(() => {
    if (isUnilateralTimed) {
      setCurrentSide('right');
      pendingRightElapsed.current = null;
      setPendingSideData(null);
    } else {
      setCurrentSide(null);
      pendingRightElapsed.current = null;
      setPendingSideData(null);
    }
  }, [activeExercise?.id, isUnilateralTimed]);

  // --------------------------------------------------------------------------
  // CALLBACKS — State Machine Transitions
  // --------------------------------------------------------------------------

  /**
   * Exercise complete — triggered by FillingButton auto-fill or manual tap.
   *
   * For reps/time exercises:
   *   1. Log the just-completed set (via `autoSaveTargetReps`)
   *   2. Arm the clocked rest countdown (`setRestTimeLeft`)
   *   3. Flip to RESTING — cursor stays put until `handleRestTimerDone`
   *      or `skipRest` fires
   *
   * For warmup/cooldown follow-along: log silently + advance directly.
   */
  const handleExerciseComplete = useCallback(
    (reps?: number) => {
      console.trace('[Engine] handleExerciseComplete called by:');

      if (transitionLock.current) {
        console.warn('[Engine] BLOCKED — lock is engaged');
        return;
      }

      transitionLock.current = true;
      console.log('[Engine] Lock ENGAGED — exercise complete', {
        exerciseType,
        segmentRestTime,
        exercise: activeExercise?.name,
      });

      // ── Block-scoped (tabata): auto-log at transition, skip INPUT ────────
      // David's quick-log decision: tabata is auto-only — edits happen at
      // end-of-block/summary, never mid-block. Work interval ends → log →
      // clocked rest from config → moveToNext; last interval advances
      // immediately with no trailing rest.
      if (blockProtocol?.id === 'tabata') {
        // ── Unilateral member = TWO intervals (David's rule, 12.07.2026):
        // right side works → clocked rest → LEFT side of the SAME exercise
        // → then the normal advance. The right side logs nothing yet — both
        // sides log together (sideData) when the left completes.
        if (isUnilateralTimed && currentSide === 'right') {
          pendingRightElapsed.current = reps ?? blockProtocol.config.workSec;
          setCurrentSide('left'); // remounts the timer card (key: timer-left)
          if (blockProtocol.config.restSec > 0) {
            setFadeIn(false);
            setTimeout(() => {
              tabataSideRestRef.current = true; // rest-done resumes ACTIVE, no advance
              setWorkoutState('RESTING');
              setRestTimeLeft(blockProtocol.config.restSec);
              setFadeIn(true);
              transitionLock.current = false;
              console.log('[Engine][Tabata] side interval done (right) — clocked rest → left side');
            }, 100);
          } else {
            transitionLock.current = false;
            console.log('[Engine][Tabata] side interval done (right) — left side starts immediately');
          }
          return;
        }

        // Left side just finished → log BOTH sides on one entry.
        const sideData =
          isUnilateralTimed && currentSide === 'left'
            ? {
                right: pendingRightElapsed.current ?? blockProtocol.config.workSec,
                left: reps ?? blockProtocol.config.workSec,
              }
            : undefined;

        // time-type logs real elapsed from the timer card; reps-type logs the
        // per-set target (resolveSetTarget) as the editable auto value.
        autoSaveTargetReps(
          exerciseType === 'time'
            ? (sideData ? Math.min(sideData.right, sideData.left) : reps)
            : undefined,
          sideData,
        );

        const { isLastInterval } = tabataIntervalInfo({
          costs: tabataMemberCosts(
            (getExercises(currentSegment) ?? []) as unknown as Array<Record<string, unknown>>,
          ),
          exerciseIndex: currentExerciseIndex,
          setIdx: currentSetRef.current,
          rounds: blockProtocol.config.rounds,
        });

        if (isLastInterval || blockProtocol.config.restSec <= 0) {
          console.log('[Engine][Tabata] work interval done — advancing immediately (no rest)');
          setFadeIn(false);
          setTimeout(() => {
            moveToNextRef.current();
            setFadeIn(true);
          }, 100);
        } else {
          setFadeIn(false);
          setTimeout(() => {
            setWorkoutState('RESTING');
            setRestTimeLeft(blockProtocol.config.restSec);
            setFadeIn(true);
            // Release the lock manually — entering RESTING changes no index,
            // so the index-change effect won't, and handleRestTimerDone
            // refuses to advance while the lock is engaged.
            transitionLock.current = false;
            console.log(`[Engine][Tabata] clocked rest ${blockProtocol.config.restSec}s → RESTING`);
          }, 100);
        }
        return;
      }

      switch (exerciseType) {
        case 'follow-along': {
          // Warmup/cooldown exercises advance immediately on user tap —
          // no rest screen, no log drawer. Main-segment follow-along
          // (e.g. a skill demo) routes through RESTING + log drawer.
          const segTitle = workout.segments[currentSegmentIndex]?.title || '';
          const isWarmupCooldown =
            activeExercise?.exerciseRole === 'warmup' ||
            activeExercise?.exerciseRole === 'cooldown' ||
            segTitle.includes('חימום') || segTitle.toLowerCase().includes('warmup') ||
            segTitle.includes('שחרור') || segTitle.includes('קירור') ||
            segTitle.toLowerCase().includes('cooldown');

          if (isWarmupCooldown) {
            // Silent log + immediate advance on single user tap.
            if (activeExercise) {
              const followAlongReps = reps ?? exerciseDuration ?? 30;
              const segId =
                workout.segments[currentSegmentIndex]?.id || String(currentSegmentIndex);
              const existing = exerciseLogRef.current.find(
                (e) => e.exerciseId === activeExercise.id && e.segmentId === segId,
              );
              if (existing) {
                existing.confirmedReps.push(followAlongReps);
              } else {
                exerciseLogRef.current.push({
                  exerciseId: activeExercise.id,
                  exerciseName: activeExercise.name,
                  segmentId: segId,
                  confirmedReps: [followAlongReps],
                  targetReps: followAlongReps,
                });
              }
              bumpLog();
            }
            setFadeIn(false);
            setTimeout(() => {
              moveToNextRef.current();
              setFadeIn(true);
            }, 150);
            break;
          }

          // Main-segment follow-along: show INPUT overlay so user can
          // confirm before rest begins.
          const defaultVal = reps ?? exerciseDuration ?? 30;
          setCompletedReps(defaultVal);
          setFadeIn(false);
          setTimeout(() => {
            setWorkoutState('INPUT');
            setFadeIn(true);
            // Release the lock immediately — the lock-release useEffect only
            // fires when exercise/set indices change, which won't happen until
            // handleRepetitionSave later advances the cursor.
            transitionLock.current = false;
            console.log('[Engine] follow-along → INPUT (awaiting user confirmation)');
          }, 150);
          break;
        }

        case 'time':
        case 'reps': {
          // ── Unilateral timed: side-by-side flow ──────────────────────
          if (isUnilateralTimed && currentSide === 'right') {
            pendingRightElapsed.current = reps ?? exerciseDuration ?? 30;
            setCurrentSide('left');
            transitionLock.current = false;
            console.log(`[Engine] Unilateral timed: Right side done (${pendingRightElapsed.current}s), switching to left`);
            break;
          }

          if (isUnilateralTimed && currentSide === 'left') {
            const leftElapsed = reps ?? exerciseDuration ?? 30;
            const rightElapsed = pendingRightElapsed.current ?? exerciseDuration ?? 30;
            const effective = Math.min(rightElapsed, leftElapsed);
            setCompletedReps(effective);
            setPendingSideData({ right: rightElapsed, left: leftElapsed });
            // INPUT: rest clock NOT armed yet — user must confirm first.
            setFadeIn(false);
            setTimeout(() => {
              setWorkoutState('INPUT');
              setFadeIn(true);
              transitionLock.current = false;
              console.log(`[Engine] Unilateral timed: Both sides done (R:${rightElapsed}s L:${leftElapsed}s) → INPUT (awaiting confirmation)`);
            }, 150);
            break;
          }

          // ── Normal (bilateral / reps) flow ───────────────────────────
          // Pre-fill `completedReps` so the wheel can anchor to the
          // timer/CTA value, but do NOT write to the log or start rest
          // — handleRepetitionSave does both when user confirms.
          const defaultVal = exerciseType === 'time'
            ? (reps ?? exerciseDuration ?? 30)
            : (reps ?? targetReps ?? 0);
          setCompletedReps(defaultVal);

          setFadeIn(false);
          setTimeout(() => {
            setWorkoutState('INPUT');
            setFadeIn(true);
            transitionLock.current = false;
            console.log('[Engine] → INPUT (awaiting user confirmation before rest)');
          }, 150);
          break;
        }
      }
    },
    [
      exerciseType,
      targetReps,
      exerciseDuration,
      activeExercise,
      currentSegmentIndex,
      currentExerciseIndex,
      currentSegment,
      workout.segments,
      isUnilateralTimed,
      currentSide,
      bumpLog,
      blockProtocol,
      autoSaveTargetReps,
      getExercises,
      setRestTimeLeft,
    ],
  );

  /**
   * Manual save from the log drawer.
   * Saves reps, closes the drawer, and STARTS the rest countdown.
   * The rest timer is deferred to this moment so David controls when
   * his rest begins — total workout time keeps ticking throughout.
   */
  const handleRepetitionSave = useCallback(
    (reps: number, sideData?: { left: number; right: number }, forceSkipRest?: boolean, editSetIndex?: number) => {
      if (!activeExercise) {
        setIsLogDrawerOpen(false);
        return;
      }

      const segId =
        workout.segments[currentSegmentIndex]?.id || String(currentSegmentIndex);
      const existing = exerciseLogRef.current.find(
        (e) => e.exerciseId === activeExercise.id && e.segmentId === segId,
      );

      const isReEdit =
        editSetIndex !== undefined &&
        existing !== undefined &&
        editSetIndex < existing.confirmedReps.length;

      if (isReEdit) {
        existing!.confirmedReps[editSetIndex] = reps;
        if (sideData) {
          if (existing!.confirmedRepsRight) existing!.confirmedRepsRight[editSetIndex] = sideData.right;
          if (existing!.confirmedRepsLeft) existing!.confirmedRepsLeft[editSetIndex] = sideData.left;
        }
        bumpLog();
        console.log(
          `[Engine] Re-edited set ${editSetIndex + 1}: ${activeExercise.name} → ${reps} (no advance)`,
        );
        setIsLogDrawerOpen(false);
        return;
      }

      setCompletedReps(reps);

      if (existing) {
        existing.confirmedReps.push(reps);
        if (sideData) {
          if (!existing.confirmedRepsRight) existing.confirmedRepsRight = [];
          if (!existing.confirmedRepsLeft) existing.confirmedRepsLeft = [];
          existing.confirmedRepsRight.push(sideData.right);
          existing.confirmedRepsLeft.push(sideData.left);
        }
      } else {
        exerciseLogRef.current.push({
          exerciseId: activeExercise.id,
          exerciseName: activeExercise.name,
          segmentId: segId,
          confirmedReps: [reps],
          targetReps: targetReps ?? reps,
          ...(sideData && {
            confirmedRepsRight: [sideData.right],
            confirmedRepsLeft: [sideData.left],
          }),
        });
      }
      bumpLog();
      if (sideData) {
        console.log(
          `[Engine] Saved reps (unilateral): ${activeExercise.name} → R:${sideData.right} L:${sideData.left} (effective: ${reps}, target: ${targetReps ?? 'N/A'})`,
        );
      } else {
        console.log(
          `[Engine] Saved reps: ${activeExercise.name} → ${reps} (target: ${targetReps ?? 'N/A'})`,
        );
      }

      setIsLogDrawerOpen(false);

      // ── Superset physiology: A→B = micro-rest, B→A = full rest ──────────
      // computeEffectiveRestTime (from useSupersetPredicates) encapsulates the
      // pairedWith index comparison and returns SUPERSET_TRANSITION_REST (10s)
      // for A→B transitions, or `segmentRestTime` for everything else.
      const effectiveRestTime = computeEffectiveRestTime(segmentRestTime);

      // Diagnostic: confirm rest physiology at save time
      console.log(
        `[Engine][Save] "${activeExercise?.name}" seg=${currentSegmentIndex} ex=${currentExerciseIndex} ` +
        `pairedWith=${(activeExercise as any)?.pairedWith ?? 'NONE'} isNextPartner=${isNextPartnerExercise} effectiveRest=${effectiveRestTime}s`,
      );

      if (forceSkipRest || effectiveRestTime <= 0) {
        console.log(`[Engine] ${forceSkipRest ? 'Forced skip rest (warmup/cooldown)' : 'Zero rest'} — advancing immediately`);
        setFadeIn(false);
        setTimeout(() => {
          moveToNextRef.current();
          setFadeIn(true);
        }, 100);
      } else {
        setFadeIn(false);
        setTimeout(() => {
          setWorkoutState('RESTING');
          setRestTimeLeft(effectiveRestTime);
          setFadeIn(true);
          console.log(
            `[Engine] Rest timer started: ${effectiveRestTime}s` +
            `${isNextPartnerExercise ? ' (A→B micro-rest)' : ' (full rest)'}` +
            ` | workoutState → RESTING`,
          );
        }, 100);
      }
    },
    [activeExercise, workout.segments, currentSegmentIndex, currentExerciseIndex, targetReps, bumpLog, segmentRestTime, setRestTimeLeft, computeEffectiveRestTime, isNextPartnerExercise],
  );

  /**
   * Skip rest — advances immediately.  Log is already committed by
   * `handleExerciseComplete` before RESTING, so no save needed here.
   */
  const skipRest = useCallback(() => {
    if (transitionLock.current) {
      console.warn('[Engine] skipRest BLOCKED');
      return;
    }
    // Tabata unilateral side-rest: skipping must start the LEFT side, not
    // advance past it.
    if (tabataSideRestRef.current) {
      tabataSideRestRef.current = false;
      console.log('[Engine][Tabata] side rest skipped — left side starts');
      setFadeIn(false);
      setTimeout(() => {
        setWorkoutState('ACTIVE');
        setFadeIn(true);
      }, 150);
      return;
    }
    transitionLock.current = true;

    setFadeIn(false);
    setTimeout(() => {
      moveToNextRef.current();
      setFadeIn(true);
    }, 150);
  }, []);

  const togglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      onResume?.();
    } else {
      setIsPaused(true);
      onPause?.();
    }
  }, [isPaused, onPause, onResume]);

  // --------------------------------------------------------------------------
  // EXTERNAL EVENT TRIGGERS — Hybrid Workout Support
  // --------------------------------------------------------------------------

  const forceTransition = useCallback(
    (targetState: WorkoutState, payload?: ForceTransitionPayload) => {
      console.log('[Engine] forceTransition', { targetState, reason: payload?.reason });
      transitionLock.current = false;
      setIsLogDrawerOpen(false);
      setFadeIn(false);
      setTimeout(() => {
        setWorkoutState(targetState);
        setFadeIn(true);
      }, 150);
    },
    [],
  );

  // --------------------------------------------------------------------------
  // RETURN
  // --------------------------------------------------------------------------

  return {
    workoutState,
    currentSegmentIndex,
    currentExerciseIndex,
    isPaused,
    completedReps,
    fadeIn,
    videoProgress,
    isLogDrawerOpen,

    elapsedTime,
    preparationCountdown,
    restTimeLeft,
    formatTime,

    blockId: blockContext?.blockId,
    blockType: blockContext?.blockType,

    currentSide,
    pendingSideData,

    activeExercise,
    currentSegment,
    exerciseType,
    isFollowAlongMode,
    segmentRestTime,
    exerciseDuration,
    targetReps,
    repsRangeMin,
    repsRangeMax,
    dynamicTarget,
    autoCompleteTime,
    totalExercises,
    globalExerciseIndex,
    progressBars,
    exerciseName,
    executionSteps,
    exerciseGoal,
    muscleGroups,
    exerciseVideoUrl,
    exerciseBunnyVideoId,
    exerciseFullTutorial,
    nextExercise,
    repsOrDurationText,
    currentRound: currentSetIndex + 1,
    totalRounds: setsForCurrentExercise,
    tabataInterval,
    lastSavedReps,
    isSupersetActive,
    supersetPartnerName,
    isNextPartnerExercise,
    pyramidStep,
    isPyramidActive,
    blockProtocol,

    handleExerciseComplete,
    handleRepetitionSave,
    skipRest,
    togglePause,
    setCompletedReps,
    setVideoProgress,

    forceTransition,
    getExerciseLog,
    exerciseLogSnapshot,
  };
}
