'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

type TimerWorkoutState =
  | 'PREPARING'
  | 'ACTIVE'
  | 'RESTING'
  | 'PAUSED';

export interface UseWorkoutTimersInput {
  workoutState: TimerWorkoutState;
  isPaused: boolean;
  onPreparationComplete: () => void;
  /**
   * Fired when restTimeLeft reaches 0 during the RESTING state.
   * The state machine uses this to auto-advance (and auto-save reps if the
   * log drawer is still open).
   */
  onRestComplete: () => void;
  initialElapsedTime?: number;
}

export interface UseWorkoutTimersResult {
  elapsedTime: number;
  preparationCountdown: number;
  restTimeLeft: number;
  setRestTimeLeft: React.Dispatch<React.SetStateAction<number>>;
  formatTime: (seconds: number) => string;
  resetTimers: (newInitialElapsed?: number) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PREPARATION_COUNTDOWN = 3;

// ============================================================================
// HOOK
// ============================================================================

export function useWorkoutTimers({
  workoutState,
  isPaused,
  onPreparationComplete,
  onRestComplete,
  initialElapsedTime = 0,
}: UseWorkoutTimersInput): UseWorkoutTimersResult {
  const [elapsedTime, setElapsedTime] = useState(initialElapsedTime);
  const [preparationCountdown, setPreparationCountdown] = useState(PREPARATION_COUNTDOWN);
  const [restTimeLeft, setRestTimeLeft] = useState(0);

  const shortBeepRef = useRef<HTMLAudioElement | null>(null);
  const longBeepRef = useRef<HTMLAudioElement | null>(null);

  const onPrepCompleteRef = useRef(onPreparationComplete);
  useEffect(() => { onPrepCompleteRef.current = onPreparationComplete; });

  const onRestCompleteRef = useRef(onRestComplete);
  useEffect(() => { onRestCompleteRef.current = onRestComplete; });

  // --------------------------------------------------------------------------
  // Audio Initialization (Web Audio API)
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let audioContext: AudioContext | null = null;
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      const playBeep = (frequency: number, duration: number, volume: number) => {
        if (!audioContext) return;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = frequency;
        osc.type = 'sine';
        gain.gain.value = volume;
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + duration / 1000);
      };

      (shortBeepRef as any).playBeep = () => playBeep(400, 100, 0.3);
      (longBeepRef as any).playBeep = () => playBeep(600, 300, 0.5);
    } catch {
      // AudioContext unavailable
    }

    return () => { audioContext?.close(); };
  }, []);

  // --------------------------------------------------------------------------
  // Elapsed Clock + PREPARING Countdown
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (isPaused || workoutState === 'PAUSED') return;

    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);

      if (workoutState === 'PREPARING') {
        setPreparationCountdown((prev) => {
          if (prev <= 1) {
            onPrepCompleteRef.current();
            return PREPARATION_COUNTDOWN;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, workoutState]);

  // --------------------------------------------------------------------------
  // Rest Countdown with Audio Cues
  // Active ONLY during RESTING state. The timer is completely decoupled from
  // UI mount/unmount — it lives in this hook's state, not in any component.
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (workoutState !== 'RESTING') return;
    if (isPaused) return;
    if (restTimeLeft <= 0) return;

    const interval = setInterval(() => {
      setRestTimeLeft((prev) => {
        const next = prev - 1;

        if (next === 3 || next === 2) {
          if ((shortBeepRef as any).playBeep) (shortBeepRef as any).playBeep();
          else shortBeepRef.current?.play().catch(() => {});
        } else if (next === 1) {
          if ((longBeepRef as any).playBeep) (longBeepRef as any).playBeep();
          else longBeepRef.current?.play().catch(() => {});
        }

        if (next <= 0) {
          setTimeout(() => onRestCompleteRef.current(), 0);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [workoutState, isPaused, restTimeLeft]);

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const resetTimers = useCallback((newInitialElapsed: number = 0) => {
    setElapsedTime(newInitialElapsed);
    setPreparationCountdown(PREPARATION_COUNTDOWN);
    setRestTimeLeft(0);
  }, []);

  return {
    elapsedTime,
    preparationCountdown,
    restTimeLeft,
    setRestTimeLeft,
    formatTime,
    resetTimers,
  };
}
