import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));
vi.mock('@/features/user/identity/store/useUserStore', () => ({ useUserStore: () => false }));
vi.mock('@/store/useLocaleStore', () => ({ useLocaleStore: () => 'he' }));

import { computeHeOnlyState, resolveOnboardingUiLocale } from '../useShowHeOnlySteps';

const base = { storeLocale: 'he', pref: null as string | null, flagsLoading: false, flagOn: true };

describe('resolveOnboardingUiLocale', () => {
  it('a non-he wizard language wins; otherwise the app locale', () => {
    expect(resolveOnboardingUiLocale('he', 'en')).toBe('en');
    expect(resolveOnboardingUiLocale('en', null)).toBe('en');
    expect(resolveOnboardingUiLocale('en', 'he')).toBe('en');
  });
});

describe('computeHeOnlyState', () => {
  it('he never waits, even while flags load', () => {
    expect(computeHeOnlyState({ ...base, flagsLoading: true })).toEqual({ show: true, ready: true });
  });
  it('non-he holds while flags load', () => {
    expect(computeHeOnlyState({ ...base, storeLocale: 'en', flagsLoading: true })).toEqual({ show: false, ready: false });
  });
  it('non-he after load: flag on hides, flag off shows', () => {
    expect(computeHeOnlyState({ ...base, storeLocale: 'en' })).toEqual({ show: false, ready: true });
    expect(computeHeOnlyState({ ...base, storeLocale: 'en', flagOn: false })).toEqual({ show: true, ready: true });
  });
  it('the wizard language pref counts (onboarding_language=en with store he)', () => {
    expect(computeHeOnlyState({ ...base, pref: 'en' }).show).toBe(false);
  });
});
