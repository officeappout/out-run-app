/**
 * Lemur Evolution Service
 * Manages 10-stage lemur progression based on days active (persistence metric)
 */

import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USERS_COLLECTION = 'users';

/**
 * Lemur Stage Definition
 */
export interface LemurStage {
  stage: number;
  minDays: number;
  name: string;
  image: string;
  description: string;
}

/**
 * 10-Stage Lemur Evolution System
 * Based on days active (consistency/persistence)
 */
export const LEMUR_STAGES: readonly LemurStage[] = [
  {
    stage: 1,
    minDays: 0,
    name: 'Hatchling',
    image: '/assets/lemur/level1.png',
    description: 'התחלת את המסע! 🥚',
  },
  {
    stage: 2,
    minDays: 3,
    name: 'Explorer',
    image: '/assets/lemur/level2.png',
    description: '3 ימים רצופים - אתה בדרך! 🌱',
  },
  {
    stage: 3,
    minDays: 7,
    name: 'Adventurer',
    image: '/assets/lemur/level3.png',
    description: 'שבוע שלם! התמדה מדהימה 🚀',
  },
  {
    stage: 4,
    minDays: 14,
    name: 'Warrior',
    image: '/assets/lemur/level4.png',
    description: 'שבועיים! אתה לוחם אמיתי ⚔️',
  },
  {
    stage: 5,
    minDays: 21,
    name: 'Champion',
    image: '/assets/lemur/level5.png',
    description: '3 שבועות! הרגל נוצר 🏆',
  },
  {
    stage: 6,
    minDays: 30,
    name: 'Hero',
    image: '/assets/lemur/level6.png',
    description: 'חודש שלם! גיבור אמיתי 🦸',
  },
  {
    stage: 7,
    minDays: 45,
    name: 'Legend',
    image: '/assets/lemur/level7.png',
    description: '45 ימים! אתה אגדה 🌟',
  },
  {
    stage: 8,
    minDays: 60,
    name: 'Master',
    image: '/assets/lemur/level8.png',
    description: 'חודשיים! מאסטר מן המניין 🥋',
  },
  {
    stage: 9,
    minDays: 90,
    name: 'Grandmaster',
    image: '/assets/lemur/level9.png',
    description: '3 חודשים! גרנדמאסטר 👑',
  },
  {
    stage: 10,
    minDays: 120,
    name: 'King Lemur',
    image: '/assets/lemur/king-lemur.png',
    description: '4 חודשים! מלך הלמורים 🦁',
  },
] as const;

/**
 * Get lemur stage based on days active
 */
export function getLemurStage(daysActive: number): LemurStage {
  // Find the highest stage where daysActive >= minDays
  let currentStage = LEMUR_STAGES[0];

  for (const stage of LEMUR_STAGES) {
    if (daysActive >= stage.minDays) {
      currentStage = stage;
    } else {
      break; // Stages are ordered, so stop when we exceed daysActive
    }
  }

  return currentStage;
}

/**
 * Get next lemur stage (for progress display)
 */
export function getNextLemurStage(
  currentStage: number
): LemurStage | null {
  const nextStageIndex = currentStage; // stages are 1-indexed, array is 0-indexed
  if (nextStageIndex >= LEMUR_STAGES.length) {
    return null; // Already at max stage
  }
  return LEMUR_STAGES[nextStageIndex];
}

/**
 * Calculate progress to next stage (percentage)
 */
export function getProgressToNextStage(daysActive: number): {
  current: LemurStage;
  next: LemurStage | null;
  progressPercent: number;
} {
  const current = getLemurStage(daysActive);
  const next = getNextLemurStage(current.stage);

  if (!next) {
    return { current, next: null, progressPercent: 100 };
  }

  const daysInCurrentStage = daysActive - current.minDays;
  const daysNeededForNext = next.minDays - current.minDays;
  const progressPercent = Math.min(
    100,
    Math.floor((daysInCurrentStage / daysNeededForNext) * 100)
  );

  return { current, next, progressPercent };
}

/**
 * Record workout activity and update days active
 * Called when user completes a workout
 */
export async function recordActivity(userId: string): Promise<{
  daysActive: number;
  lemurStage: number;
  evolved: boolean;
}> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('[LemurEvolution] User not found:', userId);
      return { daysActive: 0, lemurStage: 1, evolved: false };
    }

    const userData = userDoc.data();
    const progression = userData.progression || {};

    // Get current state
    const currentDaysActive = progression.daysActive || 0;
    const currentStage = progression.lemurStage || 1;
    const lastActiveDate = progression.lastActiveDate || '';

    // Get today's date (YYYY-MM-DD format)
    const today = new Date().toISOString().split('T')[0];

    let newDaysActive = currentDaysActive;
    let shouldIncrementDays = false;

    // Only increment if this is a new day
    if (lastActiveDate !== today) {
      newDaysActive = currentDaysActive + 1;
      shouldIncrementDays = true;
    }

    // Check if lemur evolved
    const newLemurData = getLemurStage(newDaysActive);
    const evolved = newLemurData.stage > currentStage;

    // Update Firestore
    if (shouldIncrementDays) {
      await updateDoc(userDocRef, {
        'progression.daysActive': newDaysActive,
        'progression.lastActiveDate': today,
        'progression.lemurStage': newLemurData.stage,
      });

      if (evolved) {
        console.log(
          `🎉 [LemurEvolution] User ${userId} evolved to stage ${newLemurData.stage}: ${newLemurData.name}`
        );
      }
    }

    return {
      daysActive: newDaysActive,
      lemurStage: newLemurData.stage,
      evolved,
    };
  } catch (error) {
    console.error('[LemurEvolution] Error recording activity:', error);
    return { daysActive: 0, lemurStage: 1, evolved: false };
  }
}

/**
 * Initialize lemur progression for new user
 */
export async function initializeLemurProgression(
  userId: string
): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userDocRef, {
      'progression.daysActive': 0,
      'progression.lemurStage': 1,
      'progression.lastActiveDate': '',
    });
  } catch (error) {
    console.error('[LemurEvolution] Error initializing:', error);
  }
}
