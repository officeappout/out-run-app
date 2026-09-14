import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Stage 3 — proves the daily engagement cap's NUMBER is per-user via
 * settings.notificationFrequency ('min'|'balanced'|'high' -> 1|3|6), while
 * the two-bucket policy from Stage 2 (which sends are even subject to the
 * cap: ENGAGEMENT_CHANNELS && !isPersonalInteraction) is untouched:
 *   (a) 'min' -> cap 1: first send delivers, second blocked
 *   (b) 'balanced' -> cap 3: three deliver, fourth blocked
 *   (c) 'high' -> cap 6: sends up to and including the 6th deliver
 *   (d) unset notificationFrequency defaults to 3 (same as 'balanced')
 *   (e) isPersonalInteraction still exempts regardless of frequency level
 *
 * Same in-memory Firestore fake as push.service.daily-cap.test.ts.
 */

const state = vi.hoisted(() => ({
  store: new Map<string, Record<string, any> | undefined>(),
}));

function pathKey(collection: string, id: string): string {
  return `${collection}/${id}`;
}

function applyWrite(existing: Record<string, any> | undefined, incoming: Record<string, any>, merge: boolean) {
  const base = merge ? { ...(existing ?? {}) } : {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v && typeof v === 'object' && v.__fake === 'increment') {
      base[k] = (typeof base[k] === 'number' ? base[k] : 0) + v.amount;
    } else if (v && typeof v === 'object' && v.__fake === 'serverTimestamp') {
      base[k] = { __fakeTimestamp: Date.now(), toMillis: () => Date.now() };
    } else if (v && typeof v === 'object' && v.__fake === 'arrayRemove') {
      // Not exercised by these tests — no-op is correct here.
    } else {
      base[k] = v;
    }
  }
  return base;
}

function makeDocRef(collection: string, id: string) {
  const key = pathKey(collection, id);
  return {
    id,
    get: async () => {
      const data = state.store.get(key);
      return { exists: data !== undefined, data: () => data, id };
    },
    set: (data: Record<string, any>, opts?: { merge?: boolean }) => {
      state.store.set(key, applyWrite(state.store.get(key), data, !!opts?.merge));
    },
    update: (data: Record<string, any>) => {
      state.store.set(key, applyWrite(state.store.get(key), data, true));
    },
  };
}

function makeFakeDb() {
  return {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name, id),
    }),
    doc: (path: string) => {
      const [collection, id] = path.split('/');
      return makeDocRef(collection, id);
    },
    getAll: async (...refs: Array<{ get: () => Promise<any> }>) => Promise.all(refs.map((r) => r.get())),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (ref: any, data: any, opts?: any) => { ops.push(() => ref.set(data, opts)); },
        update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
        commit: async () => { ops.forEach((op) => op()); },
      };
    },
    runTransaction: async (cb: (tx: any) => Promise<void>) => {
      const tx = {
        get: (ref: any) => ref.get(),
        set: (ref: any, data: any, opts?: any) => ref.set(data, opts),
        update: (ref: any, data: any) => ref.update(data),
      };
      return cb(tx);
    },
  };
}

const fakeMessaging = {
  sendEachForMulticast: vi.fn(async ({ tokens }: { tokens: string[] }) => ({
    responses: tokens.map(() => ({ success: true })),
  })),
};

vi.mock('firebase-admin', () => {
  const firestoreFn = () => makeFakeDb();
  (firestoreFn as any).FieldValue = {
    serverTimestamp: () => ({ __fake: 'serverTimestamp' }),
    increment: (amount: number) => ({ __fake: 'increment', amount }),
    arrayRemove: (...items: unknown[]) => ({ __fake: 'arrayRemove', items }),
  };
  return {
    firestore: firestoreFn,
    messaging: () => fakeMessaging,
  };
});

vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../push-events.service', () => ({
  writePushSentEvent: vi.fn(async () => {}),
}));

import { sendPush } from '../push.service';

const UID = 'uid-freq-cap-test';

function seedUser(uid: string, overrides: Record<string, any> = {}) {
  state.store.set(pathKey('users', uid), {
    fcmTokens: ['tok-1'],
    settings: {},
    ...overrides,
  });
}

beforeEach(() => {
  state.store.clear();
  fakeMessaging.sendEachForMulticast.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Send N engagement-channel pushes in sequence, collecting each result. */
async function sendN(uid: string, n: number, opts: Partial<Parameters<typeof sendPush>[0]> = {}) {
  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(await sendPush({
      toUids: [uid],
      channel: 'health_milestone',
      title: 't', body: 'b',
      rateCapHours: 0,
      ...opts,
    }));
  }
  return results;
}

describe('push.service — Stage 3 per-user daily cap (notificationFrequency)', () => {
  it("(a) 'min' -> cap 1: first delivers, second blocked", async () => {
    seedUser(UID, { settings: { notificationFrequency: 'min' } });

    const [first, second] = await sendN(UID, 2);

    expect(first.delivered).toBe(1);
    expect(first.skippedDailyCap).toBe(0);
    expect(second.delivered).toBe(0);
    expect(second.skippedDailyCap).toBe(1);
  });

  it("(b) 'balanced' -> cap 3: three deliver, fourth blocked", async () => {
    seedUser(UID, { settings: { notificationFrequency: 'balanced' } });

    const results = await sendN(UID, 4);

    expect(results.slice(0, 3).map((r) => r.delivered)).toEqual([1, 1, 1]);
    expect(results[3].delivered).toBe(0);
    expect(results[3].skippedDailyCap).toBe(1);
  });

  it("(c) 'high' -> cap 6: sends 1 through 6 all deliver, 7th blocked", async () => {
    seedUser(UID, { settings: { notificationFrequency: 'high' } });

    const results = await sendN(UID, 7);

    expect(results.slice(0, 6).every((r) => r.delivered === 1)).toBe(true);
    expect(results[6].delivered).toBe(0);
    expect(results[6].skippedDailyCap).toBe(1);
  });

  it('(d) unset notificationFrequency defaults to 3 (same as balanced)', async () => {
    seedUser(UID); // settings: {} — no notificationFrequency at all

    const results = await sendN(UID, 4);

    expect(results.slice(0, 3).map((r) => r.delivered)).toEqual([1, 1, 1]);
    expect(results[3].delivered).toBe(0);
    expect(results[3].skippedDailyCap).toBe(1);
  });

  it('(e) isPersonalInteraction still exempts regardless of frequency level', async () => {
    seedUser(UID, { settings: { notificationFrequency: 'min' } }); // cap = 1

    // Exhaust the min cap first.
    await sendN(UID, 1);

    // A personal-interaction send on the same engagement channel must still
    // deliver — the exemption is per-send, independent of the resolved cap.
    const personal = await sendPush({
      toUids: [UID],
      channel: 'social',
      title: 't', body: 'b',
      rateCapHours: 0,
      isPersonalInteraction: true,
    });

    expect(personal.delivered).toBe(1);
    expect(personal.skippedDailyCap).toBe(0);
  });
});
