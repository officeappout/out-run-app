import { describe, it, expect } from 'vitest';
import { COLLAPSE_DRAG_PX, COLLAPSE_FLICK_PX_S, collapsedAfterSwipe } from '../drawer-collapse';

describe('AD2: the "גרים ב…?" drawer collapses on a swipe down, expands on a swipe up', () => {
  it('a long or fast swipe down collapses', () => {
    expect(collapsedAfterSwipe(false, COLLAPSE_DRAG_PX + 1, 0)).toBe(true);
    expect(collapsedAfterSwipe(false, 5, COLLAPSE_FLICK_PX_S + 1)).toBe(true);
  });

  it('a long or fast swipe up expands', () => {
    expect(collapsedAfterSwipe(true, -(COLLAPSE_DRAG_PX + 1), 0)).toBe(false);
    expect(collapsedAfterSwipe(true, -5, -(COLLAPSE_FLICK_PX_S + 1))).toBe(false);
  });

  it('a tiny wobble keeps the current state', () => {
    expect(collapsedAfterSwipe(true, 10, 50)).toBe(true);
    expect(collapsedAfterSwipe(false, -10, -50)).toBe(false);
  });
});
