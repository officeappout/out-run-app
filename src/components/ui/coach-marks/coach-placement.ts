/**
 * CoachMarks — where a bubble sits relative to its spotlit target. Pure, unit-tested.
 *
 * The bubble spans the screen width (minus the side gutter) above or below the
 * target, whichever half has room; its caret points at the target's centre so
 * the bubble visibly belongs to the element it explains.
 */

export interface CoachBox { top: number; left: number; width: number; height: number }

export interface CoachPlacement {
  side: 'below' | 'above' | 'center';
  /** px from the root's top (below / center) */
  top?: number;
  /** px from the root's bottom (above) */
  bottom?: number;
  /** caret centre, px from the bubble's LEFT edge; null = no caret (centered bubble) */
  caretX: number | null;
}

/** Side gutter of the bubble (Tailwind left-5 / right-5). */
export const COACH_GUTTER = 20;
/** Gap between the target and the bubble (more when the tapping finger sits on it). */
export const COACH_GAP = 14;
export const COACH_FINGER_GAP = 54;
/** The caret stays clear of the bubble's rounded corners. */
export const COACH_CARET_INSET = 26;

export function placeCoachBubble(input: {
  box: CoachBox | null;
  rootW: number;
  rootH: number;
  finger?: boolean | 'swipe';
}): CoachPlacement {
  const { box, rootW, rootH } = input;
  if (!box) return { side: 'center', top: Math.round(rootH * 0.4), caretX: null };
  const below = box.top + box.height / 2 < rootH / 2;
  const bubbleW = Math.max(0, rootW - 2 * COACH_GUTTER);
  const targetX = box.left + box.width / 2 - COACH_GUTTER;
  const caretX = Math.min(Math.max(targetX, COACH_CARET_INSET), Math.max(COACH_CARET_INSET, bubbleW - COACH_CARET_INSET));
  if (below) {
    return { side: 'below', top: box.top + box.height + (input.finger === true ? COACH_FINGER_GAP : COACH_GAP), caretX };
  }
  return { side: 'above', bottom: rootH - box.top + COACH_GAP, caretX };
}

/** Minimum time a step stays before "הבא" accepts a tap (stops a double tap skipping a step). */
export const COACH_MIN_DWELL_MS = 600;
