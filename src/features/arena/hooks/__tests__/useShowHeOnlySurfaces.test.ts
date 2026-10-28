import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));
vi.mock('@/features/user/identity/store/useUserStore', () => ({ useUserStore: () => false }));
vi.mock('@/store/useLocaleStore', () => ({ useLocaleStore: () => 'he' }));
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null }));

import { useShowHeOnlySteps } from '@/features/user/onboarding/hooks/useShowHeOnlySteps';
import { shouldShowHeOnlySteps } from '@/features/user/onboarding/utils/he-only-steps';
import { useShowHeOnlySurfaces, withoutHeOnlyGroupTypes } from '../useShowHeOnlySurfaces';

const CARDS = [{ type: 'friends' }, { type: 'school' }, { type: 'military' }] as const;
const offered = (locale: string, flagOn: boolean) =>
  withoutHeOnlyGroupTypes(CARDS, shouldShowHeOnlySteps({ locale, flagOn }), (c) => c.type).map((c) => c.type);

describe('Hebrew-only community surfaces (same rule as onboarding)', () => {
  it('flag off: every locale keeps the unit card', () => {
    expect(offered('he', false)).toEqual(['friends', 'school', 'military']);
    expect(offered('en', false)).toEqual(['friends', 'school', 'military']);
  });
  it('flag on + he: unchanged', () => {
    expect(offered('he', true)).toEqual(['friends', 'school', 'military']);
  });
  it('flag on + en: the military card is not offered', () => {
    expect(offered('en', true)).toEqual(['friends', 'school']);
  });
  it('the hook is the onboarding hook (one rule)', () => {
    expect(useShowHeOnlySurfaces).toBe(useShowHeOnlySteps);
  });
});
