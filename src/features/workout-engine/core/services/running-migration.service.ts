/**
 * Migration utility for existing user running profiles.
 *
 * Converts the legacy Firestore schema:
 *   { easyPace, thresholdPace, vo2MaxPace, qualityWorkoutsHistory }
 *
 * To the new PaceProfile schema:
 *   { basePace, profileType, qualityWorkoutsHistory, qualityWorkoutCount, lastSelfCorrectionDate }
 */

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PaceProfile, RunnerProfileType } from '../types/running.types';

interface LegacyPaceProfile {
  easyPace?: number;
  thresholdPace?: number;
  vo2MaxPace?: number;
  qualityWorkoutsHistory?: unknown[];
}

interface LegacyRunning {
  weeklyMileageGoal?: number;
  runFrequency?: number;
  activeProgram?: unknown;
  paceProfile?: LegacyPaceProfile;
}

/**
 * Detect whether a user document uses the legacy running schema.
 */
export function isLegacyRunningSchema(running: Record<string, unknown>): boolean {
  if (!running?.paceProfile) return false;
  const pp = running.paceProfile as Record<string, unknown>;
  return 'easyPace' in pp || 'thresholdPace' in pp || 'vo2MaxPace' in pp;
}

/**
 * Convert a legacy running.paceProfile → new PaceProfile.
 *
 * Best-effort: uses thresholdPace as basePace (closest conceptual match).
 * If thresholdPace is 0 or missing, falls back to easyPace, then 0.
 */
export function migratePaceProfile(legacy: LegacyPaceProfile): PaceProfile {
  const basePace = legacy.thresholdPace || legacy.easyPace || 0;
  const profileType: RunnerProfileType = basePace > 0 && basePace < 360 ? 1 : basePace >= 360 ? 2 : 3;

  return {
    basePace,
    profileType,
    qualityWorkoutsHistory: [],
    qualityWorkoutCount: 0,
    lastSelfCorrectionDate: null,
  };
}

/**
 * Build the new running profile object from a legacy one.
 */
export function migrateRunningProfile(legacy: LegacyRunning) {
  const newPaceProfile = migratePaceProfile(legacy.paceProfile ?? {});

  return {
    isUnlocked: (newPaceProfile.basePace > 0),
    currentGoal: newPaceProfile.profileType === 3 ? 'couch_to_5k' as const : 'improve_speed_5k' as const,
    activeProgram: legacy.activeProgram ?? null,
    paceProfile: newPaceProfile,
  };
}

/**
 * Migrate a single user document in Firestore from legacy → new schema.
 * Intended for batch migration scripts or on-read lazy migration.
 */
export async function migrateUserRunningProfile(
  userId: string,
  legacyRunning: LegacyRunning,
): Promise<boolean> {
  try {
    const migrated = migrateRunningProfile(legacyRunning);
    const userRef = doc(db, 'users', userId);

    await updateDoc(userRef, {
      running: migrated,
      updatedAt: serverTimestamp(),
    });

    console.log(`[RunningMigration] Migrated user ${userId} — basePace=${migrated.paceProfile.basePace}, profileType=${migrated.paceProfile.profileType}`);
    return true;
  } catch (error) {
    console.error(`[RunningMigration] Failed for user ${userId}:`, error);
    return false;
  }
}
