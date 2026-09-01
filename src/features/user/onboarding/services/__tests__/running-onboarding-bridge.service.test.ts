import { describe, it, expect } from 'vitest';
import { bridgeRunningOnboarding } from '../running-onboarding-bridge.service';
import { clampRunningFrequency } from '@/lib/running-frequency-bounds';

/**
 * `bridgeRunningOnboarding` used to clamp weeklyFrequency in two places
 * with two different bounds -- `parseAnswers` (1-4) and the generation
 * call site (2-4). Unified 01.09.2026 to both call the same
 * `clampRunningFrequency` (`src/lib/running-frequency-bounds.ts`). These
 * tests exist to catch a regression back to two independent clamps, not
 * just to prove the current (obviously-consistent, same-function) code
 * is consistent -- if a future edit reintroduces a second, disconnected
 * clamp, one of these should start failing.
 */
describe('bridgeRunningOnboarding — frequency clamp unification', () => {
  it.each([
    [0, 2],
    [1, 2],
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 4],
    [100, 4],
  ])('raw weeklyFrequency=%i ends up as canonicalFrequency=%i, matching clampRunningFrequency directly', (raw, expected) => {
    const result = bridgeRunningOnboarding({
      goalPath: 'start_running',
      targetDistance: '5k',
      weeklyFrequency: raw,
    });
    expect(result.programTemplate.canonicalFrequency).toBe(expected);
    expect(result.programTemplate.canonicalFrequency).toBe(clampRunningFrequency(raw));
  });

  it('the structured runningOnboardingData returned also carries the clamped value, not the raw one -- both the generator input and the persisted answer trace to the same clamp', () => {
    const result = bridgeRunningOnboarding({
      goalPath: 'start_running',
      targetDistance: '5k',
      weeklyFrequency: 1,
    });
    expect(result.runningOnboardingData.weeklyFrequency).toBe(2);
    expect(result.planGeneratorInput.frequency).toBe(2);
  });
});
