import { describe, it, expect, vi, beforeEach } from 'vitest';

// P0-1 (24.09.2026): resolveUser() is the sole chokepoint that logs a guest
// (anonymous) sign-in failure to signup_failures as AUTH_ANONYMOUS — both of
// its callers (runExploreMapFlow in this file, and gateway/page.tsx's
// handleGetProgram, which calls resolveUser() directly) get it logged
// exactly once, here. See docs/audit-2026-09/00-MASTER-PLAN.md §13.18/§13.22.
//
// Every transitive dependency of run-explore-map-flow.ts is mocked by hand
// (matches onboarding-sync.service.test.ts's established convention — there
// is no shared Firestore test-utils helper in this repo) since this file
// only needs resolveUser() itself to be exercised.

const authMock = vi.hoisted(() => ({ currentUser: null as { uid: string; isAnonymous: boolean } | null }));
const signInGuestMock = vi.hoisted(() => vi.fn());
const reportSignupFailureMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase', () => ({ auth: authMock, db: {} }));
vi.mock('@/lib/auth.service', () => ({ signInGuest: signInGuestMock }));
vi.mock('@/lib/reportSignupFailure', () => ({
  reportSignupFailure: reportSignupFailureMock,
  extractErrorCode: (e: unknown) =>
    e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'unknown',
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: () => 'SERVER_TS',
}));
vi.mock('@/lib/onboardingPrefs', () => ({ setOnboardingPref: vi.fn() }));
vi.mock('../gateway-explore-map.service', () => ({ buildExploreMapProfileWrite: vi.fn() }));
vi.mock('@/features/user/identity/services/affiliation.service', () => ({
  detectCityFromGPS: vi.fn(async () => null),
  addAffiliation: vi.fn(),
}));
vi.mock('@/features/safecity/services/referral.service', () => ({
  getStoredReferrer: vi.fn(() => null),
  establishSocialConnection: vi.fn(),
  processReferral: vi.fn(),
  clearStoredReferrer: vi.fn(),
}));
vi.mock('@/features/arena/services/group.service', () => ({ joinGroup: vi.fn() }));
vi.mock('@/features/arena/services/group-invitation.service', () => ({ consumeSessionInvitation: vi.fn() }));
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({
  useSharedSession: { getState: () => ({ joinViaDeepLink: vi.fn(), setMembershipReady: vi.fn() }) },
}));

import { resolveUser } from '../run-explore-map-flow';

describe('resolveUser — AUTH_ANONYMOUS logging chokepoint (P0-1, 24.09.2026)', () => {
  beforeEach(() => {
    authMock.currentUser = null;
    signInGuestMock.mockReset();
    reportSignupFailureMock.mockReset();
  });

  it('reuses an existing non-anonymous session without calling signInGuest or logging anything', async () => {
    authMock.currentUser = { uid: 'existing-uid', isAnonymous: false };

    const result = await resolveUser();

    expect(result).toEqual({ user: authMock.currentUser, error: null });
    expect(signInGuestMock).not.toHaveBeenCalled();
    expect(reportSignupFailureMock).not.toHaveBeenCalled();
  });

  it('signs in a brand-new guest successfully and logs nothing — the healthy case must not break', async () => {
    const fakeUser = { uid: 'new-anon-uid', isAnonymous: true };
    signInGuestMock.mockResolvedValue({ user: fakeUser, error: null });

    const result = await resolveUser();

    expect(result).toEqual({ user: fakeUser, error: null });
    expect(reportSignupFailureMock).not.toHaveBeenCalled();
  });

  it('logs AUTH_ANONYMOUS with the timeout reason when signInGuest times out', async () => {
    signInGuestMock.mockResolvedValue({ user: null, error: 'guest_timeout' });

    const result = await resolveUser();

    expect(result).toEqual({ user: null, error: 'guest_timeout' });
    expect(reportSignupFailureMock).toHaveBeenCalledTimes(1);
    expect(reportSignupFailureMock).toHaveBeenCalledWith('AUTH_ANONYMOUS', 'guest_timeout');
  });

  it('also logs AUTH_ANONYMOUS for a non-timeout guest sign-in failure', async () => {
    signInGuestMock.mockResolvedValue({ user: null, error: 'auth/network-request-failed' });

    await resolveUser();

    expect(reportSignupFailureMock).toHaveBeenCalledWith('AUTH_ANONYMOUS', 'auth/network-request-failed');
  });

  it('falls through to signInGuest for an already-anonymous current user too', async () => {
    authMock.currentUser = { uid: 'old-anon', isAnonymous: true };
    const fakeUser = { uid: 'fresh-anon', isAnonymous: true };
    signInGuestMock.mockResolvedValue({ user: fakeUser, error: null });

    const result = await resolveUser();

    expect(signInGuestMock).toHaveBeenCalledTimes(1);
    expect(result.user).toEqual(fakeUser);
  });
});
