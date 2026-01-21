/**
 * Running Player Store
 * Manages running-specific state (laps, GPS, pace)
 * Works alongside useSessionStore for universal metrics
 */
import { create } from 'zustand';
import { Route } from '@/features/parks';
import { Lap, GeoPoint } from '../../../core/types/session.types';

interface RunningPlayerState {
  // Running Mode
  runMode: 'free' | 'plan' | 'my_routes';
  activityType: 'running' | 'walking';
  
  // Running-specific Metrics
  laps: Lap[];
  currentPace: number;  // minutes per km
  routeCoords: number[][];
  
  // Route Planning
  suggestedRoutes: Route[];
  activeRoutePath: number[][];
  
  // Map View State
  view: 'main' | 'laps';
  lastViewport: { latitude: number; longitude: number; zoom: number };
  
  // Actions
  setRunMode: (mode: 'free' | 'plan' | 'my_routes') => void;
  setActivityType: (type: 'running' | 'walking') => void;
  setSuggestedRoutes: (routes: Route[]) => void;
  setActiveRoutePath: (path: number[][]) => void;
  setView: (view: 'main' | 'laps') => void;
  setLastViewport: (vp: any) => void;
  
  triggerLap: () => void;
  addCoord: (coord: number[]) => void;
  updatePace: (pace: number) => void;
  updateRunData: (distanceDelta: number, duration: number) => void;
  
  clearRunningData: () => void;
}

export const useRunningPlayer = create<RunningPlayerState>((set, get) => ({
  // Initial state
  runMode: 'plan',
  activityType: 'running',
  laps: [{ id: '1', lapNumber: 1, distanceMeters: 0, durationSeconds: 0, splitPace: 0, isActive: true }],
  currentPace: 0,
  routeCoords: [],
  suggestedRoutes: [],
  activeRoutePath: [],
  view: 'main',
  lastViewport: { latitude: 32.0853, longitude: 34.7818, zoom: 15 },
  
  // Setters
  setRunMode: (mode) => set({ runMode: mode }),
  setActivityType: (type) => set({ activityType: type }),
  setSuggestedRoutes: (routes) => set({ suggestedRoutes: routes }),
  setActiveRoutePath: (path) => set({ activeRoutePath: path }),
  setView: (view) => set({ view }),
  setLastViewport: (vp) => set({ lastViewport: vp }),
  
  // Trigger a new lap
  triggerLap: () => {
    const { laps } = get();
    const updatedLaps = laps.map(lap => ({ ...lap, isActive: false }));
    const newLapNumber = laps.length + 1;
    updatedLaps.push({
      id: newLapNumber.toString(),
      lapNumber: newLapNumber,
      distanceMeters: 0,
      durationSeconds: 0,
      splitPace: 0,
      isActive: true
    });
    set({ laps: updatedLaps });
  },
  
  // Add GPS coordinate
  addCoord: (coord) => {
    set((state) => ({
      routeCoords: [...state.routeCoords, coord]
    }));
  },
  
  // Update pace
  updatePace: (pace) => {
    set({ currentPace: pace });
  },
  
  // Update running data (called when distance changes)
  updateRunData: (distanceDelta: number, duration: number) => {
    const { laps } = get();
    const distanceDeltaMeters = distanceDelta * 1000;
    
    // Calculate pace
    const pace = distanceDelta > 0 ? (duration / 60) / distanceDelta : 0;
    
    // Update active lap
    const updatedLaps = laps.map(lap => 
      lap.isActive ? {
        ...lap,
        distanceMeters: lap.distanceMeters + distanceDeltaMeters,
        durationSeconds: duration,
        splitPace: pace
      } : lap
    );
    
    set({
      currentPace: pace,
      laps: updatedLaps
    });
  },
  
  // Clear running data
  clearRunningData: () => {
    set({
      laps: [{ id: '1', lapNumber: 1, distanceMeters: 0, durationSeconds: 0, splitPace: 0, isActive: true }],
      currentPace: 0,
      routeCoords: [],
      activeRoutePath: [],
    });
  },
}));
