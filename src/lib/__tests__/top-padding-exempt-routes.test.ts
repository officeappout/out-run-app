import { describe, it, expect } from 'vitest';
import { isTopPaddingExemptRoute } from '../top-padding-exempt-routes';

// Moved verbatim out of ClientLayout — pins the behaviour the v2
// OnboardingLayout header relies on (main pads the notch on these routes).
describe('isTopPaddingExemptRoute', () => {
  it('onboarding routes other than profile are padded by <main>', () => {
    for (const r of ['/onboarding-new/program-path', '/onboarding-new/assessment-visual', '/onboarding-new/health', '/onboarding-new/running-summary']) {
      expect(isTopPaddingExemptRoute(r)).toBe(false);
    }
  });
  it('keeps the existing exemptions', () => {
    expect(isTopPaddingExemptRoute('/onboarding-new/profile')).toBe(true);
    expect(isTopPaddingExemptRoute('/community/abc')).toBe(true);
    expect(isTopPaddingExemptRoute('/community')).toBe(false);
    expect(isTopPaddingExemptRoute('/profile/u1')).toBe(true);
    expect(isTopPaddingExemptRoute('/profile/exercise/x')).toBe(false);
    expect(isTopPaddingExemptRoute('/workouts/1/overview')).toBe(true);
    expect(isTopPaddingExemptRoute('/workouts/1/active')).toBe(false);
  });
});
