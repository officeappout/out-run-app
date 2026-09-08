import { describe, it, expect } from 'vitest';
import { isBlocked, recordFailure, recordSuccess, MAX_FAILURES, LOCKOUT_MS, WINDOW_MS } from '../accessCodeRateLimit';

/**
 * SPEC-01 task 4 / SPEC-02: validateAccessCode had no attempt limiting at
 * all — a 6-char code is brute-forceable in a loop otherwise. Mocked
 * Firestore doc storage (plain object), same approach as the Next.js
 * app's rateLimit.test.ts / validateGroupJoinAccess.test.ts — no real
 * emulator connection needed for pure logic, and functions/ can't share
 * a real Firestore test harness with the Next.js app's vitest config
 * anyway (separate package, separate runtime).
 */

function mockAttemptStore() {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    doc: (path: string) => ({
      get: async () => {
        const data = docs.get(path);
        return { exists: data !== undefined, data: () => data };
      },
      set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
        if (opts?.merge) {
          docs.set(path, { ...(docs.get(path) ?? {}), ...data });
        } else {
          docs.set(path, data);
        }
      },
    }),
  };
}

describe('accessCodeRateLimit', () => {
  it('is not blocked with no prior attempts', async () => {
    const db = mockAttemptStore();
    expect(await isBlocked(db, 'uid:u1', Date.now())).toBe(false);
  });

  it('is not blocked after fewer than MAX_FAILURES failures', async () => {
    const db = mockAttemptStore();
    const now = Date.now();
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      await recordFailure(db, 'uid:u1', now);
    }
    expect(await isBlocked(db, 'uid:u1', now)).toBe(false);
  });

  it('blocks once MAX_FAILURES failures land within the window — the actual fix: was unconditionally allowed before', async () => {
    const db = mockAttemptStore();
    const now = Date.now();
    for (let i = 0; i < MAX_FAILURES; i++) {
      await recordFailure(db, 'uid:u1', now);
    }
    expect(await isBlocked(db, 'uid:u1', now)).toBe(true);
  });

  it('the block lasts LOCKOUT_MS but not beyond it', async () => {
    const db = mockAttemptStore();
    const now = Date.now();
    for (let i = 0; i < MAX_FAILURES; i++) {
      await recordFailure(db, 'uid:u1', now);
    }
    expect(await isBlocked(db, 'uid:u1', now + LOCKOUT_MS - 1)).toBe(true);
    expect(await isBlocked(db, 'uid:u1', now + LOCKOUT_MS + 1)).toBe(false);
  });

  it('tracks uid and ip keys independently — a block on one does not block the other', async () => {
    const db = mockAttemptStore();
    const now = Date.now();
    for (let i = 0; i < MAX_FAILURES; i++) {
      await recordFailure(db, 'uid:attacker', now);
    }
    expect(await isBlocked(db, 'uid:attacker', now)).toBe(true);
    expect(await isBlocked(db, 'ip:1.2.3.4', now)).toBe(false);
  });

  it('resets the failure count once the 15-minute window has elapsed', async () => {
    const db = mockAttemptStore();
    const now = Date.now();
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      await recordFailure(db, 'uid:u1', now);
    }
    // Same count, but now well outside the window -> should not carry over.
    await recordFailure(db, 'uid:u1', now + WINDOW_MS + 1000);
    expect(await isBlocked(db, 'uid:u1', now + WINDOW_MS + 1000)).toBe(false);
  });

  it('recordSuccess clears an existing block and failure count', async () => {
    const db = mockAttemptStore();
    const now = Date.now();
    for (let i = 0; i < MAX_FAILURES; i++) {
      await recordFailure(db, 'uid:u1', now);
    }
    expect(await isBlocked(db, 'uid:u1', now)).toBe(true);
    await recordSuccess(db, 'uid:u1');
    expect(await isBlocked(db, 'uid:u1', now)).toBe(false);
    // Confirms the count was actually reset, not just the block flag —
    // one more failure right after a success should not immediately re-block.
    await recordFailure(db, 'uid:u1', now);
    expect(await isBlocked(db, 'uid:u1', now)).toBe(false);
  });
});
