import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// P0-1 (24.09.2026): signInGuest() (signInAnonymously) previously had NO
// timeout at all, unlike signInWithGoogle (60s) / signInWithApple (30s) in
// this same file — and this is the very first tap most new users make. See
// docs/audit-2026-09/00-MASTER-PLAN.md §13.18/§13.22.
//
// Only `signInAnonymously` is mocked from 'firebase/auth' — matches the
// established convention (onboarding-sync.service.test.ts mocks the same
// single export the same way); every other named import in auth.service.ts
// resolves to `undefined` here, which is harmless since signInGuest() never
// touches them.

const signInAnonymouslyMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  signInAnonymously: signInAnonymouslyMock,
}));

import { signInGuest } from '@/lib/auth.service';

describe('signInGuest — P0-1 timeout guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signInAnonymouslyMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves normally when signInAnonymously resolves quickly — the healthy case must not break', async () => {
    const fakeUser = { uid: 'u1', isAnonymous: true };
    signInAnonymouslyMock.mockResolvedValue({ user: fakeUser });

    const result = await signInGuest();

    expect(result).toEqual({ user: fakeUser, error: null });
  });

  it('times out and returns guest_timeout when signInAnonymously hangs forever', async () => {
    signInAnonymouslyMock.mockImplementation(() => new Promise(() => {})); // never resolves

    const resultPromise = signInGuest();
    await vi.advanceTimersByTimeAsync(20_000);
    const result = await resultPromise;

    expect(result).toEqual({ user: null, error: 'guest_timeout' });
  });

  it('does not time out for a call that resolves just under the 20s window', async () => {
    signInAnonymouslyMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ user: { uid: 'slow-but-ok' } }), 19_000)),
    );

    const resultPromise = signInGuest();
    await vi.advanceTimersByTimeAsync(19_000);
    const result = await resultPromise;

    expect(result).toEqual({ user: { uid: 'slow-but-ok' }, error: null });
  });

  it('propagates a real Firebase error as-is, distinct from the timeout sentinel', async () => {
    signInAnonymouslyMock.mockRejectedValue(new Error('auth/network-request-failed'));

    const result = await signInGuest();

    expect(result).toEqual({ user: null, error: 'auth/network-request-failed' });
  });
});
