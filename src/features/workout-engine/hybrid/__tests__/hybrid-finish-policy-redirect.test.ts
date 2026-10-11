import { describe, it, expect } from 'vitest';
import { shouldRedirectToHybridFinish, isNegligibleHybridSession } from '../hybrid-finish-policy';

/**
 * Regression — G7.1 (Sderot field test, 10.10.2026): 8 generic UI "Stop"/
 * "Finish" buttons call finishWorkout() directly with no idea a hybrid
 * session might be active. Before this, a direct call during an active
 * hybrid session hit the pre-existing suppression branch straight away —
 * 0 docs, no XP, no history, the entire workout silently discarded.
 *
 * Extracted to a pure predicate (alongside the sibling runnerShouldSelfSave
 * invariant this file already encodes) specifically so it's testable at
 * all — useRunningPlayer.ts itself transitively imports a .tsx file deep
 * in its dependency graph, and this repo's vitest cannot parse/import .tsx
 * files (see [[vitest-node-only-no-jsdom]]), so the real store can't be
 * imported directly for a behavioral test.
 */

describe('shouldRedirectToHybridFinish', () => {
  it('redirects a direct call (no flag) during an active hybrid session — the bug this fixes', () => {
    expect(shouldRedirectToHybridFinish(true, undefined)).toBe(true);
  });

  it('does NOT redirect finishHybrid\'s own internal teardown call — prevents infinite recursion', () => {
    expect(shouldRedirectToHybridFinish(true, true)).toBe(false);
  });

  it('never redirects a normal (non-hybrid) run, regardless of the flag', () => {
    expect(shouldRedirectToHybridFinish(false, undefined)).toBe(false);
    expect(shouldRedirectToHybridFinish(false, true)).toBe(false);
  });

  it('an explicit calledFromHybridTeardown:false behaves identically to omitting it', () => {
    expect(shouldRedirectToHybridFinish(true, false)).toBe(true);
  });
});

/**
 * Regression — G7.1 follow-up (11.10.2026, caught before merge): once the
 * generic Stop button redirects into the real hybrid save path, a trivial/
 * empty session (a quick test tap) must still be discarded — mirroring the
 * solo-run save's own minimum-activity guard — not saved unconditionally.
 */
describe('isNegligibleHybridSession', () => {
  it('discards a trivial tap: short duration, short distance, no sets', () => {
    expect(isNegligibleHybridSession(5, 0.02, 0)).toBe(true);
  });

  it('saves a real session: long enough duration, regardless of sets', () => {
    expect(isNegligibleHybridSession(120, 0.02, 0)).toBe(false);
  });

  it('saves a real session: real distance, even if short in time (edge case)', () => {
    expect(isNegligibleHybridSession(5, 0.5, 0)).toBe(false);
  });

  it('saves a strength-only session: real completed sets even with near-zero distance/duration', () => {
    expect(isNegligibleHybridSession(10, 0.01, 4)).toBe(false);
  });

  it('boundary: exactly 60s / exactly 0.1km / 0 sets is NOT negligible (strict <, matching the solo-run guard)', () => {
    expect(isNegligibleHybridSession(60, 0.02, 0)).toBe(false);
    expect(isNegligibleHybridSession(5, 0.1, 0)).toBe(false);
  });

  it('a genuinely empty session (all zeros) is negligible', () => {
    expect(isNegligibleHybridSession(0, 0, 0)).toBe(true);
  });
});
