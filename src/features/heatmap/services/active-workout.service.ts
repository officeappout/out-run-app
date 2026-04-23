/**
 * Active Workout Service — Heartbeat Engine for Live Heat Map.
 *
 * Firestore collection: `active_workouts/{uid}`
 *
 * One document per currently-active user, updated every 45 seconds.
 * Deleted INSTANTLY when the session ends (no permanent location tracking).
 *
 * Privacy contract:
 *   - Document contains demographic + location data for aggregation ONLY.
 *   - The heatmap aggregation layer (heatmap.service.ts) strips UIDs before
 *     returning data to the admin UI.  The manager NEVER sees individual records.
 */

import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fuzzLocation } from '@/features/safecity/services/presence.service';

// ── Types ────────────────────────────────────────────────────────────────────

export type ActiveWorkoutType = 'running' | 'walking' | 'cycling' | 'strength';

export interface ActiveWorkoutPayload {
  uid: string;
  authorityId: string | null;
  neighborhoodId: string | null;
  workoutType: ActiveWorkoutType;
  lat: number;
  lng: number;
  gender: 'male' | 'female' | 'other';
  ageGroup: string;
  birthYear?: number;
  routeId?: string;
}

// ── Heartbeat interval ───────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 45_000; // 45 seconds

let _heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

// ── Heartbeat write ──────────────────────────────────────────────────────────

/**
 * Write (upsert) the active workout document for a single user.
 * Location is always fuzzed (~100 m) to prevent precise tracking.
 */
export async function writeActiveWorkout(payload: ActiveWorkoutPayload): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const fuzzed = fuzzLocation(payload.lat, payload.lng);

  const data: Record<string, unknown> = {
    authorityId: payload.authorityId,
    neighborhoodId: payload.neighborhoodId,
    workoutType: payload.workoutType,
    location: { lat: fuzzed.lat, lng: fuzzed.lng },
    demographics: {
      gender: payload.gender,
      ageGroup: payload.ageGroup,
      birthYear: payload.birthYear ?? null,
    },
    routeId: payload.routeId ?? null,
    lastUpdate: serverTimestamp(),
  };

  await setDoc(doc(db, 'active_workouts', payload.uid), data);
}

// ── Cleanup (instant delete on session end) ──────────────────────────────────

export async function clearActiveWorkout(uid: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    await deleteDoc(doc(db, 'active_workouts', uid));
  } catch {
    // Doc may not exist — safe to ignore
  }
}

// ── Heartbeat manager ────────────────────────────────────────────────────────

/**
 * Starts a 45-second interval that writes the active workout document.
 * Fires immediately on first call, then every 45 s.
 *
 * `getPayload` is re-evaluated each tick to pick up GPS drift.
 */
export function startActiveWorkoutHeartbeat(
  getPayload: () => ActiveWorkoutPayload | null,
): void {
  stopActiveWorkoutHeartbeat();

  const tick = () => {
    const payload = getPayload();
    if (payload) {
      writeActiveWorkout(payload).catch((err) =>
        console.warn('[ActiveWorkoutHB] heartbeat write failed:', err),
      );
    }
  };

  tick();
  _heartbeatIntervalId = setInterval(tick, HEARTBEAT_INTERVAL_MS);
}

export function stopActiveWorkoutHeartbeat(): void {
  if (_heartbeatIntervalId) {
    clearInterval(_heartbeatIntervalId);
    _heartbeatIntervalId = null;
  }
}

// ── Age derivation helpers ───────────────────────────────────────────────────

export function deriveBirthYear(birthDate?: Date | string | null): number | undefined {
  if (!birthDate) return undefined;
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate as string);
  if (isNaN(bd.getTime())) return undefined;
  const year = bd.getFullYear();
  return year > 1900 ? year : undefined;
}

export function deriveAgeGroup(birthDate?: Date | string | null): string {
  if (!birthDate) return 'unknown';
  const bd = birthDate instanceof Date ? birthDate : new Date(birthDate as string);
  if (isNaN(bd.getTime())) return 'unknown';

  const ageYears = (Date.now() - bd.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  if (ageYears < 18) return '0-17';
  if (ageYears < 26) return '18-25';
  if (ageYears < 36) return '26-35';
  if (ageYears < 46) return '36-45';
  if (ageYears < 56) return '46-55';
  return '56+';
}
