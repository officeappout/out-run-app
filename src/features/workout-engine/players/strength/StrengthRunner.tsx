'use client';

/**
 * StrengthRunner
 * Production-Ready Workout Engine - State Machine Orchestrator
 * 
 * TRANSITION RULES:
 * - PREPARING only at workout start (segment 0, exercise 0)
 * - Rest ends -> Go directly to ACTIVE (no intermediate screens)
 * - Skip rest -> Go directly to ACTIVE
 * 
 * SINGLE SOURCE OF TRUTH:
 * - All exercise data derived DIRECTLY from workout prop
 * - activeExercise computed via useMemo from workout.segments
 * 
 * HARD-LOCK PATTERN:
 * - transitionLock engaged on any trigger
 * - Lock ONLY released via useEffect when indices change
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Pause, Play, List } from 'lucide-react';
import { motion, useMotionValue, useDragControls } from 'framer-motion';
import { WorkoutPlan, WorkoutSegment, Exercise as WorkoutExercise } from '@/features/parks';
import RepetitionPicker from './components/RepetitionPicker';
import HorizontalPicker from './components/HorizontalPicker';
import WorkoutStoryBars from './components/WorkoutStoryBars';
import ExerciseVideoPlayer from './components/ExerciseVideoPlayer';
import ExerciseDetailsSheet from './components/ExerciseDetailsSheet';
import RestScreen from './components/RestScreen';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default rest time between exercises (seconds) */
const DEFAULT_REST_TIME = 10;

/** Preparation countdown duration (seconds) - only at workout start */
const PREPARATION_COUNTDOWN = 3;

// ============================================================================
// TYPES
// ============================================================================

/** Workout state machine states */
type WorkoutState = 'PREPARING' | 'ACTIVE' | 'REPETITION_PICKER' | 'TRANSITION' | 'PAUSED';

interface StrengthRunnerProps {
  workout: WorkoutPlan;
  onComplete?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function StrengthRunner({
  workout,
  onComplete,
  onPause,
  onResume,
}: StrengthRunnerProps) {
  // ==========================================================================
  // REFS - HARD LOCK PATTERN
  // ==========================================================================
  
  const transitionLock = useRef(false);
  const prevIndicesRef = useRef({ segment: 0, exercise: 0 });
  const workoutIdRef = useRef(workout.id);
  
  // ==========================================================================
  // REFS - Audio for countdown beeps
  // ==========================================================================
  
  // Short beep (300Hz, 100ms) - Base64 encoded WAV
  const shortBeepRef = useRef<HTMLAudioElement | null>(null);
  // Long beep (500Hz, 300ms) - Base64 encoded WAV  
  const longBeepRef = useRef<HTMLAudioElement | null>(null);
  
  // Initialize audio elements on mount
  useEffect(() => {
    // Create short beep audio (300Hz tone, 100ms)
    const shortBeep = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' + 
      'tvT19' + 'A'.repeat(100));
    shortBeep.volume = 0.3;
    shortBeepRef.current = shortBeep;
    
    // Create long beep audio (500Hz tone, 300ms)
    const longBeep = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU' + 
      'tvT19' + 'A'.repeat(300));
    longBeep.volume = 0.5;
    longBeepRef.current = longBeep;
    
    // Fallback: Use Web Audio API for actual beeps
    const audioContext = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;
    
    if (audioContext) {
      // Create beep function using Web Audio API
      const playBeep = (frequency: number, duration: number, volume: number) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gainNode.gain.value = volume;
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration / 1000);
      };
      
