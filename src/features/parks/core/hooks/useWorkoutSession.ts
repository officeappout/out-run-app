'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine';
import { useRequiredSetup } from '@/features/user/onboarding/hooks/useRequiredSetup';
import { useSmartwatchPrompt } from '@/features/user/onboarding/hooks/useSmartwatchPrompt';
import { Route } from '../types/route.types';
import { computeRouteTurns } from '../services/geoUtils';

function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatPaceFromMinKm(paceMinKm: number): string {
  if (paceMinKm <= 0) return '0:00';
  const mins = Math.floor(paceMinKm);
  const secs = Math.round((paceMinKm - mins) * 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export interface WorkoutSessionState {
  isWorkoutActive: boolean;
  setIsWorkoutActive: (v: boolean) => void;
  isWorkoutPaused: boolean;
  setIsWorkoutPaused: (v: boolean) => void;
  isNavigationMode: boolean;
  setIsNavigationMode: (v: boolean) => void;
  workoutStartTime: number | null;
  setWorkoutStartTime: (v: number | null) => void;
  livePath: [number, number][];
  setLivePath: (p: [number, number][]) => void;
  showSummary: boolean;
  setShowSummary: (v: boolean) => void;
  showDopamine: boolean;
  setShowDopamine: (v: boolean) => void;
  showDetailsDrawer: boolean;
  setShowDetailsDrawer: (v: boolean) => void;
  elapsedTime: number;
  runDistance: number;
  runPace: string;
  userWeight: number;
  status: string;
  startActiveWorkout: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;
  triggerLap: () => void;
  addCoord: (c: [number, number]) => void;
  injectSimPosition: (pos: { lat: number; lng: number }) => void;
  jitState: ReturnType<typeof useRequiredSetup>['jitState'];
  dismissJIT: () => void;
  cancelJIT: () => void;
  // ── Smartwatch prompt (running activities only) ──
  // Mounted by MapShell as a centred modal that surfaces AFTER any JIT
  // requirements clear and BEFORE _doStartActiveWorkout runs. Skipped
  // entirely for non-running activities and for runners who've already
  // seen the prompt this session.
  smartwatchPrompt: ReturnType<typeof useSmartwatchPrompt>['smartwatchPrompt'];
}

export function useWorkoutSession(
  currentUserPos: { lat: number; lng: number } | null,
  setCurrentUserPos: (p: { lat: number; lng: number } | null) => void,
  focusedRoute: Route | null,
  workoutMode: 'free' | 'discover',
  profile: any,
): WorkoutSessionState {
  const { triggerLap, addCoord, updateRunData } = useRunningPlayer();
  const { status, startSession, pauseSession, resumeSession, endSession, updateDistance } = useSessionStore();
  const { interceptWorkoutStart, jitState, dismissJIT, cancelJIT } = useRequiredSetup();
  const { smartwatchPrompt, openIfFirstRunner } = useSmartwatchPrompt();

  // Read canonical coord trail and pace from the running store (single source of truth)
  const routeCoords = useRunningPlayer((s) => s.routeCoords);
  const currentPace = useRunningPlayer((s) => s.currentPace);

  // Read canonical distance from the session store (updated by useRunningPlayer.startGPSTracking)
  const runDistance = useSessionStore((s) => s.totalDistance);

  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [isNavigationMode, setIsNavigationMode] = useState(false);
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [livePath, setLivePath] = useState<[number, number][]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [showDopamine, setShowDopamine] = useState(false);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const userWeight = (profile as any)?.core?.weight || (profile as any)?.weight || 70;

  // Pace string derived directly from the store's smoothed currentPace value (Fix #2).
  // No more formatPace(runDistance, elapsedTime) — that passed elapsedTime as pace.
  const runPace = formatPaceFromMinKm(currentPace);

  // ── Fix #1: livePath is now a mirror of routeCoords from useRunningPlayer ──
  // The store's startGPSTracking() is the ONLY GPS watcher; this effect keeps
  // the local livePath in sync so MapShell/AppMap can read it normally.
  useEffect(() => {
    if (isWorkoutActive && routeCoords.length > 0) {
      setLivePath(routeCoords as [number, number][]);
    }
  }, [isWorkoutActive, routeCoords]);

  // Timer — local HUD-only ticker for `elapsedTime` (wall-clock since start).
  //
  // The session store's `totalDuration` is now ticked by useRunningPlayer's
  // `durationInterval` inside `startGPSTracking()` so MainMetrics +
  // LapMetrics stay in lockstep with a single source of truth. Calling
  // `tick()` here too would double-count, so it has been removed. This
  // hook keeps its own interval purely to drive the local `elapsedTime`
  // state used by HUD overlays that consume `runDistance`/`runPace` next
  // to a wall-clock readout.
  useEffect(() => {
    if (!isWorkoutActive || isWorkoutPaused || !workoutStartTime) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - workoutStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isWorkoutActive, isWorkoutPaused, workoutStartTime]);

  // ── Fix #4: Simulation injection bookkeeping ──
  const lastSimInjectionRef = useRef<{ pos: { lat: number; lng: number }; time: number } | null>(null);

  // Accepts a mock position from useDevSimulation and records it into the workout
  // pipeline identically to how real GPS coords are recorded in startGPSTracking.
  const injectSimPosition = useCallback((pos: { lat: number; lng: number }) => {
    if (!isWorkoutActive || isWorkoutPaused) return;

    const now = Date.now();
    const last = lastSimInjectionRef.current;

    if (last) {
      const distKm = getDistanceKm(last.pos.lat, last.pos.lng, pos.lat, pos.lng);
      if (distKm < 0.005) return; // < 5 m — skip, same threshold as startGPSTracking

      addCoord([pos.lng, pos.lat]);
      updateDistance(distKm);

      const timeDeltaSeconds = (now - last.time) / 1000;
      if (timeDeltaSeconds > 0) {
        const speedMs = (distKm * 1000) / timeDeltaSeconds;
        const MIN_SPEED_MS = 0.3;
        const MAX_PACE_MIN_KM = 15;
        if (speedMs > MIN_SPEED_MS) {
          const instantPaceMinKm = 1000 / (speedMs * 60);
          if (instantPaceMinKm <= MAX_PACE_MIN_KM) {
            updateRunData(distKm, instantPaceMinKm);
          }
        }
      }
    } else {
      addCoord([pos.lng, pos.lat]);
    }

    lastSimInjectionRef.current = { pos, time: now };
    setCurrentUserPos(pos);

    // Run deviation detection on the simulated path too, so dev-mode mock
    // movement triggers the same auto-reroute flow as real GPS would. Pulled
    // off the store directly to avoid threading another action prop through
    // useWorkoutSession's already-large dependency array.
    useRunningPlayer.getState().checkRouteDeviation(pos);
  }, [isWorkoutActive, isWorkoutPaused, addCoord, updateDistance, updateRunData, setCurrentUserPos]);

  const _doStartActiveWorkout = useCallback(() => {
    const rp = useRunningPlayer.getState();
    const planned = rp.currentWorkout;
    rp.clearRunningData();
    rp.initializeRunningData();
    startSession('running');
    if (planned) { rp.setCurrentWorkout(planned); rp.setRunMode('plan'); }
    else { rp.setRunMode('free'); }
    // Bind the official_routes id + display metadata of the focused route (if any).
    // The id is persisted onto the saved workout document and bumps route analytics
    // on completion. Name + distance feed the GuidedRouteView progress strip so the
    // active-workout UI can show "מסלול X • Y%" without re-reading focusedRoute.
    rp.setGuidedRouteId(focusedRoute?.id ?? null);
    rp.setGuidedRouteName(focusedRoute?.name ?? null);
    rp.setGuidedRouteDistanceKm(
      typeof focusedRoute?.distance === 'number' && focusedRoute.distance > 0
        ? focusedRoute.distance
        : null,
    );
    rp.setGuidedRouteTurns(
      focusedRoute?.path && focusedRoute.path.length >= 3
        ? computeRouteTurns(focusedRoute.path)
        : null,
    );
    // Seed the deviation detector with the route polyline. Without this,
    // checkRouteDeviation has nothing to compare against and the auto-reroute
    // never fires. setActiveRoutePath also resets the deviation counter on
    // every call, so re-mounting / re-starting always begins from a clean
    // state. Free-form runs (no focusedRoute) get an empty path which the
    // detector treats as "no comparable route" — same behaviour as today.
    rp.setActiveRoutePath(
      focusedRoute?.path && focusedRoute.path.length >= 2
        ? focusedRoute.path
        : [],
    );
    // Single GPS watcher — only startGPSTracking runs; no second watcher here.
    rp.startGPSTracking();
    lastSimInjectionRef.current = null;
    setWorkoutStartTime(Date.now());
    setIsWorkoutActive(true);
    setIsNavigationMode(true);
    setElapsedTime(0);
    // Seed livePath with starting point; the store-sync effect will take over
    // as real coords come in.
    if (currentUserPos) {
      setLivePath([[currentUserPos.lng, currentUserPos.lat]]);
    } else {
      setLivePath([]);
    }
  }, [focusedRoute, workoutMode, currentUserPos, startSession]);

  /**
   * Pre-flight chain for an active workout start:
   *   1. JIT requirements (health is the only hard block; equipment is
   *      auto-skipped for runners — we tell `useRequiredSetup` the
   *      activity type so it filters the requirements list).
   *   2. Smartwatch prompt (runners only, first-shown only).
   *   3. _doStartActiveWorkout.
   *
   * Both step 1 and step 2 may be no-ops; they pass through synchronously
   * when not applicable. Net cost when nothing fires: two function
   * calls, zero re-renders.
   *
   * `useWorkoutSession` only ever starts running workouts (the home
   * page handles strength + planned via its own interceptor), so we
   * pass `'running'` as the activity type unconditionally.
   */
  const startActiveWorkout = useCallback(() => {
    interceptWorkoutStart(
      () => openIfFirstRunner('running', () => _doStartActiveWorkout()),
      'running',
    );
  }, [interceptWorkoutStart, openIfFirstRunner, _doStartActiveWorkout]);

  return {
    isWorkoutActive, setIsWorkoutActive,
    isWorkoutPaused, setIsWorkoutPaused,
    isNavigationMode, setIsNavigationMode,
    workoutStartTime, setWorkoutStartTime,
    livePath, setLivePath,
    showSummary, setShowSummary,
    showDopamine, setShowDopamine,
    showDetailsDrawer, setShowDetailsDrawer,
    elapsedTime, runDistance, runPace, userWeight,
    status,
    startActiveWorkout,
    pauseSession, resumeSession, endSession,
    triggerLap, addCoord,
    injectSimPosition,
    jitState, dismissJIT, cancelJIT,
    smartwatchPrompt,
  };
}
