'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { WorkoutPlan, WorkoutSegment, Exercise as WorkoutExercise } from '@/features/parks';
import { useWorkoutTimers } from './useWorkoutTimers';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Phase 2 State Machine — `RESTING` replaces both `REPETITION_PICKER` and
 * `TRANSITION`. The log drawer is a boolean flag, not a separate state.
 */
export type WorkoutState = 'PREPARING' | 'ACTIVE' | 'RESTING' | 'PAUSED';

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

export interface NextExerciseInfo {
  name: string;
  videoUrl: string | null;
  imageUrl: string | null;
  equipment: string[];
  reps?: string;
  duration?: string;
  exerciseType: string;
  executionSteps: string[];
  muscleGroups: { primary: string[]; secondary: string[] };
  exerciseGoal: string | null;
  /** Notification text from the matching execution method (e.g. "Find a comfortable bench") */
  notificationText: string | null;
}

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
  nextExercise: NextExerciseInfo;
  repsOrDurationText: string;

  /** Current round (1-based) within the segment */
  currentRound: number;
  /** Total rounds for the current segment (from exercise.sets or 1) */
  totalRounds: number;
  /** Last confirmed reps for the current exercise (from previous set), or null */
  lastSavedReps: number | null;
  /** True when the current exercise is part of an antagonist superset pair */
  isSupersetActive: boolean;
  /** Display name of the paired exercise (superset partner), or null */
  supersetPartnerName: string | null;

  blockId: string | undefined;
  blockType: WorkoutBlockType | undefined;

  /** Current side for unilateral timed exercises: 'right' → 'left' → null */
  currentSide: 'right' | 'left' | null;
  /** Stored side values after both sides are done (for the log drawer) */
  pendingSideData: { right: number; left: number } | null;

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
  const exerciseLogRef = useRef<ExerciseResultLog[]>([]);
  const [logVersion, setLogVersion] = useState(0);
  const bumpLog = useCallback(() => setLogVersion(v => {
    const next = v + 1;
    console.log(`🔄 [Source of Truth] logVersion incremented to: ${next} | Snapshot updated. | t=${performance.now().toFixed(1)}ms`);
    return next;
  }), []);
  const lastActiveStartTime = useRef<number>(Date.now());

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

  const getSetsForExercise = useCallback((ex: WorkoutExercise | null | undefined): number => {
    if (!ex) return 1;
    if (typeof ex.sets === 'number' && ex.sets > 1) return ex.sets;
    const repsStr = ex.reps;
    if (repsStr) {
      const m = repsStr.match(/^(\d+)\s*[xX×]/);
      if (m) return parseInt(m[1], 10);
    }
    return 1;
  }, []);

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
      const currentSeg = workout.segments[currentSegmentIndex];
      const exercises = getExercises(currentSeg);

      if (!exercises || exercises.length === 0) {
        const nextIdx = findNextValidSegmentIndex(currentSegmentIndex + 1);
        if (nextIdx !== null) {
          setCurrentSegmentIndex(nextIdx);
          setCurrentSetIndex(0);
          setWorkoutState('ACTIVE');
        } else {
          setTimeout(() => onComplete?.(exerciseLogRef.current), 0);
        }
        return 0;
      }

      const currentEx = exercises[prevExerciseIndex];
      const setsForCurrentEx = getSetsForExercise(currentEx);

      // ── Superset Flow ────────────────────────────────────────────────────
      const pairedId = (currentEx as any)?.pairedWith as string | null | undefined;
      if (pairedId) {
        const pairedIndex = exercises.findIndex((e) => e.id === pairedId);
        if (pairedIndex !== -1) {
          const isFirstInPair = pairedIndex > prevExerciseIndex;

          if (isFirstInPair) {
            // Current = A (first), partner = B (second) → go to B, same round
            console.log(`[Engine][Superset] A→B (round ${setIdx + 1}/${setsForCurrentEx}) "${currentEx.name}" → "${exercises[pairedIndex].name}"`);
            setWorkoutState('ACTIVE');
            return pairedIndex;
          } else {
            // Current = B (second), partner = A (first)
            if (setIdx < setsForCurrentEx - 1) {
              // More rounds → go back to A, increment round
              const nextRound = setIdx + 1;
              console.log(`[Engine][Superset] B→A (round ${nextRound + 1}/${setsForCurrentEx}) "${currentEx.name}" → "${exercises[pairedIndex].name}"`);
              setCurrentSetIndex(nextRound);
              setWorkoutState('ACTIVE');
              return pairedIndex;
            } else {
              // All rounds done → advance past B (the higher-index member)
              const afterPairIndex = prevExerciseIndex + 1;
              console.log(`[Engine][Superset] Pair complete. Moving to index ${afterPairIndex}`);
              setCurrentSetIndex(0);
              if (afterPairIndex < exercises.length) {
                setWorkoutState('ACTIVE');
                return afterPairIndex;
              }
              const nextIdx = findNextValidSegmentIndex(currentSegmentIndex + 1);
              if (nextIdx !== null) {
                setCurrentSegmentIndex(nextIdx);
                setWorkoutState('ACTIVE');
              } else {
                setTimeout(() => onComplete?.(exerciseLogRef.current), 0);
              }
              return 0;
            }
          }
        }
      }

      // ── Straight Sets (default) ──────────────────────────────────────────
      console.log('[Engine] moveToNext (straight sets)', { currentSegmentIndex, setIdx });

      if (setIdx < setsForCurrentEx - 1) {
        const nextSet = setIdx + 1;
        console.log(`[Engine] Same exercise, next set ${nextSet + 1}/${setsForCurrentEx}`);
        setCurrentSetIndex(nextSet);
        setWorkoutState('ACTIVE');
        return prevExerciseIndex;
      }

      setCurrentSetIndex(0);
      if (prevExerciseIndex < exercises.length - 1) {
        setWorkoutState('ACTIVE');
        return prevExerciseIndex + 1;
      }

      const nextIdx = findNextValidSegmentIndex(currentSegmentIndex + 1);
      if (nextIdx !== null) {
        setCurrentSegmentIndex(nextIdx);
        setWorkoutState('ACTIVE');
      } else {
        setTimeout(() => onComplete?.(exerciseLogRef.current), 0);
      }
      return 0;
    });

    requestAnimationFrame(() => { moveInFlightRef.current = false; });
  }, [workout, currentSegmentIndex, getExercises, getSetsForExercise, findNextValidSegmentIndex, onComplete, setCurrentSetIndex]);

  // Keep a ref so onRestComplete can call the latest version
  useEffect(() => { moveToNextRef.current = moveToNext; });

  // --------------------------------------------------------------------------
  // Auto-save helper — writes target reps when the user hasn't manually saved
  // --------------------------------------------------------------------------

  const autoSaveTargetReps = useCallback(() => {
    const exercise = (() => {
      const segment = workout.segments[currentSegmentIndex];
      const exercises = getExercises(segment);
      return exercises?.[currentExerciseIndex] || null;
    })();
    if (!exercise) return;

    const segId = workout.segments[currentSegmentIndex]?.id || String(currentSegmentIndex);
    const repsStr = exercise.reps?.replace(/^\d+\s*[xX×]\s*/, '') ?? '';
    let reps = 0;
    if (repsStr) {
      const match = repsStr.match(/(\d+)/);
      reps = match ? parseInt(match[1], 10) : 0;
    }

    const existing = exerciseLogRef.current.find(
      (e) => e.exerciseId === exercise.id && e.segmentId === segId,
    );
    if (!existing) {
      exerciseLogRef.current.push({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        segmentId: segId,
        confirmedReps: [reps],
        targetReps: reps,
      });
      bumpLog();
      console.log(`[Engine] Auto-saved target reps: ${exercise.name} → ${reps}`);
    }
  }, [workout, currentSegmentIndex, currentExerciseIndex, getExercises, bumpLog]);

  // --------------------------------------------------------------------------
  // REST COMPLETE HANDLER — called by useWorkoutTimers when restTimeLeft hits 0
  //
  // Fix #2: The timer is decoupled from UI — this callback doesn't reset anything.
  // Fix #3: If the log drawer is still open, auto-save and auto-close it.
  // --------------------------------------------------------------------------

  const handleRestTimerDone = useCallback(() => {
    if (transitionLock.current || moveInFlightRef.current) return;
    transitionLock.current = true;
    console.log('[Engine] Rest timer hit 0', { isLogDrawerOpen });
    if (isLogDrawerOpen) {
      autoSaveTargetReps();
      setIsLogDrawerOpen(false);
    }
    setFadeIn(false);
    setTimeout(() => {
      moveToNextRef.current();
      setFadeIn(true);
    }, 100);
  }, [isLogDrawerOpen, autoSaveTargetReps]);

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
  // EFFECT — Reset mount shield whenever ACTIVE state begins (or set changes)
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (workoutState === 'ACTIVE') {
      lastActiveStartTime.current = Date.now();
      console.log('[Engine] Mount shield armed', { segment: currentSegmentIndex, exercise: currentExerciseIndex, set: currentSetIndex });
    }
  }, [workoutState, currentSegmentIndex, currentExerciseIndex, currentSetIndex]);

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

  /**
   * Total sets for the CURRENT exercise (not the segment).
   * Straight Sets: each exercise tracks its own set count.
   */
  const setsForCurrentExercise = useMemo(
    () => getSetsForExercise(activeExercise),
    [activeExercise, getSetsForExercise],
  );

  const isFollowAlongMode = useMemo(() => {
    const title = currentSegment?.title || '';
    if (title.includes('חימום') || title.toLowerCase().includes('warmup')) return true;
    if (title.includes('קירור') || title.toLowerCase().includes('cooldown')) return true;
    if (activeExercise?.exerciseRole === 'warmup' || activeExercise?.exerciseRole === 'cooldown') return true;
    return activeExercise?.isFollowAlong === true;
  }, [activeExercise, currentSegment]);

  const exerciseType = useMemo<'reps' | 'time' | 'follow-along'>(() => {
    if (isFollowAlongMode) return 'follow-along';
    if (activeExercise?.exerciseType === 'time') return 'time';
    if (activeExercise?.exerciseType === 'reps') return 'reps';
    if (currentSegment?.target?.type === 'reps') return 'reps';
    if (currentSegment?.target?.type === 'time') return 'time';
    if (activeExercise?.reps) return 'reps';
    if (activeExercise?.duration) return 'time';
    return 'reps';
  }, [activeExercise, currentSegment, isFollowAlongMode]);

  const isUnilateralTimed = activeExercise?.symmetry === 'unilateral' && exerciseType === 'time';

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

  const segmentRestTime = useMemo(() => {
    if (isFollowAlongMode) return 0;
    const exerciseRest = (activeExercise as any)?.restSeconds;
    if (typeof exerciseRest === 'number' && exerciseRest > 0) return exerciseRest;
    const segment = workout.segments[currentSegmentIndex];
    if (typeof segment?.restBetweenExercises === 'number') return segment.restBetweenExercises;
    return 90;
  }, [workout, currentSegmentIndex, isFollowAlongMode, activeExercise]);

  const exerciseDuration = useMemo(() => {
    if (exerciseType === 'time' || exerciseType === 'follow-along') {
      if (currentSegment?.target?.type === 'time') return currentSegment.target.value;
      const durationStr = activeExercise?.duration;
      if (durationStr) {
        const match = durationStr.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 30;
      }
      return 30;
    }
    return 0;
  }, [exerciseType, currentSegment, activeExercise]);

  /**
   * Strip round multiplier ("3x8" → "8", "3x6-8" → "6-8") before parsing.
   */
  const strippedReps = useMemo(() => {
    const raw = activeExercise?.reps;
    if (!raw) return raw;
    return raw.replace(/^\d+\s*[xX×]\s*/, '');
  }, [activeExercise]);

  const targetReps = useMemo(() => {
    if (exerciseType === 'reps') {
      // Exercise-level reps string takes priority — the generator sets the real range
      // (e.g. "8-12 חזרות"). The segment target is a generic fallback and must not override.
      if (strippedReps) {
        const match = strippedReps.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      }
      if (currentSegment?.target?.type === 'reps') return currentSegment.target.value;
    }
    return null;
  }, [exerciseType, currentSegment, strippedReps]);

  /**
   * Upper bound of the reps range.
   * Prefers the structured repsRange object from the exercise (set by WorkoutGenerator),
   * falls back to parsing the formatted string "8-12 חזרות".
   */
  const repsRangeMax = useMemo(() => {
    if (exerciseType !== 'reps') return null;
    // Prefer structured data from the engine
    const structured = (activeExercise as any)?.repsRange?.max as number | undefined;
    if (typeof structured === 'number') return structured;
    // Fall back to string parsing
    if (!strippedReps) return null;
    const match = strippedReps.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (!match) return null;
    return parseInt(match[2], 10);
  }, [exerciseType, activeExercise, strippedReps]);

  /**
   * Lower bound of the reps range — the strict minimum the user should hit.
   * Prefers the structured repsRange.min, falls back to targetReps (first number in string).
   */
  const repsRangeMin = useMemo(() => {
    if (exerciseType !== 'reps') return null;
    const structured = (activeExercise as any)?.repsRange?.min as number | undefined;
    if (typeof structured === 'number') return structured;
    return targetReps;
  }, [exerciseType, activeExercise, targetReps]);

  /**
   * Smart target: if the user hit targetReps on every set last session,
   * nudge them up by 1 (clamped to repsRangeMax). Otherwise stay at targetReps (= repsRange.min).
   */
  const dynamicTarget = useMemo(() => {
    if (targetReps === null) return null;
    if (!activeExercise || !exerciseHistoryMap) return targetReps;
    const lastReps = exerciseHistoryMap[activeExercise.id];
    if (!lastReps || lastReps.length === 0) return targetReps;
    const allHitTarget = lastReps.every((r) => r >= targetReps);
    if (!allHitTarget) return targetReps;
    const ceiling = repsRangeMax ?? targetReps;
    return Math.min(targetReps + 1, ceiling);
  }, [targetReps, activeExercise, exerciseHistoryMap, repsRangeMax]);

  const autoCompleteTime = useMemo(() => {
    if (exerciseType === 'time' && exerciseDuration > 0) {
      return exerciseDuration;
    }
    if (exerciseType === 'reps' && targetReps && targetReps > 0) {
      return Math.max(targetReps * 2.5 + 5, 10);
    }
    return 30;
  }, [exerciseType, targetReps, exerciseDuration]);

  /**
   * Total "steps" = sum of (sets per exercise) across all segments.
   * Each exercise contributes its own set count.
   */
  const totalExercises = useMemo(
    () =>
      workout.segments.reduce((total, segment) => {
        const exercises = getExercises(segment);
        if (!exercises) return total;
        return total + exercises.reduce((sum, ex) => sum + getSetsForExercise(ex), 0);
      }, 0),
    [workout, getExercises, getSetsForExercise],
  );

  const globalExerciseIndex = useMemo(() => {
    let index = 0;
    for (let i = 0; i < currentSegmentIndex; i++) {
      const exercises = getExercises(workout.segments[i]);
      if (exercises) {
        index += exercises.reduce((sum, ex) => sum + getSetsForExercise(ex), 0);
      }
    }
    const currentExercises = getExercises(currentSegment);
    if (currentExercises) {
      for (let j = 0; j < currentExerciseIndex; j++) {
        index += getSetsForExercise(currentExercises[j]);
      }
    }
    index += currentSetIndex;
    return index;
  }, [workout, currentSegmentIndex, currentExerciseIndex, currentSetIndex, currentSegment, getExercises, getSetsForExercise]);

  const progressBars = useMemo(
    () =>
      Array.from({ length: totalExercises }, (_, i) => ({
        isActive: i < globalExerciseIndex,
        isCurrent: i === globalExerciseIndex,
      })),
    [totalExercises, globalExerciseIndex],
  );

  const exerciseName = useMemo(() => activeExercise?.name || 'טוען...', [activeExercise]);

  const executionSteps = useMemo(() => {
    if (Array.isArray(activeExercise?.highlights)) return activeExercise!.highlights;
    if (Array.isArray(activeExercise?.instructions)) return activeExercise!.instructions;
    return [];
  }, [activeExercise]);

  const exerciseGoal = useMemo(
    () => activeExercise?.goal || activeExercise?.description || null,
    [activeExercise],
  );

  const muscleGroups = useMemo(() => {
    if (!activeExercise?.muscleGroups || !Array.isArray(activeExercise.muscleGroups)) {
      return { primary: [], secondary: [] };
    }
    return {
      primary: activeExercise.muscleGroups[0] ? [activeExercise.muscleGroups[0]] : [],
      secondary: activeExercise.muscleGroups.slice(1),
    };
  }, [activeExercise]);

  /**
   * Exhaustive media resolution (5-level search):
   * 1. exercise.videoUrl (pre-resolved by home/page.tsx)
   * 2. All execution_methods / methods — first mainVideoUrl or videoUrl
   * 3. exercise-level media.videoUrl / media.mainVideoUrl
   * 4. exercise.imageUrl (still-frame fallback)
   * 5. Firestore field aliases (coverImage, thumbnailUrl)
   */
  const exerciseVideoUrl = useMemo(() => {
    if (activeExercise?.videoUrl) return activeExercise.videoUrl;
    const raw = activeExercise as any;
    const methods = raw?.execution_methods || raw?.executionMethods || raw?.methods || [];
    for (const m of methods) {
      const url = m?.media?.mainVideoUrl || m?.media?.videoUrl;
      if (url) return url;
    }
    if (raw?.media?.videoUrl) return raw.media.videoUrl;
    if (raw?.media?.mainVideoUrl) return raw.media.mainVideoUrl;
    if (activeExercise?.imageUrl) return activeExercise.imageUrl;
    if (raw?.media?.imageUrl) return raw.media.imageUrl;
    if (raw?.coverImage) return raw.coverImage;
    if (raw?.thumbnailUrl) return raw.thumbnailUrl;

    const name = typeof activeExercise?.name === 'string'
      ? activeExercise.name
      : (raw?.name?.he || activeExercise?.id || 'unknown');
    console.error(`[Media FAIL] No media found for active exercise: ${name}`);
    return null;
  }, [activeExercise]);

  /**
   * nextExercise — Straight Sets prediction:
   * - If more sets remain for current exercise → same exercise (next set)
   * - Else if more exercises in segment → next exercise (set 1)
   * - Else → first exercise of next valid segment, or "סיום האימון"
   */
  const nextExercise = useMemo<NextExerciseInfo>(() => {
    const currentExercises = getExercises(currentSegment);
    let exercise: WorkoutExercise | null = null;

    const currentEx = currentExercises?.[currentExerciseIndex] ?? null;
    const setsForCurrent = getSetsForExercise(currentEx);

    // ── Superset: predict next based on pair position ──
    const pairedId = (currentEx as any)?.pairedWith as string | null | undefined;
    if (pairedId && currentExercises) {
      const pairedIndex = currentExercises.findIndex((e) => e.id === pairedId);
      if (pairedIndex !== -1) {
        const isFirstInPair = pairedIndex > currentExerciseIndex;
        if (isFirstInPair) {
          // On A → next is B (same round)
          exercise = currentExercises[pairedIndex];
        } else {
          // On B → if more rounds, next is A; else next after B
          if (currentSetIndex < setsForCurrent - 1) {
            exercise = currentExercises[pairedIndex]; // back to A
          } else {
            exercise = currentExercises[currentExerciseIndex + 1] ?? null;
            if (!exercise) {
              for (let i = currentSegmentIndex + 1; i < workout.segments.length; i++) {
                const nextExercises = getExercises(workout.segments[i]);
                if (nextExercises && nextExercises.length > 0) { exercise = nextExercises[0]; break; }
              }
            }
          }
        }
      }
    } else if (currentSetIndex < setsForCurrent - 1) {
      // ── Straight sets: more sets of same exercise ──
      exercise = currentEx;
    } else if (currentExercises && currentExerciseIndex + 1 < currentExercises.length) {
      exercise = currentExercises[currentExerciseIndex + 1];
    } else {
      for (let i = currentSegmentIndex + 1; i < workout.segments.length; i++) {
        const nextExercises = getExercises(workout.segments[i]);
        if (nextExercises && nextExercises.length > 0) {
          exercise = nextExercises[0];
          break;
        }
      }
    }

    const nextSteps: string[] = (() => {
      if (Array.isArray(exercise?.highlights)) return exercise!.highlights;
      if (Array.isArray(exercise?.instructions)) return exercise!.instructions;
      return [];
    })();

    const nextMuscles = (() => {
      if (!exercise?.muscleGroups || !Array.isArray(exercise.muscleGroups)) {
        return { primary: [] as string[], secondary: [] as string[] };
      }
      return {
        primary: exercise.muscleGroups[0] ? [exercise.muscleGroups[0]] : [],
        secondary: exercise.muscleGroups.slice(1),
      };
    })();

    const resolvedMedia = (() => {
      if (!exercise) return { video: null, image: null };
      const raw = exercise as any;
      const methods = raw.execution_methods || raw.executionMethods || [];
      let video = exercise.videoUrl || null;
      let image = exercise.imageUrl || null;
      if (!video || !image) {
        for (const m of methods) {
          if (!video) video = m?.media?.mainVideoUrl || m?.media?.videoUrl || null;
          if (!image) image = m?.media?.imageUrl || null;
        }
      }
      if (!image && raw.media?.imageUrl) image = raw.media.imageUrl;
      if (!image && video) image = video;
      return { video, image };
    })();

    return {
      name: exercise?.name || 'סיום האימון',
      videoUrl: resolvedMedia.video,
      imageUrl: resolvedMedia.image,
      equipment: exercise?.equipment || [],
      reps: exercise?.reps,
      duration: exercise?.duration,
      exerciseType: exercise?.exerciseType || 'reps',
      executionSteps: nextSteps,
      muscleGroups: nextMuscles,
      exerciseGoal: exercise?.goal || exercise?.description || null,
      notificationText: (() => {
        const methods =
          (exercise as any)?.execution_methods ||
          (exercise as any)?.executionMethods ||
          [];
        for (const m of methods) {
          const nt = m.notificationText;
          if (!nt) continue;
          if (typeof nt === 'string') return nt;
          // LocalizedText (current shape) — prefer he, fall back to en
          if (typeof nt.he === 'string' && nt.he.trim()) return nt.he as string;
          if (typeof nt.en === 'string' && nt.en.trim()) return nt.en as string;
          // Legacy GenderedText
          if (typeof nt.male === 'string' && nt.male.trim()) return nt.male as string;
          if (typeof nt.female === 'string' && nt.female.trim()) return nt.female as string;
        }
        return null;
      })(),
    };
  }, [workout, currentSegment, currentExerciseIndex, currentSegmentIndex, currentSetIndex, getSetsForExercise, getExercises]);

  const repsOrDurationText = useMemo(() => {
    if (exerciseType === 'time') return activeExercise?.duration || '';
    if (exerciseType === 'reps') return strippedReps || '';
    return '';
  }, [activeExercise, exerciseType, strippedReps]);

  /**
   * Last confirmed reps for the current exercise (most recent entry in the log).
   * Used by the picker to default to the last saved value on subsequent sets.
   */
  const lastSavedReps = useMemo(() => {
    if (!activeExercise) return null;
    const segId = workout.segments[currentSegmentIndex]?.id || String(currentSegmentIndex);
    const entry = exerciseLogRef.current.find(
      (e) => e.exerciseId === activeExercise.id && e.segmentId === segId,
    );
    if (entry && entry.confirmedReps.length > 0) {
      return entry.confirmedReps[entry.confirmedReps.length - 1];
    }
    return null;
  }, [activeExercise, workout.segments, currentSegmentIndex, currentSetIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const isSupersetActive = useMemo(() => {
    if (!activeExercise) return false;
    return !!(activeExercise as any)?.pairedWith;
  }, [activeExercise]);

  const supersetPartnerName = useMemo(() => {
    if (!isSupersetActive || !activeExercise) return null;
    const pairedId = (activeExercise as any)?.pairedWith as string;
    const currentExercises = getExercises(currentSegment);
    const partner = currentExercises?.find((e) => e.id === pairedId);
    return partner?.name || null;
  }, [isSupersetActive, activeExercise, currentSegment, getExercises]);

  // --------------------------------------------------------------------------
  // CALLBACKS — State Machine Transitions
  // --------------------------------------------------------------------------

  /**
   * Exercise complete — triggered by FillingButton auto-fill or manual tap.
   *
   * For reps/time exercises:
   *   1. Enter RESTING state
   *   2. Start rest timer immediately
   *   3. Open log drawer
   *
   * For follow-along: skip rest and advance directly.
   */
  const handleExerciseComplete = useCallback(
    (reps?: number) => {
      console.trace('[Engine] handleExerciseComplete called by:');

      if (transitionLock.current) {
        console.warn('[Engine] BLOCKED — lock is engaged');
        return;
      }

      const msSinceActive = Date.now() - lastActiveStartTime.current;
      if (msSinceActive < 800) {
        console.warn(`[Engine] BLOCKED — mount shield (${msSinceActive}ms since ACTIVE start)`);
        return;
      }

      transitionLock.current = true;
      console.log('[Engine] Lock ENGAGED — exercise complete', {
        exerciseType,
        segmentRestTime,
        exercise: activeExercise?.name,
        msSinceActive,
      });

      switch (exerciseType) {
        case 'follow-along': {
          if (activeExercise) {
            const followAlongReps = reps ?? targetReps ?? exerciseDuration ?? 30;
            const existing = exerciseLogRef.current.find(
              (e) => e.exerciseId === activeExercise.id,
            );
            if (existing) {
              existing.confirmedReps.push(followAlongReps);
            } else {
              exerciseLogRef.current.push({
                exerciseId: activeExercise.id,
                exerciseName: activeExercise.name,
                segmentId:
                  workout.segments[currentSegmentIndex]?.id || String(currentSegmentIndex),
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

            setIsLogDrawerOpen(true);
            setFadeIn(false);
            setTimeout(() => {
              setWorkoutState('RESTING');
              setFadeIn(true);
              transitionLock.current = false;
              console.log(`[Engine] Unilateral timed: Both sides done (R:${rightElapsed}s L:${leftElapsed}s) → RESTING`);
            }, 150);
            break;
          }

          // ── Normal (bilateral / reps) flow ───────────────────────────
          const defaultVal = exerciseType === 'time'
            ? (reps ?? exerciseDuration ?? 30)
            : (reps ?? targetReps ?? 0);
          setCompletedReps(defaultVal);

          setIsLogDrawerOpen(true);
          setFadeIn(false);
          setTimeout(() => {
            setWorkoutState('RESTING');
            setFadeIn(true);
            transitionLock.current = false;
            console.log('[Engine] → RESTING + drawer open (rest timer deferred to Save)');
          }, 150);
          break;
        }
      }
    },
    [
      exerciseType,
      segmentRestTime,
      targetReps,
      exerciseDuration,
      activeExercise,
      currentSegmentIndex,
      workout.segments,
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

      if (forceSkipRest || segmentRestTime <= 0) {
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
          setRestTimeLeft(segmentRestTime);
          setFadeIn(true);
          console.log(`[Engine] Rest timer started: ${segmentRestTime}s | workoutState → RESTING`);
        }, 100);
      }
    },
    [activeExercise, workout.segments, currentSegmentIndex, targetReps, bumpLog, segmentRestTime, setRestTimeLeft],
  );

  /**
   * Skip rest — auto-saves reps if drawer is still open, advances immediately.
   */
  const skipRest = useCallback(() => {
    if (transitionLock.current) {
      console.warn('[Engine] skipRest BLOCKED');
      return;
    }
    transitionLock.current = true;

    if (isLogDrawerOpen) {
      autoSaveTargetReps();
      setIsLogDrawerOpen(false);
    }

    setFadeIn(false);
    setTimeout(() => {
      moveToNextRef.current();
      setFadeIn(true);
    }, 150);
  }, [isLogDrawerOpen, autoSaveTargetReps]);

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

  const getExerciseLog = useCallback(
    (): ExerciseResultLog[] => [...exerciseLogRef.current],
    [],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exerciseLogSnapshot = useMemo(
    () => exerciseLogRef.current.map(e => ({ ...e, confirmedReps: [...e.confirmedReps] })),
    [logVersion],
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
    nextExercise,
    repsOrDurationText,
    currentRound: currentSetIndex + 1,
    totalRounds: setsForCurrentExercise,
    lastSavedReps,
    isSupersetActive,
    supersetPartnerName,

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
