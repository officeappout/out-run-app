import { describe, expect, it } from 'vitest';
import {
  contentEntryMotion,
  GOAL_HERO_HEIGHT,
  goalHeroHeightPx,
  headerSafeTop,
  stepScrollOverscroll,
} from '../fit-screen';

describe('fit-screen (onboarding v2 — no jumping on swipe)', () => {
  it('v2 scroll areas never rubber-band; legacy keeps contain', () => {
    expect(stepScrollOverscroll(true)).toBe('overscroll-none');
    expect(stepScrollOverscroll(false)).toBe('overscroll-contain');
  });

  it('header top inset is added once: not again when the host (<main>) pads it', () => {
    expect(headerSafeTop(true, true)).toBe('4px');
    expect(headerSafeTop(true, false)).toBe('calc(env(safe-area-inset-top, 0px) + 4px)');
    // legacy unchanged, whatever the host does
    expect(headerSafeTop(false, true)).toBe('env(safe-area-inset-top, 0px)');
    expect(headerSafeTop(false, false)).toBe('env(safe-area-inset-top, 0px)');
  });

  it('v2 content entry is a fade only (no y translate growing the scroll area); legacy unchanged', () => {
    expect(contentEntryMotion(true)).toEqual({ initial: { opacity: 0 }, animate: { opacity: 1 } });
    expect(contentEntryMotion(false)).toEqual({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } });
  });

  describe('running-goal hero height', () => {
    it('is the same 24vh as before on a roomy phone (iPhone 14, 844px)', () => {
      expect(goalHeroHeightPx(844, 47, 34)).toBeCloseTo(844 * 0.24, 5);
    });

    it('yields on short phones so the first question fits (SE 667, mini 812)', () => {
      expect(goalHeroHeightPx(667, 20, 0)).toBe(120); // was 160 → overflowed
      expect(goalHeroHeightPx(812, 50, 34)).toBeLessThan(812 * 0.24);
    });

    it('stays within 120…230 px', () => {
      for (const h of [500, 600, 700, 844, 932, 1400]) {
        const v = goalHeroHeightPx(h, 47, 34);
        expect(v).toBeGreaterThanOrEqual(120);
        expect(v).toBeLessThanOrEqual(230);
      }
    });

    it('the CSS expression mirrors the pure helper', () => {
      expect(GOAL_HERO_HEIGHT).toBe(
        'clamp(120px, min(24vh, calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 540px)), 230px)',
      );
    });
  });
});
