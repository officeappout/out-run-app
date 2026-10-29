import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// L1 (pilot, 29.10.2026): "הרשמה מהירה" waited on the phone for a chain of
// sequential network hops before /intro. These pin the cuts: no users-doc read
// for a server-minted uid, no flag read without a pending invite, and no fixed
// 1.2s floor when the caller has no transition animation (minTransitionMs 0).

const authMock = vi.hoisted(() => ({ currentUser: null as { uid: string; isAnonymous: boolean } | null }));
const signInGuestMock = vi.hoisted(() => vi.fn());
const getDocMock = vi.hoisted(() => vi.fn());
const setDocMock = vi.hoisted(() => vi.fn());
const readFlagMock = vi.hoisted(() => vi.fn());
const buildWriteMock = vi.hoisted(() => vi.fn());
const consumeInvitesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase', () => ({ auth: authMock, db: {} }));
vi.mock('@/lib/auth.service', () => ({ signInGuest: signInGuestMock }));
vi.mock('@/lib/reportSignupFailure', () => ({ reportSignupFailure: vi.fn(), extractErrorCode: () => 'x' }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: getDocMock,
  setDoc: setDocMock,
  serverTimestamp: () => 'SERVER_TS',
}));
vi.mock('@/lib/onboardingPrefs', () => ({ setOnboardingPref: vi.fn() }));
vi.mock('../gateway-explore-map.service', () => ({ buildExploreMapProfileWrite: buildWriteMock }));
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
vi.mock('@/lib/feature-flag-once', () => ({ readFeatureFlagOnce: readFlagMock }));
vi.mock('../consume-pending-invites', () => ({
  consumePendingInvites: consumeInvitesMock,
  hasPendingInvite: () => !!(globalThis.localStorage.getItem('pending_invite_code')
    || globalThis.localStorage.getItem('pending_session_token')
    || globalThis.localStorage.getItem('pending_group_id')),
}));

import { runExploreMapFlow } from '../run-explore-map-flow';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

describe('runExploreMapFlow — quick-signup latency (L1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', memoryStorage());
    authMock.currentUser = null;
    signInGuestMock.mockReset();
    getDocMock.mockReset();
    setDocMock.mockReset().mockResolvedValue(undefined);
    readFlagMock.mockReset().mockResolvedValue(true);
    consumeInvitesMock.mockReset().mockResolvedValue(null);
    buildWriteMock.mockReset().mockReturnValue({ id: 'u', onboardingPath: 'MAP_ONLY' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a server-minted guest: no users-doc read, scaffold written as for a missing doc', async () => {
    signInGuestMock.mockResolvedValue({ user: { uid: 'fresh', isAnonymous: true }, error: null, isNewUser: true });
    const push = vi.fn();

    const done = runExploreMapFlow({ push }, { minTransitionMs: 0 });
    await vi.runAllTimersAsync();
    expect(await done).toBe(true);

    expect(getDocMock).not.toHaveBeenCalled();
    expect(buildWriteMock).toHaveBeenCalledWith('fresh', undefined);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/explorer');
  });

  it('a reused session (isNewUser absent) still reads the doc first — the wipe guard stays', async () => {
    const existing = { onboardingStatus: 'COMPLETED' };
    signInGuestMock.mockResolvedValue({ user: { uid: 'old-anon', isAnonymous: true }, error: null });
    getDocMock.mockResolvedValue({ exists: () => true, data: () => existing });
    buildWriteMock.mockReturnValue(null);
    const push = vi.fn();

    const done = runExploreMapFlow({ push }, { minTransitionMs: 0 });
    await vi.runAllTimersAsync();
    await done;

    expect(getDocMock).toHaveBeenCalledTimes(1);
    expect(buildWriteMock).toHaveBeenCalledWith('old-anon', existing);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('skips the group-fixes flag read when no invite is pending', async () => {
    signInGuestMock.mockResolvedValue({ user: { uid: 'fresh', isAnonymous: true }, error: null, isNewUser: true });
    const done = runExploreMapFlow({ push: vi.fn() }, { minTransitionMs: 0 });
    await vi.runAllTimersAsync();
    await done;

    expect(readFlagMock).not.toHaveBeenCalled();
  });

  it('still reads the flag and routes the invite when one is pending', async () => {
    localStorage.setItem('pending_session_token', 'tok');
    consumeInvitesMock.mockResolvedValue('/community?groupId=g');
    signInGuestMock.mockResolvedValue({ user: { uid: 'fresh', isAnonymous: true }, error: null, isNewUser: true });
    const push = vi.fn();

    const done = runExploreMapFlow({ push }, { minTransitionMs: 0 });
    await vi.runAllTimersAsync();
    await done;

    expect(readFlagMock).toHaveBeenCalledWith('enable_group_fixes_v1');
    expect(push).toHaveBeenCalledWith('/community?groupId=g');
  });

  it('minTransitionMs 0 navigates as soon as the profile write commits', async () => {
    signInGuestMock.mockResolvedValue({ user: { uid: 'fresh', isAnonymous: true }, error: null, isNewUser: true });
    const push = vi.fn();

    const done = runExploreMapFlow({ push }, { minTransitionMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await done;

    expect(push).toHaveBeenCalledWith('/explorer');
  });

  it('the default keeps gateway\'s 1.2s floor', async () => {
    signInGuestMock.mockResolvedValue({ user: { uid: 'fresh', isAnonymous: true }, error: null, isNewUser: true });
    const push = vi.fn();

    const done = runExploreMapFlow({ push });
    await vi.advanceTimersByTimeAsync(1199);
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(push).toHaveBeenCalledWith('/explorer');
  });

  it('a slow profile write still caps at 1.5s, never hangs', async () => {
    signInGuestMock.mockResolvedValue({ user: { uid: 'fresh', isAnonymous: true }, error: null, isNewUser: true });
    setDocMock.mockReturnValue(new Promise(() => {}));
    const push = vi.fn();

    const done = runExploreMapFlow({ push }, { minTransitionMs: 0 });
    await vi.advanceTimersByTimeAsync(1499);
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(push).toHaveBeenCalledWith('/explorer');
  });
});
