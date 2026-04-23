/**
 * Coin Calculator Service
 * Converts calories burned to coins (1:1 ratio)
 *
 * Fortress Phase (Apr 2026): all writes to progression.coins / .totalCaloriesBurned
 * are routed through the `awardWorkoutXP` Cloud Function. Direct client writes
 * are blocked by Firestore Security Rules (noGameIntegrityFieldsChanged).
 *
 * COIN_SYSTEM_PAUSED: Coin awarding is temporarily disabled.
 * Re-enable by setting IS_COIN_SYSTEM_ENABLED = true in feature-flags.ts.
 * When paused, only calories are still credited.
 */

import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import { awardWorkoutXP } from '@/lib/awardWorkoutXP';

/**
 * Calculate coins from calories (1:1 ratio)
 */
export function calculateCoinsFromCalories(calories: number): number {
  if (!IS_COIN_SYSTEM_ENABLED) {
    return 0;
  }
  return Math.floor(calories);
}

/**
 * Award coins to user after workout completion via the Guardian Cloud Function.
 * Uses atomic server-side increment so concurrent calls cannot race.
 *
 * `userId` is accepted for backwards compatibility with the previous signature
 * but is unused — the Guardian derives the uid from `request.auth`.
 */
export async function awardCoins(
  _userId: string,
  calories: number
): Promise<{ coins: number; success: boolean }> {
  const safeCalories = Math.max(0, Math.floor(calories));
  if (safeCalories === 0) {
    return { coins: 0, success: true };
  }

  const coins = calculateCoinsFromCalories(safeCalories);

  const result = await awardWorkoutXP({
    coinsDelta: coins,
    caloriesDelta: safeCalories,
    source: IS_COIN_SYSTEM_ENABLED ? 'workout:coins' : 'workout:calories',
  });

  if (!result) {
    return { coins: 0, success: false };
  }

  console.log(
    `✅ [CoinCalculator] Guardian credited ${result.coinsDelta} coins ` +
      `+ ${result.caloriesDelta} cal (${IS_COIN_SYSTEM_ENABLED ? 'enabled' : 'paused'})`,
  );
  return { coins: result.coinsDelta, success: true };
}

/**
 * Get estimated coins for a workout (preview)
 */
export function previewCoins(estimatedCalories: number): number {
  return calculateCoinsFromCalories(estimatedCalories);
}
