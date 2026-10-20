import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Switching accounts in one session used to keep the previous user's onboarding
// state — e.g. healthDeclarationAccepted in the onboarding store, which
// /onboarding-new/health trusts to skip the declaration — plus gateway_uid (the
// profile page's uid fallback) and in-progress sessionStorage answers.

const syncMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/features/user/onboarding/services/onboarding-sync.service', () => ({
  syncOnboardingToFirestore: syncMock,
}));
const removePrefMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/onboardingPrefs', () => ({ removeOnboardingPref: removePrefMock }));

import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import {
  isPerUserSessionKey,
  resetOnboardingSession,
  shouldResetOnboardingSession,
} from '../onboarding-session-reset';
import { isHealthDeclarationSatisfied } from '@/lib/health-declaration';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

describe('shouldResetOnboardingSession', () => {
  const cases: Array<[string | null | undefined, string | null, boolean, string]> = [
    [undefined, 'a', false, 'cold start — first emission'],
    [undefined, null, false, 'cold start, signed out'],
    [null, 'a', false, 'sign-in'],
    ['a', 'a', false, 'same user (token refresh / anon → linked keeps uid)'],
    ['a', null, true, 'sign-out'],
    ['a', 'b', true, 'account switch'],
  ];
  it.each(cases)('%s → %s = %s (%s)', (prev, next, expected) => {
    expect(shouldResetOnboardingSession(prev, next)).toBe(expected);
  });
});

describe('isPerUserSessionKey', () => {
  it('clears onboarding answers + identity, keeps the language and unrelated keys', () => {
    expect(isPerUserSessionKey('onboarding_personal_name')).toBe(true);
    expect(isPerUserSessionKey('onboarding_running_answers')).toBe(true);
    expect(isPerUserSessionKey('gateway_uid')).toBe(true);
    expect(isPerUserSessionKey('selected_authority_id')).toBe(true);
    expect(isPerUserSessionKey('onboarding_language')).toBe(false);
    expect(isPerUserSessionKey('isAudioEnabled')).toBe(false);
    expect(isPerUserSessionKey('analytics_session_id')).toBe(false);
  });
});

describe('resetOnboardingSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { sessionStorage: memoryStorage() });
    syncMock.mockClear();
    removePrefMock.mockClear();
    useOnboardingStore.getState().reset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("user A's signature no longer satisfies the health page for user B", async () => {
    useOnboardingStore.getState().updateData({ healthDeclarationAccepted: true });
    expect(isHealthDeclarationSatisfied(null, useOnboardingStore.getState().data)).toBe(true);

    resetOnboardingSession();

    expect(useOnboardingStore.getState().data).toEqual({});
    expect(isHealthDeclarationSatisfied(null, useOnboardingStore.getState().data)).toBe(false);
  });

  it("drops A's pending debounced sync (never written to B / a fresh anonymous user)", async () => {
    useOnboardingStore.getState().updateData({ healthDeclarationAccepted: true });
    resetOnboardingSession();
    await vi.advanceTimersByTimeAsync(1000);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('clears per-user sessionStorage keys and durable prefs, keeps device prefs', () => {
    const ss = (window as unknown as { sessionStorage: Storage }).sessionStorage;
    ss.setItem('onboarding_personal_name', 'A');
    ss.setItem('gateway_uid', 'uid-a');
    ss.setItem('jit_return_to', 'workout');
    ss.setItem('onboarding_language', 'he');
    ss.setItem('isAudioEnabled', 'true');

    resetOnboardingSession();

    expect(ss.getItem('onboarding_personal_name')).toBeNull();
    expect(ss.getItem('gateway_uid')).toBeNull();
    expect(ss.getItem('jit_return_to')).toBeNull();
    expect(ss.getItem('onboarding_language')).toBe('he');
    expect(ss.getItem('isAudioEnabled')).toBe('true');
    expect(removePrefMock.mock.calls.map((c) => c[0]).sort()).toEqual(
      ['gateway_track', 'gateway_uid', 'onboarding_path'],
    );
  });

  it('a new user after the reset still syncs normally', async () => {
    resetOnboardingSession();
    useOnboardingStore.getState().updateData({ healthDeclarationAccepted: true });
    await vi.advanceTimersByTimeAsync(400);
    expect(syncMock).toHaveBeenCalledTimes(1);
  });
});
