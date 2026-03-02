/**
 * Adaptive Rest Service
 *
 * Implements the Smart Rest Loop:
 *
 * Nudge Down (Efficiency):
 *   If user hits/exceeds recommendedValue for 3 consecutive sessions
 *   while resting shorter than prescribed →
 *     Reduce base rest by 15s (Flow/Easy) or 30s (Match/Hard/Elite).
 *   Safety Floor: Never below 70 % of tier minimum.
 *
 * Nudge Up — Immediate:
 *   If user fails to hit Min Reps in a set → add 30s to next set rest.
 *   UI message: "Recovery boost: +30s added for quality."
 *
 * Nudge Up — Long-term:
 *   If failure persists across a session → increase base rest for that
 *   exercise by 30s in the next session.
 *
 * Persistence:
 *   Adapted values are stored per-user per-exercise in Firestore:
 *     users/{uid}/exerciseProgression/{exerciseId}
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// TYPES
// ============================================================================

export interface ExerciseAdaptation {
  exerciseId: string;
  /** Adapted rest offset in seconds (can be negative for nudge-down, positive for nudge-up) */
  restOffset: number;
  /** Number of consecutive successful sessions (for nudge-down counting) */
  consecutiveSuccesses: number;
  /** Whether the last session had a failure (for long-term nudge-up) */
  lastSessionFailed: boolean;
  updatedAt?: Date;
}

/** Tier categories for rest nudge step size */
type RestTierGroup = 'flow_easy' | 'match_hard_elite';

// ============================================================================
// CONSTANTS
// ============================================================================

const NUDGE_DOWN_THRESHOLD = 3;      // sessions before reducing
const NUDGE_DOWN_SMALL = 15;         // seconds — Flow/Easy
const NUDGE_DOWN_LARGE = 30;         // seconds — Match/Hard/Elite
const NUDGE_UP_IMMEDIATE = 30;       // seconds added to next set
const NUDGE_UP_LONGTERM = 30;        // seconds added to base for next session
const SAFETY_FLOOR_RATIO = 0.70;     // 70% of tier minimum

// ============================================================================
// HELPER
// ============================================================================

function tierGroup(tierName: string): RestTierGroup {
  if (tierName === 'flow' || tierName === 'easy') return 'flow_easy';
  return 'match_hard_elite';
}

// ============================================================================
// FIRESTORE I/O
// ============================================================================

const SUBCOLLECTION = 'exerciseProgression';

/**
 * Fetch the adaptation record for a specific exercise for a user.
 * Returns null if no record exists (first encounter).
 */
export async function getExerciseAdaptation(
  userId: string,
  exerciseId: string,
): Promise<ExerciseAdaptation | null> {
  try {
    const ref = doc(db, 'users', userId, SUBCOLLECTION, exerciseId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as ExerciseAdaptation;
  } catch (e) {
    console.error('[AdaptiveRest] Failed to load adaptation:', e);
    return null;
  }
}

/**
 * Persist the adaptation record.
 */
export async function saveExerciseAdaptation(
  userId: string,
  adaptation: ExerciseAdaptation,
): Promise<void> {
  try {
    const ref = doc(db, 'users', userId, SUBCOLLECTION, adaptation.exerciseId);
    await setDoc(ref, { ...adaptation, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error('[AdaptiveRest] Failed to save adaptation:', e);
  }
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Apply the adapted rest offset to a tier-prescribed rest value.
 *
 * @param tierRestSeconds - The rest the tier engine prescribed for this set
 * @param adaptation      - Persisted adaptation record (or null if first time)
 * @param tierMinRest     - The tier's configured minimum rest (for safety floor)
 * @returns Adjusted rest in seconds
 */
export function applyAdaptedRest(
  tierRestSeconds: number,
  adaptation: ExerciseAdaptation | null,
  tierMinRest: number,
): number {
  if (!adaptation) return tierRestSeconds;

  const floor = Math.round(tierMinRest * SAFETY_FLOOR_RATIO);
  return Math.max(floor, tierRestSeconds + adaptation.restOffset);
}

/**
 * Compute an immediate nudge-up for the next set when the user
 * fails to reach the tier's minimum reps.
 *
 * Returns the bonus seconds to add, plus a UI message.
 */
export function computeImmediateNudgeUp(
  actualReps: number,
  tierMinReps: number,
): { bonusSeconds: number; message: string | null } {
  if (actualReps >= tierMinReps) {
    return { bonusSeconds: 0, message: null };
  }
  return {
    bonusSeconds: NUDGE_UP_IMMEDIATE,
    message: `Recovery boost: +${NUDGE_UP_IMMEDIATE}s added for quality.`,
  };
}

/**
 * Process end-of-session results for a single exercise and return
 * the updated adaptation to be persisted.
 *
 * @param previous        - Existing adaptation (or null)
 * @param exerciseId      - Exercise ID
 * @param hitTarget       - Did the user meet the recommended value every set?
 * @param avgActualRest   - Average rest the user actually took (seconds)
 * @param prescribedRest  - The rest that was prescribed (before adaptation)
 * @param tierName        - The tier this exercise fell into
 * @param tierMinRest     - Tier's configured minimum rest
 */
export function processSessionRestAdaptation(
  previous: ExerciseAdaptation | null,
  exerciseId: string,
  hitTarget: boolean,
  avgActualRest: number,
  prescribedRest: number,
  tierName: string,
  tierMinRest: number,
): ExerciseAdaptation {
  const base: ExerciseAdaptation = previous ?? {
    exerciseId,
    restOffset: 0,
    consecutiveSuccesses: 0,
    lastSessionFailed: false,
  };

  const group = tierGroup(tierName);
  const nudgeStep = group === 'flow_easy' ? NUDGE_DOWN_SMALL : NUDGE_DOWN_LARGE;
  const floor = Math.round(tierMinRest * SAFETY_FLOOR_RATIO);

  if (hitTarget) {
    const newStreak = base.consecutiveSuccesses + 1;
    const restedShorter = avgActualRest < prescribedRest;

    if (newStreak >= NUDGE_DOWN_THRESHOLD && restedShorter) {
      // ── Nudge Down: user is efficient — reduce rest ──
      const newOffset = base.restOffset - nudgeStep;
      // Ensure adapted rest doesn't drop below safety floor
      const wouldBe = prescribedRest + newOffset;
      const clampedOffset = wouldBe >= floor ? newOffset : base.restOffset;

      return {
        exerciseId,
        restOffset: clampedOffset,
        consecutiveSuccesses: 0, // Reset streak after nudge
        lastSessionFailed: false,
      };
    }

    return {
      exerciseId,
      restOffset: base.restOffset,
      consecutiveSuccesses: newStreak,
      lastSessionFailed: false,
    };
  }

  // ── Failure: Nudge Up (long-term) ──
  return {
    exerciseId,
    restOffset: base.restOffset + NUDGE_UP_LONGTERM,
    consecutiveSuccesses: 0,
    lastSessionFailed: true,
  };
}
