import { describe, it, expect } from 'vitest';
import { shouldRedirectToHybridFinish } from '../hybrid-finish-policy';

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
