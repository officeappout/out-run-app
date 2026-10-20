import { describe, expect, it } from 'vitest';
import { REVEAL_MAX_DELAY_MS, revealDelayMs, revealStyle } from '../reveal';

describe('reveal timing', () => {
  it('staggers 80ms per block, capped', () => {
    expect(revealDelayMs(0)).toBe(0);
    expect(revealDelayMs(2)).toBe(160);
    expect(revealDelayMs(50)).toBe(REVEAL_MAX_DELAY_MS);
  });
  it('hidden → shown rises from 14px; reduced motion has no transform', () => {
    expect(revealStyle({ shown: false, index: 1, reduce: false })).toMatchObject({ opacity: 0, transform: 'translateY(14px)' });
    expect(revealStyle({ shown: true, index: 1, reduce: false })).toMatchObject({ opacity: 1, transform: 'translateY(0)' });
    expect(revealStyle({ shown: false, index: 1, reduce: true })).toEqual({ opacity: 1 });
  });
});
