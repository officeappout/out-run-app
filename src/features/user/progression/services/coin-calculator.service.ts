/**
 * Coin Calculator Service
 * Converts calories burned to coins (1:1 ratio)
 */

import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const USERS_COLLECTION = 'users';

/**
 * Calculate coins from calories (1:1 ratio)
 */
export function calculateCoinsFromCalories(calories: number): number {
  return Math.floor(calories); // 1 calorie = 1 coin, rounded down
}

/**
 * Award coins to user after workout completion
 * Updates both coins and totalCaloriesBurned in Firestore using atomic increment
 */
export async function awardCoins(
  userId: string,
  calories: number
): Promise<{ coins: number; success: boolean }> {
  try {
    const coins = calculateCoinsFromCalories(calories);
    const userDocRef = doc(db, USERS_COLLECTION, userId);

    // Use atomic increment to prevent race conditions and ensure proper accumulation
    await updateDoc(userDocRef, {
      'progression.coins': increment(coins),
      'progression.totalCaloriesBurned': increment(calories),
      updatedAt: serverTimestamp(),
    });

    console.log(`✅ [CoinCalculator] Awarded ${coins} coins (${calories} calories) to user ${userId} using atomic increment`);
    return { coins, success: true };
  } catch (error) {
    console.error('[CoinCalculator] Error awarding coins:', error);
    return { coins: 0, success: false };
  }
}

/**
 * Get estimated coins for a workout (preview)
 */
export function previewCoins(estimatedCalories: number): number {
  return calculateCoinsFromCalories(estimatedCalories);
}
