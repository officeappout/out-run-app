import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Step 6b's fire gate (WorkoutGenerator.ts's shouldFireGeneralFinisherTabata),
 * frozen behind GENERAL_FINISHER_TABATA_ENABLED (docs/workout-engine/
 * 03-CHANGES.md, Round 1 — David, 08.09.2026). Live-getter mock (same pattern
 * as hybrid-slots.test.ts) so both flag states are covered in one file.
 */
const flag = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/config/feature-flags', () => ({
  get GENERAL_FINISHER_TABATA_ENABLED() {
    return flag.enabled;
  },
  CONTEXT_AWARE_SELECTION_ENABLED: false,
}));

import { shouldFireGeneralFinisherTabata } from '../WorkoutGenerator';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  flag.enabled = false;
});

describe('shouldFireGeneralFinisherTabata — flag OFF (default)', () => {
  beforeEach(() => {
    flag.enabled = false;
  });

  it('never fires, even when every other condition is maximally favorable', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // would pass any roll
    expect(shouldFireGeneralFinisherTabata('single', 1, 3, 10)).toBe(false);
    expect(shouldFireGeneralFinisherTabata('follow_along', 0.9, 2, 20)).toBe(false);
    randomSpy.mockRestore();
  });

  it('short-circuits before the Math.random() roll — zero draws consumed while off', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    shouldFireGeneralFinisherTabata('single', 1, 3, 10);
    expect(randomSpy).not.toHaveBeenCalled();
    randomSpy.mockRestore();
  });

  it('coreForm===\'tabata\' (Step 6c already fired) still false — same as always', () => {
    expect(shouldFireGeneralFinisherTabata('tabata', 1, 3, 10)).toBe(false);
  });
});

describe('shouldFireGeneralFinisherTabata — flag ON (pre-freeze behavior, unchanged)', () => {
  beforeEach(() => {
    flag.enabled = true;
  });

  it('coreForm===\'tabata\' suppresses it (Step 6c already claimed the tabata shape)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldFireGeneralFinisherTabata('tabata', 1, 3, 10)).toBe(false);
  });

  it('tabataProbability 0 or undefined → false', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldFireGeneralFinisherTabata('single', 0, 3, 10)).toBe(false);
    expect(shouldFireGeneralFinisherTabata('single', undefined, 3, 10)).toBe(false);
  });

  it('difficulty < 2 (Bolt-1/regression) → false regardless of everything else', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldFireGeneralFinisherTabata('single', 1, 1, 10)).toBe(false);
  });

  it('userLevel below MIN_TABATA_USER_LEVEL (4) → false, including undefined→0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(shouldFireGeneralFinisherTabata('single', 1, 2, 3)).toBe(false);
    expect(shouldFireGeneralFinisherTabata('single', 1, 2, undefined)).toBe(false);
  });

  it('roll above tabataProbability → false; at/below → true', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.51);
    expect(shouldFireGeneralFinisherTabata('single', 0.5, 2, 4)).toBe(false);

    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(shouldFireGeneralFinisherTabata('single', 0.5, 2, 4)).toBe(true);

    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    expect(shouldFireGeneralFinisherTabata('single', 0.5, 2, 4)).toBe(true);
  });

  it('all conditions satisfied → fires', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(shouldFireGeneralFinisherTabata('follow_along', 0.8, 3, 12)).toBe(true);
  });
});
