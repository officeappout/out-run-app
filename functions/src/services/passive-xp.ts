/**
 * passive-xp — server-only XP curve for passive sensor data.
 *
 * Native Phase rule (David, locked):
 *   • Steps and active minutes from HealthKit / Health Connect grant
 *     ONLY Global XP (Lemur rank). Never coins. Never per-program XP.
 *   • A daily cap prevents farming: even if a user "syncs" 200k steps
 *     somehow, they cap out at DAILY_PASSIVE_XP_CAP for that day.
 *
 * The cap is enforced server-side using a running counter on the daily
 * activity doc (`passiveXpAwardedToday`). This counter resets implicitly
 * every day because the doc id is `{uid}_{yyyy-mm-dd}`.
 */

/** 1 XP per N steps. */
export const STEPS_PER_XP = 100;

/** N XP per minute of HealthKit/HealthConnect active time. */
export const XP_PER_ACTIVE_MINUTE = 2;

/** Hard daily ceiling on XP awardable from passive sensor data. */
export const DAILY_PASSIVE_XP_CAP = 200;

export interface PassiveDelta {
  /** New steps observed this sync (already-deduped delta, not cumulative). */
  steps: number;
  /** New active minutes observed this sync (already-deduped delta). */
  activeMinutes: number;
}

/**
 * Compute the XP to award for this sync, respecting the daily cap.
 *
 * @param delta            New (deduped) passive metrics from this sync.
 * @param alreadyAwardedToday  XP already awarded today via the passive door
 *                             (read from `dailyActivity.passiveXpAwardedToday`).
 * @returns Object with `xpDelta` (the actual XP to grant, after cap) and
 *          `capReached` (true if we hit the ceiling — useful for UI hints).
 */
export function computePassiveXpDelta(
  delta: PassiveDelta,
  alreadyAwardedToday: number,
): { xpDelta: number; capReached: boolean } {
  const steps = Math.max(0, Math.floor(delta.steps));
  const activeMinutes = Math.max(0, Math.floor(delta.activeMinutes));

  const rawXp =
    Math.floor(steps / STEPS_PER_XP) +
    activeMinutes * XP_PER_ACTIVE_MINUTE;

  const remainingHeadroom = Math.max(0, DAILY_PASSIVE_XP_CAP - Math.max(0, alreadyAwardedToday));
  const xpDelta = Math.min(rawXp, remainingHeadroom);
  const capReached = rawXp > xpDelta || remainingHeadroom === 0;

  return { xpDelta, capReached };
}
