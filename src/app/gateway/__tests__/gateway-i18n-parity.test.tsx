/**
 * i18n batch au (namespace `onboarding`, keys `gateway.*`): /gateway markup snapshots recorded BEFORE the extraction.
 * Only the picker (not retired, no overlay) is reachable statically; the overlay + toast copy is pinned by
 * src/lib/i18n/__tests__/onboarding-au-he.test.ts. `<!-- -->` is stripped before comparing.
 */
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const flags = { enableRunningPrograms: false, enableLandingRealFallback: false };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags, loading: false }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }));
vi.mock('@/lib/auth.service', () => ({ onAuthStateChange: () => () => {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/features/safecity/services/referral.service', () => ({
  captureReferralParam: vi.fn(), getStoredReferrer: vi.fn(), clearStoredReferrer: vi.fn(),
  processReferral: vi.fn(), establishSocialConnection: vi.fn(),
}));
vi.mock('@/features/user/onboarding/services/run-explore-map-flow', () => ({
  runExploreMapFlow: vi.fn(), resolveUser: vi.fn(), consumePendingGroupInvite: vi.fn(), consumePendingSessionInvite: vi.fn(),
}));
vi.mock('@/features/user/onboarding/services/consume-pending-invites', () => ({ consumePendingInvites: vi.fn() }));
vi.mock('@/lib/feature-flag-once', () => ({ readFeatureFlagOnce: vi.fn() }));
vi.mock('@/lib/reportSignupFailure', () => ({ reportSignupFailure: vi.fn(), extractErrorCode: vi.fn() }));
vi.mock('@/lib/onboardingPrefs', () => ({ setOnboardingPref: vi.fn() }));
vi.mock('@/features/user/onboarding/hooks/useLandingRealFallback', () => ({
  useLandingRealFallback: () => ({ enabled: flags.enableLandingRealFallback, loading: false }),
}));

import GatewayPage from '../page';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = () => renderToStaticMarkup(<GatewayPage />).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/gateway-i18n/${name}.html`;

beforeEach(() => { flags.enableRunningPrograms = false; Object.assign(useLocaleStore.getInitialState(), { gender: 'other' }); });
afterAll(() => { vi.restoreAllMocks(); });

it.each([false, true])('picker, running programs=%s', async (running) => {
  flags.enableRunningPrograms = running;
  await expect(html()).toMatchFileSnapshot(snap(`picker-running-${running}`));
});

it('retired renders the blank page', async () => {
  flags.enableLandingRealFallback = true;
  try { await expect(html()).toMatchFileSnapshot(snap('retired')); } finally { flags.enableLandingRealFallback = false; }
});
