/**
 * player-controls.utils — pure helpers behind the strength player's rest/set controls
 * (G2.4 field-test fixes). Plain .ts so the node-only vitest can cover them.
 */

/** "+15 שנ׳" on the rest screen: extend the CURRENT rest. A rest already at 0 (auto-advance
 *  off, waiting for a tap) restarts from 0, so the user gets the full extra seconds. */
export const REST_EXTEND_SECONDS = 15;
export function extendRestSeconds(current: number, add: number = REST_EXTEND_SECONDS): number {
  const base = Number.isFinite(current) ? Math.max(0, current) : 0;
  return base + Math.max(0, add);
}

/** Seconds before the end of a rest at which the early warning beep fires (on top of 3-2-1). */
export const REST_EARLY_WARNING_SECONDS = 5;

/** Which countdown cue (if any) a rest second should play. `next` = seconds left after the tick. */
export function restBeepForSecond(next: number): 'short' | 'long' | null {
  if (next === REST_EARLY_WARNING_SECONDS || next === 3 || next === 2) return 'short';
  if (next === 1) return 'long';
  return null;
}

/**
 * "סט X מתוך Y" next to the set pills. X = the set being worked on: the first set with no
 * logged reps when one exists (a re-edit can leave a gap), else the machine's current round.
 * Returns null when there's nothing meaningful to show (single set / bad input).
 */
export function setCounterLabel(firstIncompleteSetIdx: number, currentRound: number, totalSets: number): string | null {
  if (!Number.isFinite(totalSets) || totalSets <= 1) return null;
  const raw = firstIncompleteSetIdx >= 0 ? firstIncompleteSetIdx + 1 : currentRound;
  const current = Math.min(Math.max(1, Math.round(raw || 1)), totalSets);
  return `סט ${current} מתוך ${totalSets}`;
}
