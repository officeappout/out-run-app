'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRunningPlayer } from '@/features/workout-engine/players/running/store/useRunningPlayer';
import { useSessionStore } from '@/features/workout-engine';
import { useRequiredSetup } from '@/features/user/onboarding/hooks/useRequiredSetup';
import { Route } from '../types/route.types';

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

function formatPace(distanceKm: number, timeSeconds: number): string {
  if (distanceKm <= 0) return '0:00';
  const paceDec = (timeSeconds / 60) / distanceKm;
  const mins = Math.floor(paceDec);
  const secs = Math.round((paceDec - mins) * 60);
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
  jitState: ReturnType<typeof useRequiredSetup>['jitState'];
  dismissJIT: () => void;
  cancelJIT: () => void;
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

  const [isWorkoutActive, setIsWorkoutActive] = useState(false);
  const [isWorkoutPaused, setIsWorkoutPaused] = useState(false);
  const [isNavigationMode, setIsNavigationMode] = useState(false);
  const [workoutStartTime, setWorkoutStartTime] = useState<number | null>(null);
  const [livePath, setLivePath] = useState<[number, number][]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [showDopamine, setShowDopamine] = useState(false);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [runDistance, setRunDistance] = useState(0);
  const [userBearing, setUserBearing] = useState(0);
  const [workoutWatchId, setWorkoutWatchId] = useState<number | null>(null);

  const userWeight = (profile as any)?.core?.weight || (profile as any)?.weight || 70;
  const runPace = formatPace(runDistance, elapsedTime);

  // Timer
  useEffect(() => {
    if (!isWorkoutActive || isWorkoutPaused || !workoutStartTime) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - workoutStartTime) / 1000));
      try { useSessionStore.getState().tick(); } catch { /* ignore */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [isWorkoutActive, isWorkoutPaused, workoutStartTime]);

  // GPS watchPosition during active workout
  useEffect(() => {
    if (!isWorkoutActive || isWorkoutPaused) {
      if (workoutWatchId && typeof window !== 'undefined' && 'geolocation' in navigator) {
        try { navigator.geolocation.clearWatch(workoutWatchId); } catch { /* ignore */ }
        setWorkoutWatchId(null);
      }
      return;
    }
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;

    let id: number | null = null;
    try {
      id = navigator.geolocation.watchPosition(
        (pos) => {
          const newLat = pos.coords.latitude;
          const newLng = pos.coords.longitude;
          const prev = currentUserPos;
          if (prev) {
            const dist = getDistanceKm(prev.lat, prev.lng, newLat, newLng);
            if (dist > 0.015) {
              setRunDistance((d) => d + dist);
              setLivePath((p) => [...p, [newLng, newLat]]);
              addCoord([newLng, newLat]);
              if (status === 'running' || status === 'active') {
                updateRunData(dist, elapsedTime);
                updateDistance(dist);
              }
              setCurrentUserPos({ lat: newLat, lng: newLng });
              if (pos.coords.heading) setUserBearing(pos.coords.heading);
            }
          } else {
            setCurrentUserPos({ lat: newLat, lng: newLng });
            setLivePath([[newLng, newLat]]);
            if (pos.coords.heading) setUserBearing(pos.coords.heading);
          }
        },
        () => { /* retry on error */ },
        { enableHighAccuracy: true, maximumAge: 0 },
      );
      setWorkoutWatchId(id);
    } catch { /* ignore */ }

    return () => {
      if (id !== null && typeof window !== 'undefined' && 'geolocation' in navigator) {
        try { navigator.geolocation.clearWatch(id); } catch { /* ignore */ }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWorkoutActive, isWorkoutPaused, currentUserPos, status, runDistance]);

  const _doStartActiveWorkout = useCallback(() => {
    const rp = useRunningPlayer.getState();
    const planned = rp.currentWorkout;
    rp.clearRunningData();
    rp.initializeRunningData();
    startSession('running');
    if (planned) { rp.setCurrentWorkout(planned); rp.setRunMode('plan'); }
    else { rp.setRunMode('free'); }
    rp.startGPSTracking();
    setWorkoutStartTime(Date.now());
    setIsWorkoutActive(true);
    setIsNavigationMode(true);
    setRunDistance(0);
    setElapsedTime(0);
    const isMock = focusedRoute?.id?.startsWith('mock') || false;
    if (focusedRoute?.path && focusedRoute.path.length > 2 && !isMock && workoutMode !== 'free') {
      setLivePath(focusedRoute.path);
    } else if (currentUserPos) {
      setLivePath([[currentUserPos.lng, currentUserPos.lat]]);
    } else {
      setLivePath([]);
    }
  }, [focusedRoute, workoutMode, currentUserPos, startSession]);

  const startActiveWorkout = useCallback(() => {
    interceptWorkoutStart(() => _doStartActiveWorkout());
  }, [interceptWorkoutStart, _doStartActiveWorkout]);

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
    jitState, dismissJIT, cancelJIT,
  };
}
