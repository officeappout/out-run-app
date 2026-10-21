import { describe, it, expect } from 'vitest';
import {
  COACH_CARET_INSET, COACH_FINGER_GAP, COACH_GAP, COACH_GUTTER, COACH_MIN_DWELL_MS, COACH_OCCLUDER_GAP,
  clipCoachBox, coachScrollMarginTop, coachSkipVisible, placeCoachBubble,
} from '../coach-marks/coach-placement';

const root = { rootW: 390, rootH: 844 };

describe('coach bubble placement (owner note 21.10 #6 — anchored to the real element)', () => {
  it('target in the top half → bubble below it, caret under the target centre', () => {
    const p = placeCoachBubble({ ...root, box: { top: 60, left: 20, width: 100, height: 44 } });
    expect(p.side).toBe('below');
    expect(p.top).toBe(60 + 44 + COACH_GAP);
    expect(p.caretX).toBe(20 + 50 - COACH_GUTTER);
  });
  it('target in the bottom half → bubble above it', () => {
    const p = placeCoachBubble({ ...root, box: { top: 700, left: 100, width: 190, height: 60 } });
    expect(p.side).toBe('above');
    expect(p.bottom).toBe(844 - 700 + COACH_GAP);
  });
  it('the tapping finger gets extra room', () => {
    const p = placeCoachBubble({ ...root, box: { top: 60, left: 20, width: 100, height: 44 }, finger: true });
    expect(p.top).toBe(60 + 44 + COACH_FINGER_GAP);
  });
  it('the caret stays off the rounded corners', () => {
    const left = placeCoachBubble({ ...root, box: { top: 60, left: 0, width: 10, height: 10 } });
    const right = placeCoachBubble({ ...root, box: { top: 60, left: 380, width: 10, height: 10 } });
    expect(left.caretX).toBe(COACH_CARET_INSET);
    expect(right.caretX).toBe(390 - 2 * COACH_GUTTER - COACH_CARET_INSET);
  });
  it('no target → centred, no caret', () => {
    const p = placeCoachBubble({ ...root, box: null });
    expect(p.side).toBe('center');
    expect(p.caretX).toBeNull();
  });
  it('a step cannot be skipped by a double tap', () => {
    expect(COACH_MIN_DWELL_MS).toBeGreaterThanOrEqual(400);
  });
});

describe('tour fixes round 2 — header occluders and the in-bubble "דלג"', () => {
  it('scroll margin = header bottom below the scroller top + gap; none without a header', () => {
    expect(coachScrollMarginTop({ occluderBottom: null, scrollerTop: 0 })).toBe(0);
    expect(coachScrollMarginTop({ occluderBottom: 180, scrollerTop: 0 })).toBe(180 + COACH_OCCLUDER_GAP);
    expect(coachScrollMarginTop({ occluderBottom: 180, scrollerTop: 40, gap: 0 })).toBe(140);
    expect(coachScrollMarginTop({ occluderBottom: 20, scrollerTop: 100 })).toBe(0);
  });
  it('the hole is clipped to below the header (never shows "סט 1 מתוך 3")', () => {
    const box = { top: 150, left: 20, width: 350, height: 70 };
    expect(clipCoachBox(box, null)).toEqual(box);
    expect(clipCoachBox(box, 100)).toEqual(box);
    expect(clipCoachBox(box, 180)).toEqual({ top: 180, left: 20, width: 350, height: 40 });
    // fully under the header — kept as is (the scroll should have moved it)
    expect(clipCoachBox(box, 300)).toEqual(box);
  });
  it('"דלג" sits in the bubble on every step but the last', () => {
    expect(coachSkipVisible(0, 3)).toBe(true);
    expect(coachSkipVisible(1, 3)).toBe(true);
    expect(coachSkipVisible(2, 3)).toBe(false);
    expect(coachSkipVisible(0, 1)).toBe(false);
  });
});
