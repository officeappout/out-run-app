/**
 * Workout Context Resolver
 *
 * Coverage-aware `{ location, availableGear }` resolution for the START of a
 * workout. Replaces the "decide location, then blindly resolve nearest-park gear"
 * flow at the generation entry points. Guarantees:
 *   - Park intent + equipped park within 2 km → park with that park's REAL gear
 *     (via resolveParkEquipmentIds' nearest-equipped scan — Phase 3a).
 *   - Park intent + NO equipped park in range → HOME (bodyweight/home gear), NOT a
 *     fake ESSENTIAL_PARK_GEAR "park".
 *   - Park intent + no GPS fix within the timeout → HOME (generation never hangs).
 *   - Non-park intent → passed through unchanged.
 *
 * ⚠️ The park→home override applies only to the INFERRED entry point (StatsOverview),
 * via `allowHomeOverride`. Flows where the user EXPLICITLY picks a location
 * (WorkoutBuilderSheet / UserWorkoutAdjuster) keep their choice and only benefit
 * from the equipped-park gear scan — silently overriding an explicit choice would
 * be wrong.
 *
 * ⏭ DEFERRED (documented follow-up): the per-domain "poor park → home" coverage
 * comparison (needs the split/level machinery + tunable thresholds). Phase 1's
 * park→bodyweight selector + graceful bodyweight degrade already keep a sparse but
 * equipped park correct (no home leak) — just not always optimal vs. home.
 *
 * No React hooks — reads the GPS Zustand store via getState()/requestPermission.
 */

import { resolveParkEquipmentIds } from './park-equipment-resolver';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { CONTEXT_AWARE_SELECTION_ENABLED } from '@/config/feature-flags';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

/** Bounded wait for a GPS fix so generation is never blocked on geolocation. */
const DEFAULT_GPS_TIMEOUT_MS = 2_500;

export type WorkoutContextSource =
  | 'legacy'
  | 'non-park'
  | 'equipped-park'
  | 'no-equipped-park-home'
  | 'gps-timeout-home';

export interface ResolvedWorkoutContext {
  location: ExecutionLocation;
  /** Real park equipment ids; empty for home / non-park (generation adds the home baseline). */
  availableGear: string[];
  source: WorkoutContextSource;
}

export interface ResolveWorkoutContextOptions {
  /** Caller-supplied fix (e.g. a GPS store snapshot). When absent, a bounded fix is attempted. */
  gpsCoords?: { lat: number; lng: number };
  gpsTimeoutMs?: number;
  /**
   * When false, an inferred park that resolves to no equipped park / no GPS is NOT
   * downgraded to home — the caller's explicit location choice is respected.
   * Default true (inferred flow).
   */
  allowHomeOverride?: boolean;
}

/** Snapshot → else race a courtesy permission request against a short timeout. */
async function waitForGpsFix(timeoutMs: number): Promise<{ lat: number; lng: number } | null> {
  const snap = useGPSStore.getState().coords;
  if (snap) return { lat: snap.lat, lng: snap.lng };
  try {
    const fix = await Promise.race([
      useGPSStore.getState().requestPermissionIfAllowed().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return fix ? { lat: fix.lat, lng: fix.lng } : null;
  } catch {
    return null;
  }
}

export async function resolveWorkoutContext(
  userProfile: UserFullProfile,
  requestedLocation: ExecutionLocation,
  options: ResolveWorkoutContextOptions = {},
): Promise<ResolvedWorkoutContext> {
  const isPark = requestedLocation === 'park' || requestedLocation === 'street';

  // Flag OFF → legacy: keep the requested location; park gear only if the caller
  // supplied a fix (mirrors the old StatsOverview behaviour exactly).
  if (!CONTEXT_AWARE_SELECTION_ENABLED) {
    const gear = isPark && options.gpsCoords
      ? await resolveParkEquipmentIds(userProfile, { gpsCoords: options.gpsCoords })
      : [];
    return { location: requestedLocation, availableGear: gear, source: 'legacy' };
  }

  if (!isPark) {
    return { location: requestedLocation, availableGear: [], source: 'non-park' };
  }

  const allowHomeOverride = options.allowHomeOverride ?? true;

  // Park intent — need a GPS fix (bounded so generation never hangs).
  const coords = options.gpsCoords
    ?? (await waitForGpsFix(options.gpsTimeoutMs ?? DEFAULT_GPS_TIMEOUT_MS));

  if (!coords) {
    return {
      location: allowHomeOverride ? 'home' : requestedLocation,
      availableGear: [],
      source: 'gps-timeout-home',
    };
  }

  const parkGear = await resolveParkEquipmentIds(userProfile, { gpsCoords: coords });
  if (parkGear.length > 0) {
    return { location: requestedLocation, availableGear: parkGear, source: 'equipped-park' };
  }

  // No equipped park within range.
  return {
    // Inferred flow → HOME rather than a fake ESSENTIAL_PARK_GEAR park.
    // Explicit choice → respect it (generation will use ESSENTIAL_PARK_GEAR).
    location: allowHomeOverride ? 'home' : requestedLocation,
    availableGear: [],
    source: 'no-equipped-park-home',
  };
}
