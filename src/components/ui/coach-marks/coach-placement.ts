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

// ── Screen headers that paint over scrolled content (tour fixes round 2, 21.10) ─────────────
// A screen marks its overlaying header `data-coach-occluder` (e.g. the strength player's
// RunnerHeader with its white fade). A target that is NOT inside such a header must sit fully
// below it: the scroll leaves a header-high margin, and the spotlight never reaches under it.

/** Extra room between an occluding header's bottom and the scrolled-in target. */
export const COACH_OCCLUDER_GAP = 8;

/** `scroll-margin-top` (px) for a target so scrollIntoView parks it below the header. */
export function coachScrollMarginTop(input: {
  /** Header bottom (viewport px); null = no occluding header on screen. */
  occluderBottom: number | null;
  /** The target's scroll container top (viewport px); 0 for the document. */
  scrollerTop: number;
  gap?: number;
}): number {
  if (input.occluderBottom == null) return 0;
  return Math.max(0, Math.round(input.occluderBottom - input.scrollerTop + (input.gap ?? COACH_OCCLUDER_GAP)));
}

/**
 * The spotlight hugs only the target: when the (padded) box pokes up under a header, its top
 * is clipped to the header's bottom so the header's own content ("סט 1 מתוך 3") never falls
 * inside the hole. A box fully under the header (should not happen after the scroll) is kept.
 */
export function clipCoachBox(box: CoachBox, clearTop: number | null): CoachBox {
  if (clearTop == null || box.top >= clearTop) return box;
  const bottom = box.top + box.height;
  if (bottom <= clearTop) return box;
  return { ...box, top: clearTop, height: bottom - clearTop };
}

/**
 * "דלג" — ONE rule for every tour (entry bubble): a secondary text button inside the bubble,
 * next to "הבא", so it never covers the target or the screen's header controls (progress bars,
 * "תחנה 1 מתוך 2", the lap ring). Not on the last step — "הבנתי" ends the tour there.
 */
export function coachSkipVisible(index: number, total: number): boolean {
  return total > 1 && index < total - 1;
}
