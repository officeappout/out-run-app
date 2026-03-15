'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { ActivityType } from '../types/route.types';

export type MapMode =
  | 'discover'
  | 'builder'
  | 'navigate'
  | 'free_run'
  | 'planned_preview'
  | 'active'
  | 'summary';

export interface MapModeContextValue {
  mode: MapMode;
  setMode: (mode: MapMode) => void;
  workoutId: string | null;
  isHybridWorkout: boolean;
  setIsHybridWorkout: (v: boolean) => void;
  destination: { lat: number; lng: number } | null;
  setDestination: (d: { lat: number; lng: number } | null) => void;
  activityType: ActivityType;
  setActivityType: (t: ActivityType) => void;
}

const MapModeContext = createContext<MapModeContextValue | null>(null);

export function useMapMode(): MapModeContextValue {
  const ctx = useContext(MapModeContext);
  if (!ctx) throw new Error('useMapMode must be used within <MapModeProvider>');
  return ctx;
}

interface MapModeProviderProps {
  /** Provided by the Server Component — guarantees the value is available on first render. */
  initialWorkoutId: string | null;
  /** URL context (e.g. 'running') from the Server Component. */
  initialContext?: string | null;
  children: React.ReactNode;
}

export function MapModeProvider({ initialWorkoutId, initialContext, children }: MapModeProviderProps) {
  const [mode, setMode] = useState<MapMode>(initialWorkoutId ? 'planned_preview' : 'discover');
  const [isHybridWorkout, setIsHybridWorkout] = useState(false);
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [activityType, setActivityType] = useState<ActivityType>(
    initialContext === 'running' ? 'running' : 'walking',
  );

  // When React reuses this component instance across client-side navigations,
  // the useState initializer is already spent. This effect catches the prop
  // change and forces mode back to planned_preview.
  useEffect(() => {
    if (initialWorkoutId && mode !== 'active') {
      setMode('planned_preview');
    }
  }, [initialWorkoutId]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<MapModeContextValue>(() => ({
    mode,
    setMode,
    workoutId: initialWorkoutId,
    isHybridWorkout,
    setIsHybridWorkout,
    destination,
    setDestination,
    activityType,
    setActivityType,
  }), [mode, initialWorkoutId, isHybridWorkout, destination, activityType]);

  return (
    <MapModeContext.Provider value={value}>
      {children}
    </MapModeContext.Provider>
  );
}
