/**
 * swipe-hint — which "you can swipe" nudge the map carousel plays (G1.1, Sderot pilot). Pure;
 * HybridSlotCarousel applies it.
 *
 * Flag off (`enable_carousel_swipe_hint`): #207's original quick nudge — decided inline in the
 * carousel exactly as before (this returns 'none' so it never interferes).
 * Flag on: v2 — a clearer nudge (waits for the card row to settle, moves further), once per user
 * via its own onboardingPrefs key, only when there IS a second card to reveal, and burned on
 * completion OR as soon as the user swipes on their own.
 */
export const SWIPE_HINT_V2 = {
  /** Wait for the title-bar slide-in + settle preview before moving (s). */
  delayS: 0.7,
  durationS: 0.9,
  /** How far the track moves toward the next card (px). */
  offsetPx: 40,
} as const;

export function resolveSwipeNudge(i: {
  swipeHint: boolean;
  slotCount: number;
  v1Played: boolean;
  v2Played: boolean;
}): 'v2' | 'none' {
  if (!i.swipeHint) return 'none';
  return i.slotCount > 1 && !i.v2Played ? 'v2' : 'none';
}
