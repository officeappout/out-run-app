/**
 * The slider's swipe hint (owner 28.10, Y2: a nudge, not a text pill over the card). Pure (tested).
 * Swiping toward the reading-start side brings the harder card in (see swipeDirection), so the
 * nudge leans that way: right in Hebrew, left in English.
 */

export const NUDGE_PX = 14;
/** Two short leans, then a pause; the loop runs until the first move. */
export const NUDGE_DURATION_S = 1.4;
export const NUDGE_REPEAT_DELAY_S = 1.6;

/** x keyframes for the cards row and the finger: rest, lean, rest, lean, rest. */
export function nudgeKeyframes(rtl: boolean): number[] {
  const lean = rtl ? NUDGE_PX : -NUDGE_PX;
  return [0, lean, 0, lean, 0];
}
