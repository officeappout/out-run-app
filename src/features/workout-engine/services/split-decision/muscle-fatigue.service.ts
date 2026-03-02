/**
 * Muscle Fatigue Service — 48-Hour Shield Persistence
 *
 * Persists trained muscle groups to Firestore after workout completion.
 * Used by the Split Decision Engine to exclude recently trained muscles
 * for Habit Builder path (beginners 4-6 days/week).
 *
 * @see SplitDecisionService
 * @see split-decision.types.ts
 */

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';

const USERS_COLLECTION = 'users';

export interface TrackMuscleUsageInput {
  userId: string;
  sessionId?: string;
  trainedMuscleGroups: MuscleGroup[];
  sessionDate: string; // 'YYYY-MM-DD'
  sessionFocus?: string; // 'push' | 'pull' for rotation
}

/**
 * Persist muscle usage to the user's Firestore document.
 * Updates progression.lastSessionMuscleGroups, lastSessionDate, and lastSessionFocus.
 *
 * @param input - userId, trainedMuscleGroups, sessionDate, optional sessionFocus
 */
export async function trackMuscleUsage(input: TrackMuscleUsageInput): Promise<void> {
  const { userId, trainedMuscleGroups, sessionDate, sessionFocus } = input;

  if (!userId) {
    console.warn('[MuscleFatigue] trackMuscleUsage: missing userId');
    return;
  }

  const updateData: Record<string, unknown> = {
    'progression.lastSessionMuscleGroups': trainedMuscleGroups,
    'progression.lastSessionDate': sessionDate,
    updatedAt: serverTimestamp(),
  };

  if (sessionFocus) {
    updateData['progression.lastSessionFocus'] = sessionFocus;
  }

  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, updateData);
    console.log(
      `[MuscleFatigue] Tracked ${trainedMuscleGroups.length} muscle groups for ${userId} on ${sessionDate}` +
        (sessionFocus ? ` (focus: ${sessionFocus})` : '')
    );
  } catch (error) {
    console.error('[MuscleFatigue] Failed to track muscle usage:', error);
    throw error;
  }
}
