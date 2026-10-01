import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { User } from 'firebase/auth';

// P1-3 (00-MASTER-PLAN.md §13.43/§13.45.1): mintAdminSessionCookie is now
// the ONE call site that actually reaches POST /api/auth/session for a
// proactive mint/refresh — AdminSessionSync, admin-fetch.ts, and the two
// explicit calls in admin/auth/callback/page.tsx's completeSignIn/
// resolveDestination all route through it. These tests verify the two
// dedup layers that make that safe (no lost mints, no extra network
// calls) and that a failure is reported to sessionHealth.store instead of
// only a console.warn.
//
// Only `fetch` and `@/lib/firebase` are mocked — matches the established
// convention in auth.service.guestTimeout.test.ts (every other named
// import from 'firebase/auth' resolves to undefined here, harmless since
// mintAdminSessionCookie never touches them).

vi.mock('@/lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({}));

import { mintAdminSessionCookie } from '@/lib/auth.service';
import { useSessionHealthStore } from '@/lib/sessionHealth.store';

function fakeUser(uid: string, token = `tok-${uid}`): User {
  return { uid, getIdToken: vi.fn().mockResolvedValue(token) } as unknown as User;
}

describe('mintAdminSessionCookie — P1-3 dedup + health reporting', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    useSessionHealthStore.setState({ status: 'ok', lastFailureReason: null, retrying: false });
  });

  it('mints successfully and reports markOk on the health store', async () => {
    const user = fakeUser('user-ok-1');
    const ok = await mintAdminSessionCookie(user);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ method: 'POST' }));
    expect(useSessionHealthStore.getState().status).toBe('ok');
  });

  it('deduplicates concurrent calls for the same uid into one network request', async () => {
    const user = fakeUser('user-concurrent-1');

    const [a, b] = await Promise.all([
      mintAdminSessionCookie(user),
      mintAdminSessionCookie(user),
    ]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not dedupe concurrent calls for two DIFFERENT uids', async () => {
    const userA = fakeUser('user-a');
    const userB = fakeUser('user-b');

    const [a, b] = await Promise.all([
      mintAdminSessionCookie(userA),
      mintAdminSessionCookie(userB),
    ]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips the network call for a repeat mint of the same uid shortly after a success', async () => {
    const user = fakeUser('user-recent-1');

    const first = await mintAdminSessionCookie(user);
    const second = await mintAdminSessionCookie(user);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 01.10.2026 (00-MASTER-PLAN.md §13.60, axioms.md §28) — this is the
  // test that would have caught the real production bug: commit 6510a27c
  // (this dedupe) silently swallowed commit 942a6cec's later re-mint,
  // placed deliberately right after accept-invitation wrote a user's real
  // role, because neither call site had any way to tell this cache "the
  // data changed, don't trust your cache." These two tests prove the
  // fix — forceReason bypasses the TTL short-circuit; its absence doesn't.
  it('forceReason bypasses the TTL short-circuit — a call within the 5s window with a reason reaches the network', async () => {
    const user = fakeUser('user-forced-1');

    const first = await mintAdminSessionCookie(user);
    const second = await mintAdminSessionCookie(user, { forceReason: 'role-changed-post-accept-invitation' });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // NOT deduped
  });

  it('without forceReason, the same call sequence is still deduped — the bypass is opt-in, not the new default', async () => {
    const user = fakeUser('user-unforced-1');

    const first = await mintAdminSessionCookie(user);
    const second = await mintAdminSessionCookie(user); // no opts — same as before

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still deduped, unchanged behavior
  });

  it('does NOT let a different uid be masked by another uid\'s recent success (account switch)', async () => {
    const userA = fakeUser('user-switch-a');
    await mintAdminSessionCookie(userA);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const userB = fakeUser('user-switch-b');
    const ok = await mintAdminSessionCookie(userB);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a 429 as rate_limited on the health store and returns false', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const user = fakeUser('user-429');

    const ok = await mintAdminSessionCookie(user);

    expect(ok).toBe(false);
    expect(useSessionHealthStore.getState().status).toBe('degraded');
    expect(useSessionHealthStore.getState().lastFailureReason).toBe('rate_limited');
  });

  it('reports a network error as "network" on the health store and returns false', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = fakeUser('user-offline');

    const ok = await mintAdminSessionCookie(user);

    expect(ok).toBe(false);
    expect(useSessionHealthStore.getState().status).toBe('degraded');
    expect(useSessionHealthStore.getState().lastFailureReason).toBe('network');
  });

  it('a failure is never cached — the very next call for the same uid retries the network', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const user = fakeUser('user-retry-after-fail');

    const first = await mintAdminSessionCookie(user);
    expect(first).toBe(false);

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const second = await mintAdminSessionCookie(user);

    expect(second).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useSessionHealthStore.getState().status).toBe('ok');
  });
});
