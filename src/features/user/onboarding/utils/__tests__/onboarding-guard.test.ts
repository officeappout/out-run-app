import { describe, it, expect } from 'vitest';
import { shouldInitOnboardingEngine } from '../onboarding-guard';

// Pins the guard fix in dynamic/page.tsx: gateway_track === 'RUNNING' bypasses
// hasCompletedOnboarding() so a returning user (strength user adding running,
// or a running user hitting Reset/Rebuild) can re-enter — but the strength
// branch (isRunningTrack === false) must be byte-identical to the
// pre-existing !hasCompletedOnboarding() check. This is the test that buys
// the "zero regression to the strength flow" claim with evidence instead of
// a logical argument alone — case 2 below is exactly what a future change to
// this condition would need to keep passing.
describe('shouldInitOnboardingEngine', () => {
  it('strength track, new user (never onboarded) → initializes the engine', () => {
    expect(shouldInitOnboardingEngine(false, false)).toBe(true);
  });

  it('strength track, already-completed user → blocked, redirected to /home (unchanged pre-existing behavior)', () => {
    expect(shouldInitOnboardingEngine(false, true)).toBe(false);
  });

  it('running track, new user → initializes the engine', () => {
    expect(shouldInitOnboardingEngine(true, false)).toBe(true);
  });

  it('running track, already-completed user (e.g. Reset/Rebuild, or a returning strength user adding running) → bypasses the block', () => {
    expect(shouldInitOnboardingEngine(true, true)).toBe(true);
  });
});
