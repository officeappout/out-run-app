import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Demo world guard in sendPush() (20.10.2026, demo-users-design.md L3): a
 * simulated demo user (uid `demo_…`) is never a push recipient — dropped
 * before any user / push_rate read, so no FCM send and no push bookkeeping.
 * Real recipients in the same send are unaffected.
 *
 * Same in-memory Firestore / FCM fake as push.service.shabbat.test.ts.
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
      // Not exercised by these tests (no dead tokens) — no-op is correct here.
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

// Wed 13.01.2027 12:00 Israel — a plain weekday, outside quiet hours.
const WEEKDAY_NOON = new Date('2027-01-13T10:00:00.000Z');

function seedUser(uid: string, token: string) {
  state.store.set(pathKey('users', uid), { fcmTokens: [token], settings: {} });
}

beforeEach(() => {
  state.store.clear();
  fakeMessaging.sendEachForMulticast.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(WEEKDAY_NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sendPush — demo users are never recipients', () => {
  it('a demo-only send is a no-op: nothing attempted, no FCM call, no push_rate write', async () => {
    seedUser('demo_c01', 'tok-demo');
    const r = await sendPush({ toUids: ['demo_c01'], channel: 'social', title: 't', body: 'b', rateCapHours: 0 });
    expect(r.attempted).toBe(0);
    expect(r.delivered).toBe(0);
    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    expect(state.store.has(pathKey('push_rate', 'demo_c01'))).toBe(false);
  });

  it('a mixed send delivers to the real user only', async () => {
    seedUser('demo_c01', 'tok-demo');
    seedUser('real-1', 'tok-real');
    const r = await sendPush({ toUids: ['demo_c01', 'real-1'], channel: 'social', title: 't', body: 'b', rateCapHours: 0 });
    expect(r.attempted).toBe(1);
    expect(r.delivered).toBe(1);
    const tokens = fakeMessaging.sendEachForMulticast.mock.calls.flatMap((c: any) => c[0].tokens);
    expect(tokens).toEqual(['tok-real']);
  });

  it('a real-only send is unchanged', async () => {
    seedUser('real-1', 'tok-real');
    const r = await sendPush({ toUids: ['real-1'], channel: 'social', title: 't', body: 'b', rateCapHours: 0 });
    expect(r.attempted).toBe(1);
    expect(r.delivered).toBe(1);
  });
});
