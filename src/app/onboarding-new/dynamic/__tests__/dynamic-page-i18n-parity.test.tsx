/**
 * i18n batch au (namespace `onboarding`, keys `dynamicPage.*`): the questionnaire page's loading screens, recorded
 * BEFORE the extraction. The error / alert / fallback copy sits behind async state and is pinned by
 * src/lib/i18n/__tests__/onboarding-au-he.test.ts. `<!-- -->` is stripped before comparing.
 */
import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const v2State = { v2: false, ready: true };
vi.mock('@/features/user/onboarding/hooks/useOnboardingV2', () => ({ useOnboardingV2State: () => v2State }));
vi.mock('@/features/user/onboarding/hooks/useDeferredIdentity', () => ({
  useDeferredIdentity: () => ({ runAfterIdentity: vi.fn(), identityOverlay: null }),
}));
vi.mock('@/features/user/onboarding/hooks/useAerobicProgramsOpen', () => ({ useAerobicSignupGuard: () => false }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/user', () => ({
  useUserStore: () => ({ hasCompletedOnboarding: false, initializeProfile: vi.fn(), refreshProfile: vi.fn() }),
}));
vi.mock('@/features/user/identity/services/profile.service', () => ({ mapAnswersToProfile: vi.fn() }));
vi.mock('@/features/user/onboarding/engine/DynamicOnboardingEngine', () => ({ DynamicOnboardingEngine: class {} }));
vi.mock('@/features/user/onboarding/services/branching-logic.service', () => ({ loadAssessmentContext: vi.fn() }));
vi.mock('@/features/analytics/AnalyticsService', () => ({ Analytics: {} }));
vi.mock('@/features/analytics/onboarding-funnel', () => ({ logOnboardingFunnelStep: vi.fn() }));
vi.mock('@/features/user/onboarding/services/onboarding-sync.service', () => ({ syncOnboardingToFirestore: vi.fn() }));
vi.mock('@/features/workout-engine/services/first-workout.service', () => ({ generateFirstWorkout: vi.fn() }));
vi.mock('@/lib/reportSignupFailure', () => ({ reportSignupFailure: vi.fn(), extractErrorCode: vi.fn() }));
vi.mock('@/features/user/onboarding/utils/onboarding-confetti', () => ({ firePhaseConfetti: vi.fn() }));
vi.mock('@/features/user/onboarding/utils/run-signup-routing', () => ({ runSignupNextRoute: vi.fn() }));
vi.mock('@/features/user/onboarding/components/DynamicQuestionRenderer', () => ({ default: () => null }));
vi.mock('@/features/user/onboarding/components/OnboardingLayout', () => ({ default: () => null }));
vi.mock('@/features/user/onboarding/components/ResultLoading', () => ({ default: () => null }));
vi.mock('@/features/user/onboarding/components/ProgramResult', () => ({ default: () => null }));

import DynamicOnboardingPage from '../page';

const html = () => renderToStaticMarkup(<DynamicOnboardingPage />).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/dynamic-page-i18n/${name}.html`;

it.each([false, true])('loading screen, v2=%s', async (v2) => {
  v2State.v2 = v2;
  await expect(html()).toMatchFileSnapshot(snap(`loading-v${v2 ? 2 : 1}`));
});
