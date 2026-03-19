/**
 * First Workout Service
 *
 * Generates the user's initial workout immediately after onboarding assessment.
 * Implements smart context-aware workout generation (spec 1.5):
 *
 *   1. If GPS exists and a park with equipment is nearby → Park Workout
 *   2. If no GPS or no nearby park → Home / No Equipment Workout
 *   3. All exercises must match the levels achieved in the assessment
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks.
 */

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserFullProfile } from '@/features/user/core/types/user.types';
import { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import { getAllParks } from '@/features/parks/core/services/parks.service';
import type { Park } from '@/features/parks/core/types/park.types';
import {
  generateHomeWorkout,
  type HomeWorkoutOptions,
  type HomeWorkoutResult,
} from './home-workout.service';

// ============================================================================
// TYPES
// ============================================================================

export interface FirstWorkoutContext {
  /** The user's full profile (must have progression.domains populated) */
  userProfile: UserFullProfile;
  /** User's GPS coordinates, if available */
  gpsCoordinates?: { lat: number; lng: number } | null;
  /** User ID for Firestore persistence */
  userId: string;
}

export interface FirstWorkoutResult {
  /** The generated workout */
  workout: HomeWorkoutResult;
  /** Where the workout takes place */
  location: ExecutionLocation;
  /** Nearby park used (if any) */
  nearbyPark: Park | null;
  /** Whether GPS was available */
  hadGPS: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum radius (meters) to search for nearby parks with gym equipment */
const PARK_SEARCH_RADIUS_METERS = 5000;

/** Minimum number of gym equipment pieces to qualify a park */
const MIN_PARK_EQUIPMENT = 1;

/** Default workout duration for first session (minutes) */
const FIRST_WORKOUT_DURATION_MIN = 30;

// ============================================================================
// PARK DISCOVERY
// ============================================================================

/**
 * Haversine distance between two lat/lng points in meters.
 */
function getDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the nearest park with gym/calisthenics equipment within the given radius.
 *
 * Selection criteria:
 *   1. Must have valid coordinates
 *   2. Must have gym equipment (gymEquipment array) or be a gym_park / calisthenics facility
 *   3. Must be within `radiusMeters`
 *   4. Closest qualifying park wins
 */
async function findNearestEquippedPark(
  userLat: number,
  userLng: number,
  radiusMeters: number = PARK_SEARCH_RADIUS_METERS,
): Promise<{ park: Park; distanceMeters: number } | null> {
  try {
    const allParks = await getAllParks();

    let best: { park: Park; distanceMeters: number } | null = null;

    for (const park of allParks) {
      // Must have valid location
      if (!park.location?.lat || !park.location?.lng) continue;

      // Must be a fitness-relevant facility
      const hasGymEquipment =
        (park.gymEquipment && park.gymEquipment.length >= MIN_PARK_EQUIPMENT) ||
        park.facilityType === 'gym_park' ||
        park.courtType === 'calisthenics' ||
        park.courtType === 'fitness_station';

      if (!hasGymEquipment) continue;

      // Calculate distance
      const dist = getDistanceMeters(
        userLat,
        userLng,
        park.location.lat,
        park.location.lng,
      );

      if (dist > radiusMeters) continue;

      // Track closest
      if (!best || dist < best.distanceMeters) {
        best = { park, distanceMeters: dist };
      }
    }

    return best;
  } catch (error) {
    console.warn('[FirstWorkout] Park search failed (non-blocking):', error);
    return null;
  }
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

/**
 * Generate the user's very first workout based on their assessment results
 * and available context (GPS, nearby parks, equipment).
 *
 * Decision tree:
 *   1. Check if GPS coordinates are available
 *   2. If GPS → search for nearby parks with gym equipment (within 5km)
 *   3. If park found → generate park workout
 *   4. If no GPS or no park → generate home / no-equipment workout
 *   5. All exercises MUST match the user's assessed levels
 *
 * @example
 * ```ts
 * const result = await generateFirstWorkout({
 *   userProfile: profile,
 *   gpsCoordinates: { lat: 32.08, lng: 34.78 },
 *   userId: uid,
 * });
 * ```
 */
export async function generateFirstWorkout(
  ctx: FirstWorkoutContext,
): Promise<FirstWorkoutResult> {
  const { userProfile, gpsCoordinates, userId } = ctx;
  const hadGPS = !!(gpsCoordinates?.lat && gpsCoordinates?.lng);

  let location: ExecutionLocation = 'park';
  let nearbyPark: Park | null = null;

  // ── Step 1: Attempt park discovery if GPS is available ────────────────
  if (hadGPS) {
    console.log(
      `[FirstWorkout] GPS available (${gpsCoordinates!.lat.toFixed(4)}, ${gpsCoordinates!.lng.toFixed(4)}). Searching for nearby parks...`,
    );

    const parkResult = await findNearestEquippedPark(
      gpsCoordinates!.lat,
      gpsCoordinates!.lng,
      PARK_SEARCH_RADIUS_METERS,
    );

    if (parkResult) {
      location = 'park';
      nearbyPark = parkResult.park;
      console.log(
        `[FirstWorkout] Found park "${parkResult.park.name}" at ${Math.round(parkResult.distanceMeters)}m. Using park workout.`,
      );
    } else {
      console.log('[FirstWorkout] No equipped park within 5km. Using default park workout (calisthenics gear available).');
    }
  } else {
    console.log('[FirstWorkout] No GPS available. Using default park workout (calisthenics gear available).');
  }

  // ── Step 2: Build workout options ────────────────────────────────────
  const workoutOptions: HomeWorkoutOptions = {
    userProfile,
    location,
    intentMode: 'normal',
    availableTime: FIRST_WORKOUT_DURATION_MIN,
    difficulty: 2, // Normal difficulty for first workout
    isFirstSessionInProgram: true,
    daysInactiveOverride: 0, // Brand new user, no detraining penalty
    // No equipment override for home (bodyweight only)
    // For park: the engine will resolve equipment from outdoor list
    equipmentOverride: undefined,
  };

  // ── Step 3: Generate the workout ─────────────────────────────────────
  console.log(`[FirstWorkout] Generating ${location} workout for Level ${getBaseLevel(userProfile)}...`);

  const workoutResult = await generateHomeWorkout(workoutOptions);

  console.log(
    `[FirstWorkout] Generated workout with ${workoutResult.workout.exercises.length} exercises, ` +
      `estimated ${workoutResult.workout.estimatedDuration}min.`,
  );

  // ── Step 4: Persist to Firestore ─────────────────────────────────────
  try {
    await persistFirstWorkout(userId, workoutResult, location, nearbyPark);
    console.log('[FirstWorkout] Workout persisted to Firestore.');
  } catch (error) {
    console.warn('[FirstWorkout] Persistence failed (non-blocking):', error);
  }

  return {
    workout: workoutResult,
    location,
    nearbyPark,
    hadGPS,
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Persist the generated first workout to Firestore so it's immediately
 * available when the user lands on /home.
 */
async function persistFirstWorkout(
  userId: string,
  result: HomeWorkoutResult,
  location: ExecutionLocation,
  nearbyPark: Park | null,
): Promise<void> {
  const workoutDoc = {
    userId,
    workout: JSON.parse(JSON.stringify(result.workout)),
    location,
    parkId: nearbyPark?.id || null,
    parkName: nearbyPark?.name || null,
    isFirstWorkout: true,
    generatedAt: serverTimestamp(),
    meta: {
      exerciseCount: result.workout.exercises.length,
      estimatedDuration: result.workout.estimatedDuration,
      location: result.meta.location,
      persona: result.meta.persona,
    },
  };

  // Store in user's pending workout document
  await setDoc(
    doc(db, 'users', userId, 'pendingWorkouts', 'first'),
    workoutDoc,
    { merge: false },
  );

  // Also flag on the user profile that a workout is ready
  await setDoc(
    doc(db, 'users', userId),
    {
      firstWorkoutReady: true,
      firstWorkoutLocation: location,
      firstWorkoutParkId: nearbyPark?.id || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the user's base level from their progression domains.
 */
function getBaseLevel(userProfile: UserFullProfile): number {
  const domains = userProfile.progression?.domains ?? {};
  let maxLevel = 1;

  for (const domainId of Object.keys(domains)) {
    const level = (domains as Record<string, any>)[domainId]?.currentLevel;
    if (level && level > maxLevel) {
      maxLevel = level;
    }
  }

  return maxLevel;
}
