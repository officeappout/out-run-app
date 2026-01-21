/**
 * Unified Session Types
 * Common types used across all workout modes
 */

export type SessionMode = 'running' | 'walking' | 'strength' | 'hybrid' | 'idle';
export type SessionStatus = 'idle' | 'countdown' | 'active' | 'paused' | 'finished';
export type ActivityType = 'running' | 'walking' | 'cycling' | 'workout';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  altitude?: number;
  accuracy?: number;
}

export interface Lap {
  id: string;
  lapNumber: number;
  number?: number; // Alias for lapNumber (backward compatibility)
  distanceMeters: number;
  distance?: number; // Alias in km (backward compatibility)
  durationSeconds: number;
  duration?: number; // Alias for durationSeconds (backward compatibility)
  splitPace: number;
  isActive: boolean;
}
