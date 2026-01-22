/**
 * Unified Session Store
 * Manages shared session state across all workout modes (running, strength, hybrid)
 * Persists universal metrics when switching between modes
 */
import { create } from 'zustand';

export type SessionMode = 'running' | 'walking' | 'strength' | 'hybrid' | 'idle';
export type SessionStatus = 'idle' | 'active' | 'paused' | 'finished';

interface SessionState {
  // Activity Mode
  mode: SessionMode;
  status: SessionStatus;
  
  // Universal Metrics (persist across mode switches)
  totalDuration: number;      // seconds
  totalCalories: number;      // computed
  totalDistance: number;      // km (for running/walking modes)
  
  // Timestamps
  startTime: number | null;
  pausedTime: number;         // accumulated paused time in seconds
  lastTickTime: number | null; // for accurate duration tracking
  
  // Actions
  startSession: (mode: SessionMode) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;
  switchMode: (newMode: SessionMode) => void;
  tick: () => void;  // Called every second to update duration
  updateDistance: (distanceDelta: number) => void;
  updateCalories: (caloriesDelta: number) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  // Initial state
  mode: 'idle',
  status: 'idle',
  totalDuration: 0,
  totalCalories: 0,
  totalDistance: 0,
  startTime: null,
  pausedTime: 0,
  lastTickTime: null,
  
  // Start a new session
  startSession: (mode: SessionMode) => {
    const now = Date.now();
    set({
      mode,
      status: 'active',
      startTime: now,
      lastTickTime: now,
      totalDuration: 0,
      totalCalories: 0,
      totalDistance: 0,
      pausedTime: 0,
    });
    
    // Log workout session started event
    if (typeof window !== 'undefined') {
      import('@/features/analytics/AnalyticsService').then(({ Analytics }) => {
        Analytics.logWorkoutSessionStarted(undefined, mode, mode).catch((error) => {
          console.error('[SessionStore] Error logging workout session started:', error);
        });
      });
    }
  },
  
  // Pause the session
  pauseSession: () => {
    const state = get();
    if (state.status === 'active') {
      set({ status: 'paused' });
    }
  },
  
  // Resume the session
  resumeSession: () => {
    const state = get();
    if (state.status === 'paused') {
      const now = Date.now();
      set({
        status: 'active',
        lastTickTime: now,
      });
    }
  },
  
  // End the session
  endSession: () => {
    set({ status: 'finished' });
  },
  
  // Switch mode while preserving metrics
  switchMode: (newMode: SessionMode) => {
    const state = get();
    if (state.status === 'active' || state.status === 'paused') {
      set({ mode: newMode });
    }
  },
  
  // Update duration (called every second)
  tick: () => {
    const state = get();
    if (state.status === 'active') {
      set((state) => ({
        totalDuration: state.totalDuration + 1,
        lastTickTime: Date.now(),
      }));
    }
  },
  
  // Update distance (for running/walking)
  updateDistance: (distanceDelta: number) => {
    set((state) => ({
      totalDistance: state.totalDistance + distanceDelta,
    }));
  },
  
  // Update calories
  updateCalories: (caloriesDelta: number) => {
    set((state) => ({
      totalCalories: state.totalCalories + caloriesDelta,
    }));
  },
  
  // Clear session data
  clearSession: () => {
    set({
      mode: 'idle',
      status: 'idle',
      totalDuration: 0,
      totalCalories: 0,
      totalDistance: 0,
      startTime: null,
      pausedTime: 0,
      lastTickTime: null,
    });
  },
}));
