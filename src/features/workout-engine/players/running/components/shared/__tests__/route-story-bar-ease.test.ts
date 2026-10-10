import { describe, it, expect } from 'vitest';
import { easeFillTowards } from '../route-story-bar-ease';

/**
 * Regression — G3.4 (Sderot field test, 10.10.2026): the live route-progress
 * bar's RAF loop used to SNAP fillPct straight to the latest target every
 * frame. The upstream distance value only changes once every 4-5m (the GPS
 * noise-rejection threshold in useRunningPlayer.ts, untouched by this fix),
 * so the bar sat static then visibly jumped — "feels buggy" per the field
 * report. Fixed by easing toward the target each frame instead of snapping,
 * purely in the presentation layer.
 */

describe('easeFillTowards — continuous glide toward a step-updated target', () => {
  it('moves partway toward a higher target, never jumping straight to it', () => {
    const next = easeFillTowards(0, 100);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
  });

  it('converges to the target over repeated frames (the old bug: it never moved at all between upstream updates)', () => {
    let fill = 0;
    for (let i = 0; i < 60; i++) fill = easeFillTowards(fill, 42);
    expect(fill).toBeCloseTo(42, 1);
  });

  it('snaps exactly to the target once close enough, instead of approaching forever asymptotically', () => {
    const next = easeFillTowards(41.98, 42);
    expect(next).toBe(42);
  });

  it('eases symmetrically when the target drops (e.g. a corrected/lower reading)', () => {
    const next = easeFillTowards(50, 10);
    expect(next).toBeLessThan(50);
    expect(next).toBeGreaterThan(10);
  });

  it('is a no-op once already at the target', () => {
    expect(easeFillTowards(75, 75)).toBe(75);
  });
});