      // Override audio refs with Web Audio functions
      (shortBeepRef as any).playBeep = () => playBeep(400, 100, 0.3);
      (longBeepRef as any).playBeep = () => playBeep(600, 300, 0.5);
    }
    
    return () => {
      if (audioContext) {
        audioContext.close();
      }
    };
  }, []);

  // ==========================================================================
  // STATE
  // ==========================================================================
  
  const [workoutState, setWorkoutState] = useState<WorkoutState>('PREPARING');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [preparationCountdown, setPreparationCountdown] = useState(PREPARATION_COUNTDOWN);
  const [restDuration, setRestDuration] = useState(DEFAULT_REST_TIME);
  const [restTimeLeft, setRestTimeLeft] = useState(DEFAULT_REST_TIME); // Live countdown
  const [isPaused, setIsPaused] = useState(false);
  const [completedReps, setCompletedReps] = useState<number | null>(null);
  const [fadeIn, setFadeIn] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);

  // Drag controls for curtain effect
  const curtainY = useMotionValue(0);
  const curtainDragControls = useDragControls();

  // ==========================================================================
  // EFFECT - HARD LOCK RELEASE
  // ==========================================================================

  useEffect(() => {
    const prev = prevIndicesRef.current;
    const hasChanged = 
      prev.segment !== currentSegmentIndex || 
      prev.exercise !== currentExerciseIndex;

    if (hasChanged) {
      console.log('[Engine] Index changed - releasing lock', {
        from: prev,
        to: { segment: currentSegmentIndex, exercise: currentExerciseIndex },
      });
      
      prevIndicesRef.current = { 
        segment: currentSegmentIndex, 
        exercise: currentExerciseIndex 
      };
      
      requestAnimationFrame(() => {
        transitionLock.current = false;
        console.log('[Engine] Lock Released');
      });
    }
  }, [currentSegmentIndex, currentExerciseIndex]);

  // ==========================================================================
  // EFFECT - Workout Plan ID Change Detection
  // ==========================================================================

  useEffect(() => {
    if (workout.id !== workoutIdRef.current) {
      console.log('[StrengthRunner] Workout plan ID changed, resetting state');
      workoutIdRef.current = workout.id;
      setCurrentSegmentIndex(0);
      setCurrentExerciseIndex(0);
      setWorkoutState('PREPARING');
      prevIndicesRef.current = { segment: 0, exercise: 0 };
      transitionLock.current = false;
    }
  }, [workout.id]);
  
  // ==========================================================================
  // HELPERS - Exercise Access
  // ==========================================================================

  const getExercises = useCallback((segment: WorkoutSegment | undefined): WorkoutExercise[] | null => {
    if (!segment) return null;
    
    const seg = segment as any;
    if (Array.isArray(seg.exercises)) return seg.exercises;
    if (Array.isArray(seg.items)) return seg.items;
    if (Array.isArray(seg.list)) return seg.list;
    if (Array.isArray(seg.workout_exercises)) return seg.workout_exercises;
    if (Array.isArray(seg.workoutExercises)) return seg.workoutExercises;
    
    return null;
  }, []);

  const findNextValidSegmentIndex = useCallback((startIndex: number): number | null => {
    for (let i = startIndex; i < workout.segments.length; i++) {
      const segment = workout.segments[i];
      const exercises = getExercises(segment);
      if (exercises && exercises.length > 0) {
        return i;
      }
    }
    return null;
  }, [workout.segments, getExercises]);

  // ==========================================================================
  // MEMOIZED VALUES - DERIVED FROM workout PROP
  // ==========================================================================

  const activeExercise = useMemo(() => {
    const segment = workout.segments[currentSegmentIndex];
    const exercises = getExercises(segment);
    const exercise = exercises?.[currentExerciseIndex] || null;
    console.log('[Engine] activeExercise computed', { 
      segment: currentSegmentIndex, 
      exercise: currentExerciseIndex,
      name: exercise?.name 
    });
    return exercise;
  }, [workout, currentSegmentIndex, currentExerciseIndex, getExercises]);

  const currentSegment = useMemo(() => {
    return workout.segments[currentSegmentIndex];
  }, [workout, currentSegmentIndex]);

  const isFollowAlongMode = useMemo(() => {
    const segmentTitle = currentSegment?.title || '';
    if (segmentTitle.includes('חימום') || segmentTitle.toLowerCase().includes('warmup')) {
      return true;
    }
    if (segmentTitle.includes('קירור') || segmentTitle.toLowerCase().includes('cooldown')) {
      return true;
    }
    if (activeExercise?.exerciseRole === 'warmup' || activeExercise?.exerciseRole === 'cooldown') {
      return true;
    }
    if (activeExercise?.isFollowAlong === true) {
      return true;
    }
    return false;
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
    const segment = workout.segments[currentSegmentIndex];
    if (isFollowAlongMode) {
      return segment?.restBetweenExercises ?? 0;
    }
    return segment?.restBetweenExercises ?? DEFAULT_REST_TIME;
  }, [workout, currentSegmentIndex, isFollowAlongMode]);

  const exerciseDuration = useMemo(() => {
    if (exerciseType === 'time' || exerciseType === 'follow-along') {
      if (currentSegment?.target?.type === 'time') {
        return currentSegment.target.value;
      }
      const durationStr = activeExercise?.duration;
      if (durationStr) {
        const match = durationStr.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 30;
      }
      return 30;
    }
    return 0;
  }, [exerciseType, currentSegment, activeExercise]);

  const targetReps = useMemo(() => {
    if (exerciseType === 'reps') {
      if (currentSegment?.target?.type === 'reps') {
        return currentSegment.target.value;
      }
      const repsStr = activeExercise?.reps;
      if (repsStr) {
        const match = repsStr.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      }
    }
    return null;
  }, [exerciseType, currentSegment, activeExercise]);

  const autoCompleteTime = useMemo(() => {
    if (exerciseType === 'reps' && targetReps) {
      const timePerRep = 2;
      const buffer = 5;
      return targetReps * timePerRep + buffer;
    }
    return 30;
  }, [exerciseType, targetReps]);

  const totalExercises = useMemo(() => {
    return workout.segments.reduce((total, segment) => {
      const exercises = getExercises(segment);
      return total + (exercises?.length || 0);
    }, 0);
  }, [workout, getExercises]);

  const globalExerciseIndex = useMemo(() => {
    let index = 0;
    for (let i = 0; i < currentSegmentIndex; i++) {
      const exercises = getExercises(workout.segments[i]);
      index += exercises?.length || 0;
    }
    return index + currentExerciseIndex;
  }, [workout, currentSegmentIndex, currentExerciseIndex, getExercises]);

  const progressBars = useMemo(() => {
    return Array.from({ length: totalExercises }, (_, index) => ({
      isActive: index < globalExerciseIndex,
      isCurrent: index === globalExerciseIndex,
    }));
  }, [totalExercises, globalExerciseIndex]);

  const exerciseName = useMemo(() => {
    return activeExercise?.name || 'טוען...';
  }, [activeExercise]);

  const executionSteps = useMemo(() => {
    if (activeExercise?.highlights && Array.isArray(activeExercise.highlights)) {
      return activeExercise.highlights;
    }
    if (activeExercise?.instructions && Array.isArray(activeExercise.instructions)) {
      return activeExercise.instructions;
    }
    return [];
  }, [activeExercise]);

  const exerciseGoal = useMemo(() => {
    return activeExercise?.goal || activeExercise?.description || null;
  }, [activeExercise]);

  const muscleGroups = useMemo(() => {
    if (!activeExercise?.muscleGroups || !Array.isArray(activeExercise.muscleGroups)) {
      return { primary: [], secondary: [] };
    }
    const primary = activeExercise.muscleGroups[0] ? [activeExercise.muscleGroups[0]] : [];
    const secondary = activeExercise.muscleGroups.slice(1);
    return { primary, secondary };
  }, [activeExercise]);

  const exerciseVideoUrl = useMemo(() => {
    return activeExercise?.videoUrl || activeExercise?.imageUrl || null;
  }, [activeExercise]);
  
  /**
   * Next Exercise - Comprehensive resolver for the upcoming exercise
   * Used in REPETITION_PICKER and TRANSITION states
   * Extracts: name, videoUrl, imageUrl, equipment, reps, duration, exerciseType
   */
  const nextExercise = useMemo(() => {
    const currentExercises = getExercises(currentSegment);
    const nextExIndex = currentExerciseIndex + 1;
    let exercise: WorkoutExercise | null = null;

    // Check next exercise in current segment
    if (currentExercises && nextExIndex < currentExercises.length) {
      exercise = currentExercises[nextExIndex];
    } else {
      // Find first exercise in next valid segment
      for (let i = currentSegmentIndex + 1; i < workout.segments.length; i++) {
        const nextExercises = getExercises(workout.segments[i]);
        if (nextExercises && nextExercises.length > 0) {
          exercise = nextExercises[0];
          break;
        }
      }
    }

    return {
      name: exercise?.name || 'התרגיל הבא',
      videoUrl: exercise?.videoUrl || null,
      imageUrl: exercise?.imageUrl || exercise?.videoUrl || null,
      equipment: exercise?.equipment || [],
      reps: exercise?.reps,
      duration: exercise?.duration,
      exerciseType: exercise?.exerciseType || 'reps',
    };
  }, [workout, currentSegment, currentExerciseIndex, currentSegmentIndex, getExercises]);

  /**
   * Reps or Duration text - smart derivation based on exerciseType
   * Prevents showing "12 reps" for time-based exercises like Plank
   */
  const repsOrDurationText = useMemo(() => {
    if (exerciseType === 'time') return activeExercise?.duration || '';
    if (exerciseType === 'reps') return activeExercise?.reps || '';
    return ''; // Don't show anything for follow-along
  }, [activeExercise, exerciseType]);

  // nextExerciseVideoUrl is now derived from nextExercise.videoUrl

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // ==========================================================================
  // CORE LOGIC - State Machine Transitions
  // ==========================================================================

  /**
   * Move to next exercise or segment
   * Rule: After rest ends -> Go directly to ACTIVE (no PREPARING screen)
   */
  const moveToNext = useCallback((skipRest: boolean = false) => {
    console.log('[Engine] moveToNext called', { skipRest, currentSegmentIndex });
    
      setCurrentExerciseIndex((prevExerciseIndex) => {
      const currentSeg = workout.segments[currentSegmentIndex];
      const exercises = getExercises(currentSeg);
      
      if (!exercises || exercises.length === 0) {
          const nextValidSegmentIdx = findNextValidSegmentIndex(currentSegmentIndex + 1);
          if (nextValidSegmentIdx !== null) {
            setCurrentSegmentIndex(nextValidSegmentIdx);
          const nextSegment = workout.segments[nextValidSegmentIdx];
          const nextRestTime = nextSegment?.restBetweenExercises ?? DEFAULT_REST_TIME;
          
          if (!skipRest && nextRestTime > 0) {
            setRestDuration(nextRestTime);
            setWorkoutState('TRANSITION');
        } else {
            // Go directly to ACTIVE - no intermediate PREPARING
            setWorkoutState('ACTIVE');
          }
        } else {
          // Defer onComplete to avoid "cannot update during render" warning
          setTimeout(() => onComplete?.(), 0);
          }
          return 0;
        }

        if (prevExerciseIndex < exercises.length - 1) {
        // Moving to next exercise in same segment
        if (!skipRest && segmentRestTime > 0) {
          setRestDuration(segmentRestTime);
          setWorkoutState('TRANSITION');
        } else {
          // Go directly to ACTIVE - no intermediate PREPARING
          setWorkoutState('ACTIVE');
        }
          return prevExerciseIndex + 1;
        } else {
          // Last exercise in segment, move to next valid segment
          const nextValidSegmentIdx = findNextValidSegmentIndex(currentSegmentIndex + 1);
          if (nextValidSegmentIdx !== null) {
            setCurrentSegmentIndex(nextValidSegmentIdx);
          const nextSegment = workout.segments[nextValidSegmentIdx];
          const nextRestTime = nextSegment?.restBetweenExercises ?? DEFAULT_REST_TIME;
          
          if (!skipRest && nextRestTime > 0) {
            setRestDuration(nextRestTime);
            setWorkoutState('TRANSITION');
          } else {
            // Go directly to ACTIVE - no intermediate PREPARING
            setWorkoutState('ACTIVE');
          }
        } else {
            // Defer onComplete to avoid "cannot update during render" warning
            setTimeout(() => onComplete?.(), 0);
          }
        return 0;
        }
      });
  }, [workout, currentSegmentIndex, getExercises, findNextValidSegmentIndex, segmentRestTime, onComplete]);

  /**
   * CENTRAL HANDLER - Exercise Complete
   */
  const handleExerciseComplete = useCallback((reps?: number) => {
    if (transitionLock.current) {
      console.warn('[Engine] BLOCKED - Lock is engaged');
        return;
      }
    
    transitionLock.current = true;
    console.log('[Engine] Lock ENGAGED for exercise complete');

    console.log('[Engine] handleExerciseComplete', {
      exerciseType,
      segmentRestTime,
      isFollowAlongMode,
      segment: currentSegmentIndex,
      exercise: currentExerciseIndex,
      exerciseName: activeExercise?.name,
    });

    switch (exerciseType) {
      case 'follow-along':
        console.log('[Engine] Follow-along complete - skipping rest');
      setFadeIn(false);
        setTimeout(() => {
          moveToNext(true);
          setFadeIn(true);
        }, 150);
        break;

      case 'time':
        // Time exercises also show picker (for user to confirm/adjust seconds)
        console.log('[Engine] Time exercise complete - showing picker');
        setCompletedReps(reps ?? exerciseDuration ?? 30);
        // Start rest countdown immediately
        setRestTimeLeft(segmentRestTime);
        setFadeIn(false);
      setTimeout(() => {
          setWorkoutState('REPETITION_PICKER');
          setFadeIn(true);
          transitionLock.current = false;
          console.log('[Engine] Lock released for time picker');
        }, 150);
        break;

      case 'reps':
        console.log('[Engine] Reps exercise complete - showing picker');
        setCompletedReps(reps ?? targetReps ?? 0);
        // Start rest countdown immediately
        setRestTimeLeft(segmentRestTime);
        setFadeIn(false);
        setTimeout(() => {
          setWorkoutState('REPETITION_PICKER');
            setFadeIn(true);
          transitionLock.current = false;
          console.log('[Engine] Lock released for picker');
        }, 150);
        break;
    }
  }, [exerciseType, segmentRestTime, isFollowAlongMode, targetReps, moveToNext, currentSegmentIndex, currentExerciseIndex, activeExercise]);

  /**
   * Handle repetition picker save
   */
  const handleRepetitionSave = useCallback((reps: number) => {
    if (transitionLock.current) {
      console.warn('[Engine] handleRepetitionSave BLOCKED');
        return;
      }

    transitionLock.current = true;
    console.log('[Engine] Lock ENGAGED for rep save');
      setCompletedReps(reps);
      setFadeIn(false);
      
      setTimeout(() => {
      if (segmentRestTime === 0) {
        moveToNext(true);
        } else {
        moveToNext(false);
        }
            setFadeIn(true);
    }, 150);
  }, [segmentRestTime, moveToNext]);
  
  /**
   * Skip rest and proceed to next exercise
   * Rule: Go directly to ACTIVE (no PREPARING)
   */
  const skipRest = useCallback(() => {
    if (transitionLock.current) {
      console.warn('[Engine] skipRest BLOCKED');
      return;
    }
    transitionLock.current = true;
    console.log('[Engine] Lock ENGAGED for skip rest');

    setFadeIn(false);
    setTimeout(() => {
      // Go directly to ACTIVE - no intermediate PREPARING
      setWorkoutState('ACTIVE');
          setFadeIn(true);
      transitionLock.current = false;
      console.log('[Engine] Lock released after skip rest -> ACTIVE');
    }, 150);
  }, []);

  /**
   * Handle rest screen complete (timer ended)
   * Rule: Go directly to ACTIVE (no PREPARING)
   */
  const handleRestComplete = useCallback(() => {
    if (transitionLock.current) {
      console.warn('[Engine] handleRestComplete BLOCKED');
      return;
    }
    transitionLock.current = true;
    console.log('[Engine] Lock ENGAGED for rest complete (timer ended)');

    setFadeIn(false);
    setTimeout(() => {
      // Go directly to ACTIVE - no intermediate PREPARING
      setWorkoutState('ACTIVE');
      setFadeIn(true);
      transitionLock.current = false;
      console.log('[Engine] Lock released after rest complete -> ACTIVE');
    }, 150);
  }, []);

  /**
   * Toggle pause state
   */
  const togglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      onResume?.();
    } else {
      setIsPaused(true);
      onPause?.();
      }
  }, [isPaused, onPause, onResume]);

  // ==========================================================================
  // EFFECTS - Timers
  // ==========================================================================

  useEffect(() => {
    if (isPaused || workoutState === 'PAUSED') return;

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);

      // PREPARING countdown only at workout start
      if (workoutState === 'PREPARING') {
        setPreparationCountdown((prev) => {
          if (prev <= 1) {
            setWorkoutState('ACTIVE');
            return PREPARATION_COUNTDOWN;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, workoutState]);

  // ==========================================================================
  // EFFECT - Rest Countdown Timer with Audio Cues
  // Counts down during REPETITION_PICKER and TRANSITION states
  // Plays short beep at 3 and 2 seconds, long beep at 1 second
  // ==========================================================================
  
  useEffect(() => {
    // Only countdown during picker and transition states
    if (workoutState !== 'REPETITION_PICKER' && workoutState !== 'TRANSITION') return;
    if (isPaused) return;
    if (restTimeLeft <= 0) return;

    const interval = setInterval(() => {
      setRestTimeLeft((prev) => {
        const newValue = prev - 1;
        
        // Play countdown sounds
        if (newValue === 3 || newValue === 2) {
          // Short beep at 3 and 2 seconds
          if ((shortBeepRef as any).playBeep) {
            (shortBeepRef as any).playBeep();
          } else if (shortBeepRef.current) {
            shortBeepRef.current.currentTime = 0;
            shortBeepRef.current.play().catch(() => {});
          }
        } else if (newValue === 1) {
          // Long beep at 1 second
          if ((longBeepRef as any).playBeep) {
            (longBeepRef as any).playBeep();
          } else if (longBeepRef.current) {
            longBeepRef.current.currentTime = 0;
            longBeepRef.current.play().catch(() => {});
          }
        }
        
        if (newValue <= 0) return 0;
        return newValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [workoutState, isPaused, restTimeLeft]);

  // ==========================================================================
  // RENDER - Compute state-specific content
  // ==========================================================================

  // Picker values (computed here to avoid re-computation in render)
  const isTimeExercise = activeExercise?.exerciseType === 'time';
  const pickerTargetValue = isTimeExercise ? exerciseDuration : (targetReps || 12);
  const pickerUnitType = isTimeExercise ? 'time' : 'reps';
  const pickerMax = isTimeExercise ? 120 : (targetReps ? targetReps * 2 : 50);

  // Render state-specific content
  const renderStateContent = () => {
    // PREPARING State
  if (workoutState === 'PREPARING') {
    return (
      <div
          className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-300 ${
          fadeIn ? 'opacity-100' : 'opacity-0'
        }`}
      >
          {/* Blurred Background - ONLY appears in PREPARING state */}
          {(exerciseVideoUrl || activeExercise?.imageUrl) && (
            <div className="absolute inset-0">
              {activeExercise?.imageUrl ? (
                <img
                  src={activeExercise.imageUrl}
                  alt=""
                  className="w-full h-full object-cover blur-2xl scale-110 opacity-30"
                />
              ) : exerciseVideoUrl ? (
            <video
              src={exerciseVideoUrl}
                  className="w-full h-full object-cover blur-2xl scale-110 opacity-30"
              autoPlay
              loop
              muted
              playsInline
            />
              ) : null}
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-black/50" />
          </div>
        )}
        
        <div className="relative z-10 text-center">
          <div
            className="text-8xl font-bold text-white mb-4"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {preparationCountdown}
          </div>
          <p className="text-xl text-white/80" style={{ fontFamily: 'var(--font-simpler)' }}>
            מתכוננים...
          </p>
            <p className="text-lg text-white/60 mt-4" style={{ fontFamily: 'var(--font-simpler)' }}>
              {exerciseName}
          </p>
        </div>
      </div>
    );
  }

    // REPETITION_PICKER State
  if (workoutState === 'REPETITION_PICKER') {
    return (
      <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-300 ${
          fadeIn ? 'opacity-100' : 'opacity-0'
        }`}
      >
          {/* Video Player showing NEXT exercise (Current + 1) */}
          <ExerciseVideoPlayer
            key={`picker-video-${currentSegmentIndex}-${currentExerciseIndex}`}
            exerciseId={`next-${currentExerciseIndex}`}
            videoUrl={nextExercise.videoUrl}
            exerciseName={nextExercise.name}
            exerciseType="reps"
            isPaused={false}
          />

          {/* Next Exercise Header Overlay */}
          <div className="absolute top-0 left-0 right-0 z-50 pt-14 px-6 pb-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
            <p 
              className="text-sm text-white/70 uppercase tracking-wider mb-1 text-center"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              התרגיל הבא
            </p>
            <h2 
              className="text-2xl font-bold text-white text-center mb-2"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {nextExercise.name}
            </h2>
            {/* Equipment Badge - Only show if equipment exists */}
            {nextExercise.equipment.length > 0 && (
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#00B4FF]/20 border border-[#00B4FF]/40 rounded-full">
                  <span className="text-sm text-[#00B4FF] font-medium" style={{ fontFamily: 'var(--font-simpler)' }}>
                    {nextExercise.equipment[0]}
                  </span>
                </div>
              </div>
            )}
        </div>

          {/* Floating Rest Timer - live countdown above picker card */}
          <div className="absolute bottom-[27%] left-1/2 -translate-x-1/2 z-50">
            <div className="bg-black/70 backdrop-blur-md rounded-full px-5 py-2.5 border border-white/20">
              <div className="flex items-center gap-2">
                <span className="text-white/60 text-xs" style={{ fontFamily: 'var(--font-simpler)' }}>
                  מנוחה:
                </span>
                <span 
                  className="text-white font-bold text-lg tracking-tight tabular-nums"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {formatTime(restTimeLeft)}
                </span>
              </div>
            </div>
          </div>

          {/* Compact Bottom Sheet with Picker - max 25% screen height */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#0F172A] rounded-t-[24px] px-4 pt-3 pb-5 shadow-2xl max-h-[25vh]"
            dir="rtl"
          >
            {/* Question - Ultra Compact */}
            <h2 
              className="text-base font-bold text-slate-900 dark:text-white text-center mb-0.5"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              {pickerUnitType === 'time' ? 'כמה שניות החזקת?' : 'כמה חזרות עשית?'}
            </h2>
            
            {/* Target Info - Ultra Compact */}
            <p 
              className="text-[11px] text-slate-500 dark:text-zinc-400 text-center mb-1"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              יעד: {pickerTargetValue} {pickerUnitType === 'reps' ? 'חזרות' : 'שניות'}
            </p>

            {/* Horizontal Picker */}
            <HorizontalPicker
              min={0}
              max={pickerMax}
              targetValue={pickerTargetValue}
              value={completedReps ?? pickerTargetValue}
              onChange={setCompletedReps}
              unitType={pickerUnitType}
            />

            {/* Save Button - Ultra Compact */}
            <button
              onClick={() => handleRepetitionSave(completedReps ?? pickerTargetValue)}
              className="w-full mt-2 h-10 bg-[#00B4FF] hover:bg-[#00A0E0] text-white rounded-lg font-bold text-sm shadow-lg active:scale-[0.98] transition-all"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              שמירה והמשך
            </button>
          </motion.div>
      </div>
    );
  }

    // TRANSITION State (Rest Screen)
  if (workoutState === 'TRANSITION') {
    return (
        <div className="absolute inset-0">
          {/* Video Player showing the CURRENT (upcoming) exercise */}
          <ExerciseVideoPlayer
            key={`rest-video-${currentSegmentIndex}-${currentExerciseIndex}`}
            exerciseId={`rest-${currentExerciseIndex}`}
            videoUrl={activeExercise?.videoUrl || null}
            exerciseName={activeExercise?.name || 'התרגיל הבא'}
            exerciseType="reps"
            isPaused={false}
          />

          {/* RestScreen Overlay with premium design */}
          <RestScreen
            key={`rest-${currentSegmentIndex}-${currentExerciseIndex}`}
            duration={restDuration}
            nextExerciseName={activeExercise?.name || 'התרגיל הבא'}
            nextExerciseEquipment={activeExercise?.equipment}
            nextExerciseReps={activeExercise?.reps}
            onSkip={skipRest}
            onComplete={handleRestComplete}
              isPaused={isPaused}
          />
      </div>
    );
  }

    // ACTIVE State (default)
  return (
    <motion.div
        className="absolute inset-0 overflow-hidden"
      drag="y"
      dragControls={curtainDragControls}
      dragConstraints={{ top: 0, bottom: 800 }}
      dragElastic={0.2}
      style={{ y: curtainY }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 100) {
          curtainY.set(0);
        } else {
          curtainY.set(0);
        }
      }}
    >
      {/* Header with Story-style Progress Bar */}
        <div className="absolute top-0 left-0 right-0 z-50 p-4 pt-12">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={togglePause}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md"
          >
            {isPaused ? (
              <Play size={20} className="text-white" fill="white" />
            ) : (
              <Pause size={20} className="text-white" />
            )}
          </button>
          <div
            className="text-white font-bold text-xl tracking-wider"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {formatTime(elapsedTime)}
          </div>
          <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
            <List size={20} className="text-white" />
          </button>
        </div>

        <WorkoutStoryBars progressBars={progressBars} />
      </div>

        {/* Video Player */}
      <ExerciseVideoPlayer
          key={`player-${currentSegmentIndex}-${currentExerciseIndex}`}
          exerciseId={activeExercise?.id || `ex-${currentExerciseIndex}`}
        videoUrl={exerciseVideoUrl}
        exerciseName={exerciseName}
          exerciseType={exerciseType}
        isPaused={isPaused}
        hasAudio={false} /* Audio now controlled by global isAudioEnabled in sessionStorage */
        onVideoProgress={setVideoProgress}
        onVideoEnded={handleExerciseComplete}
      />
          
        {/* Pre-fetch Next Video */}
        {nextExercise.videoUrl && (
          <video src={nextExercise.videoUrl} preload="auto" className="hidden" muted playsInline />
      )}

        {/* Exercise Details Sheet */}
      <ExerciseDetailsSheet
          key={`sheet-${currentSegmentIndex}-${currentExerciseIndex}`}
        exerciseName={exerciseName}
          exerciseType={exerciseType}
        exerciseDuration={exerciseDuration}
        targetReps={targetReps}
                autoCompleteTime={autoCompleteTime}
        repsOrDurationText={repsOrDurationText}
        executionSteps={executionSteps}
        muscleGroups={muscleGroups}
        exerciseGoal={exerciseGoal}
                isPaused={isPaused}
                  onComplete={handleExerciseComplete}
      />
    </motion.div>
    );
  };

  // ==========================================================================
  // MAIN RENDER - Wrapper with persistent gradient
  // ==========================================================================

  return (
    <div className="relative w-full h-screen bg-black">
      {/* Persistent White Gradient Overlay - Always visible across all states */}
      <div 
        className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-white via-white/40 to-transparent z-[35] pointer-events-none"
        aria-hidden="true"
      />
      
      {/* State-specific content */}
      {renderStateContent()}
    </div>
  );
}
