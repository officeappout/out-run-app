import { describe, expect, it } from 'vitest';
import { tabSwipeTarget } from '../tab-swipe';

const tabs = ['strength', 'health'] as const;

describe('tabSwipeTarget (AI1)', () => {
  it('RTL: a swipe right goes forward, left goes back; no wrap', () => {
    expect(tabSwipeTarget(tabs, 'strength', 80, 5, true)).toBe('health');
    expect(tabSwipeTarget(tabs, 'health', -80, 5, true)).toBe('strength');
    expect(tabSwipeTarget(tabs, 'health', 80, 5, true)).toBeNull();
  });
  it('LTR is mirrored', () => {
    expect(tabSwipeTarget(tabs, 'strength', -80, 0, false)).toBe('health');
    expect(tabSwipeTarget(tabs, 'health', 80, 0, false)).toBe('strength');
  });
  it('short or mostly-vertical moves are not swipes', () => {
    expect(tabSwipeTarget(tabs, 'strength', 30, 0, true)).toBeNull();
    expect(tabSwipeTarget(tabs, 'strength', 80, 70, true)).toBeNull();
  });
});
