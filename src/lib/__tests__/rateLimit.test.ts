import { describe, it, expect, vi } from 'vitest';
import { isRateLimited } from '../rateLimit';

/**
 * SPEC-02 SEC-15: check-email and /api/join/preview each had their own
 * in-memory Map rate limiter — reset on every serverless cold start,
 * which defeats the purpose entirely. This mocks a minimal Firestore
 * transaction interface (doc storage in a plain object) to prove the
 * shared Firestore-backed replacement's sliding-window logic actually
 * works, without needing a real emulator connection.
 */

function mockFirestore() {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    collection: (_name: string) => ({
      doc: (id: string) => ({ __id: id }),
    }),
    runTransaction: async (fn: (tx: any) => Promise<boolean>) => {
      const tx = {
        get: async (ref: { __id: string }) => {
          const data = docs.get(ref.__id);
          return { exists: data !== undefined, data: () => data };
        },
        set: (ref: { __id: string }, data: Record<string, unknown>) => {
          docs.set(ref.__id, data);
        },
      };
      return fn(tx);
    },
  } as any;
}

describe('isRateLimited', () => {
  it('allows requests under the limit', async () => {
    const db = mockFirestore();
    for (let i = 0; i < 5; i++) {
      expect(await isRateLimited(db, 'k1', { windowMs: 60_000, maxRequests: 5 })).toBe(false);
    }
  });

  it('blocks the request that exceeds the limit within the window', async () => {
    const db = mockFirestore();
    for (let i = 0; i < 5; i++) {
      await isRateLimited(db, 'k2', { windowMs: 60_000, maxRequests: 5 });
    }
    // The 6th request in the same window must be denied.
    expect(await isRateLimited(db, 'k2', { windowMs: 60_000, maxRequests: 5 })).toBe(true);
  });

  it('keeps separate counters per key (per-IP isolation)', async () => {
    const db = mockFirestore();
    for (let i = 0; i < 5; i++) {
      await isRateLimited(db, 'ip-a', { windowMs: 60_000, maxRequests: 5 });
    }
    // A different key (different IP) must not be affected by ip-a's count.
    expect(await isRateLimited(db, 'ip-b', { windowMs: 60_000, maxRequests: 5 })).toBe(false);
  });

  it('resets the count once the window has elapsed', async () => {
    const db = mockFirestore();
    for (let i = 0; i < 5; i++) {
      await isRateLimited(db, 'k3', { windowMs: 300, maxRequests: 5 });
    }
    expect(await isRateLimited(db, 'k3', { windowMs: 300, maxRequests: 5 })).toBe(true);
    await new Promise((r) => setTimeout(r, 350));
    // Window has elapsed — the counter should have reset.
    expect(await isRateLimited(db, 'k3', { windowMs: 300, maxRequests: 5 })).toBe(false);
  });

  /**
   * 22.09.2026 (rate-limiting rollout, phase B): a Firestore outage must
   * never lock a real user out of an endpoint the rate limiter itself is
   * protecting — see David's explicit instruction in
   * .claude/plans/rate-limiting-sensitive-endpoints.md. isRateLimited
   * fails OPEN: it logs a warning and returns false (not limited) instead
   * of throwing.
   */
  it('fails open (returns false, does not throw) when the Firestore transaction itself throws', async () => {
    const db = {
      collection: (_name: string) => ({ doc: (id: string) => ({ __id: id }) }),
      runTransaction: async () => {
        throw new Error('simulated Firestore outage');
      },
    } as any;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      isRateLimited(db, 'fail-open-key', { windowMs: 60_000, maxRequests: 5 }),
    ).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('failing OPEN'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
