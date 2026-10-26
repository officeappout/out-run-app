/**
 * Pilot N4: the XP system is paused (client src/config/feature-flags.ts IS_XP_ENABLED =
 * false: no XP bar, no level number, no "stage" labels). Accrual still runs, so passive
 * steps (ingestHealthSamples grants Global XP) raised globalLevel and onLevelUp pushed
 * "you reached level 2" about a system the user cannot see. Level-up pushes follow the
 * same switch. Mirror of IS_XP_ENABLED; flip both together.
 */
export const LEVEL_UP_PUSH_ENABLED = false;

/** True only for a real numeric level increase above 1, and only while XP is shown. */
export function shouldSendLevelUpPush(
  prevLevel: unknown,
  newLevel: unknown,
  xpEnabled: boolean = LEVEL_UP_PUSH_ENABLED,
): boolean {
  if (!xpEnabled) return false;
  if (typeof newLevel !== 'number' || typeof prevLevel !== 'number') return false;
  return newLevel > prevLevel && newLevel > 1;
}
