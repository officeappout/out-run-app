/**
 * Coin Calculator Service
 * Converts calories burned to coins (1:1 ratio)
 * 
 * COIN_SYSTEM_PAUSED: This service is temporarily disabled.
 * Re-enable in April by setting IS_COIN_SYSTEM_ENABLED = true in feature-flags.ts
 */

import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';

const USERS_COLLECTION = 'users';

/**
 * Calculate coins from calories (1:1 ratio)
 */
export function calculateCoinsFromCalories(calories: number): number {
  // COIN_SYSTEM_PAUSED: Re-enable in April
  if (!IS_COIN_SYSTEM_ENABLED) {
    return 0;
  }
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
  // COIN_SYSTEM_PAUSED: Re-enable in April
  // Only update calories, not coins
  if (!IS_COIN_SYSTEM_ENABLED) {
    try {
      const userDocRef = doc(db, USERS_COLLECTION, userId);
      // Only update calories tracking, skip coin increment
      await updateDoc(userDocRef, {
        'progression.totalCaloriesBurned': increment(calories),
        updatedAt: serverTimestamp(),
      });
      console.log(`[CoinCalculator] COIN_SYSTEM_PAUSED - Updated calories only (${calories}) for user ${userId}`);
      return { coins: 0, success: true };
    } catch (error) {
      console.error('[CoinCalculator] Error updating calories:', error);
      return { coins: 0, success: false };
    }
  }

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
