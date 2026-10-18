import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * 18.10.2026 — push.service's opt-in lapsed-user suppression (suppressIfLapsed,
 * flag app_config/feature_flags.lapsedPushSuppression, default OFF), used by
 * the training reminders and step-goal nudges. Same in-memory Firestore fake
 * as push.service.daily-cap.test.ts, plus a workouts query.
 */

const state = vi.hoisted(() => ({
  store: new Map<string, Record<string, any> | undefined>(),
  workouts: new Map<string, number[]>(),
  workoutsFail: false,
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
    collection: (name: string) => {
      const q: any = { doc: (id: string) => makeDocRef(name, id) };
      const filters: Array<[string, unknown]> = [];
      q.where = (f: string, _op: string, v: unknown) => { filters.push([f, v]); return q; };
      for (const m of ['orderBy', 'limit', 'select']) q[m] = () => q;
      q.get = async () => {
        if (state.workoutsFail) throw new Error('workouts unavailable');
        const uid = filters.find(([f]) => f === 'userId')?.[1];
        const docs = (state.workouts.get(uid as string) ?? []).map((ms) => ({ data: () => ({ date: { toMillis: () => ms } }) }));
        return { empty: docs.length === 0, docs };
      };
      return q;
    },
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
import { resetActivityFlagsCache } from '../../lib/user-activity';

const DAY = 86_400_000;
const NOW = new Date('2026-01-15T10:00:00.000Z'); // 12:00 Israel
const UID = 'uid-lapsed';

function seed(path: string, data: Record<string, any>) {
  state.store.set(path, data);
}

const send = () =>
  sendPush({ toUids: [UID], channel: 'training_reminder', title: 't', body: 'b', rateCapHours: 22, suppressIfLapsed: true });

beforeEach(() => {
  state.store.clear();
  state.workouts.clear();
  state.workoutsFail = false;
  resetActivityFlagsCache();
  fakeMessaging.sendEachForMulticast.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const lapsedUser = { fcmTokens: ['tok-1'], settings: {}, lastActive: { toMillis: () => NOW.getTime() - 45 * DAY } };

describe('push.service — lapsed-user suppression', () => {
  it('flag off (default): a 45-days-away user still gets the reminder', async () => {
    seed(`users/${UID}`, lapsedUser);
    const r = await send();
    expect(r.delivered).toBe(1);
    expect(r.skippedLapsed).toBeUndefined();
  });

  it('flag on: > 30 days away (confirmed by workouts) → held back', async () => {
    seed('app_config/feature_flags', { lapsedPushSuppression: true });
    seed(`users/${UID}`, lapsedUser);
    const r = await send();
    expect(r.delivered).toBe(0);
    expect(r.skippedLapsed).toBe(1);
  });

  it('flag on: an old lastActive but a workout last week → sent', async () => {
    seed('app_config/feature_flags', { lapsedPushSuppression: true });
    seed(`users/${UID}`, lapsedUser);
    state.workouts.set(UID, [NOW.getTime() - 6 * DAY]);
    const r = await send();
    expect(r.delivered).toBe(1);
    expect(r.skippedLapsed).toBe(0);
  });

  it('flag on: the workouts lookup failing → sent as before (never suppress on unknown)', async () => {
    seed('app_config/feature_flags', { lapsedPushSuppression: true });
    seed(`users/${UID}`, lapsedUser);
    state.workoutsFail = true;
    expect((await send()).delivered).toBe(1);
  });

  it('flag on: a retention push earlier today → the day\'s reminder is held back', async () => {
    seed('app_config/feature_flags', { lapsedPushSuppression: true });
    seed(`users/${UID}`, { ...lapsedUser, lastActive: { toMillis: () => NOW.getTime() - 5 * DAY } });
    seed(`push_rate/${UID}`, { retention_lastSentAt: { toMillis: () => NOW.getTime() - 2 * 3600_000 } });
    const r = await send();
    expect(r.delivered).toBe(0);
    expect(r.skippedLapsed).toBe(1);
  });

  it('flag on but the caller did not opt in → unchanged', async () => {
    seed('app_config/feature_flags', { lapsedPushSuppression: true });
    seed(`users/${UID}`, lapsedUser);
    const r = await sendPush({ toUids: [UID], channel: 'training_reminder', title: 't', body: 'b', rateCapHours: 22 });
    expect(r.delivered).toBe(1);
  });
});
