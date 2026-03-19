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

  blockId: string | undefined;
  blockType: WorkoutBlockType | undefined;

  handleExerciseComplete: (reps?: number) => void;
  /** Saves reps AND closes the drawer. The rest timer is NOT touched. */
  handleRepetitionSave: (reps: number) => void;
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
): WorkoutStateMachineResult {
  // --------------------------------------------------------------------------
  // REFS
  // --------------------------------------------------------------------------

  const transitionLock = useRef(false);
  const prevIndicesRef = useRef({ segment: 0, exercise: 0, set: 0 });
  const workoutIdRef = useRef(workout.id);
  const exerciseLogRef = useRef<ExerciseResultLog[]>([]);
  const [logVersion, setLogVersion] = useState(0);
  const bumpLog = useCallback(() => setLogVersion(v => v + 1), []);
  const lastActiveStartTime = useRef<number>(Date.now());

  // --------------------------------------------------------------------------
  // STATE
  // --------------------------------------------------------------------------

  const [workoutState, setWorkoutState] = useState<WorkoutState>('PREPARING');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [completedReps, setCompletedReps] = useState<number | null>(null);
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
   * Straight Sets: A(1/3) → A(2/3) → A(3/3) → B(1/2) → B(2/2) → C …
   * Reads currentSetRef (not the stale closure) to prevent double-increment.
   * Re-entry guard (moveInFlightRef) prevents timer/skip overlap from double-firing.
   */
  const moveToNext = useCallback(() => {
    if (moveInFlightRef.current) {
      console.warn('[Engine] moveToNext BLOCKED — already in flight');
      return;
    }
    moveInFlightRef.current = true;

    const setIdx = currentSetRef.current;
    console.log('[Engine] moveToNext called (straight sets)', { currentSegmentIndex, setIdx });

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
    console.log('[Engine] Rest timer hit 0', { isLogDrawerOpen });
    if (isLogDrawerOpen) {
      autoSaveTargetReps();
      setIsLogDrawerOpen(false);
    }
    transitionLock.current = false;
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
      if (currentSegment?.target?.type === 'reps') return currentSegment.target.value;
      if (strippedReps) {
        const match = strippedReps.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      }
    }
    return null;
  }, [exerciseType, currentSegment, strippedReps]);

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

  const exerciseVideoUrl = useMemo(
    () => activeExercise?.videoUrl || activeExercise?.imageUrl || null,
    [activeExercise],
  );

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

    if (currentSetIndex < setsForCurrent - 1) {
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

    return {
      name: exercise?.name || 'סיום האימון',
      videoUrl: exercise?.videoUrl || null,
      imageUrl: exercise?.imageUrl || exercise?.videoUrl || null,
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
          if (m.notificationText) {
            if (typeof m.notificationText === 'string') return m.notificationText;
            if (m.notificationText.male) return m.notificationText.male as string;
          }
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
          const defaultVal = exerciseType === 'time'
            ? (reps ?? exerciseDuration ?? 30)
            : (reps ?? targetReps ?? 0);
          setCompletedReps(defaultVal);

          // Start rest timer and enter RESTING with drawer open — simultaneously
          setRestTimeLeft(segmentRestTime);
          setIsLogDrawerOpen(true);
          setFadeIn(false);
          setTimeout(() => {
            setWorkoutState('RESTING');
            setFadeIn(true);
            transitionLock.current = false;
            console.log('[Engine] → RESTING + drawer open');
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
      setRestTimeLeft,
    ],
  );

  /**
   * Manual save from the log drawer.
   * Saves reps, closes the drawer. The rest timer continues uninterrupted.
   * Fix #2: restTimeLeft is NOT modified here.
   */
  const handleRepetitionSave = useCallback(
    (reps: number, sideData?: { left: number; right: number }) => {
      setCompletedReps(reps);

      if (activeExercise) {
        const segId =
          workout.segments[currentSegmentIndex]?.id || String(currentSegmentIndex);
        const existing = exerciseLogRef.current.find(
          (e) => e.exerciseId === activeExercise.id && e.segmentId === segId,
        );
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
      }

      // Close drawer — rest timer continues
      setIsLogDrawerOpen(false);
    },
    [activeExercise, workout.segments, currentSegmentIndex, targetReps, bumpLog],
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

    activeExercise,
    currentSegment,
    exerciseType,
    isFollowAlongMode,
    segmentRestTime,
    exerciseDuration,
    targetReps,
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
