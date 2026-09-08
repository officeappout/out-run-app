import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Stage 2 — proves the additive daily engagement cap in push.service.ts:
 *   (a) engagement-channel pushes stop once DAILY_ENGAGEMENT_CAP is hit
 *   (b) chat (transactional) still delivers regardless of the engagement count
 *   (c) the daily counter resets when the stored date != today
 *
 * Mocks 'firebase-admin' with a minimal in-memory Firestore + a
 * FCM-always-succeeds messaging stub — push.service.ts only ever calls
 * db.collection/doc/getAll/batch/runTransaction and messaging.sendEachForMulticast,
 * so that's all this fake needs to implement correctly.
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

const UID = 'uid-daily-cap-test';

function seedUser(uid: string, overrides: Record<string, any> = {}) {
  state.store.set(pathKey('users', uid), {
    fcmTokens: ['tok-1'],
    settings: {},
    ...overrides,
  });
}

function seedRate(uid: string, data: Record<string, any>) {
  state.store.set(pathKey('push_rate', uid), data);
}

/** Test-only helper — asserts the doc exists (every call site here writes it first). */
async function getRateDoc(uid: string): Promise<Record<string, any>> {
  const snap = await makeDocRef('push_rate', uid).get();
  const data = snap.data();
  if (!data) throw new Error(`push_rate/${uid} unexpectedly missing in test store`);
  return data;
}

beforeEach(() => {
  state.store.clear();
  fakeMessaging.sendEachForMulticast.mockClear();
  vi.useFakeTimers();
  // Comfortably inside a single Israel calendar day, away from either UTC
  // offset edge, so getJerusalemDateKey()'s output isn't sensitive to
  // Standard vs. Daylight Time drift.
  vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('push.service — Stage 2 daily engagement cap', () => {
  it('(a) engagement pushes stop once DAILY_ENGAGEMENT_CAP is reached, and resume below it', async () => {
    seedUser(UID);
    seedRate(UID, { dailyEngagementDate: '2026-01-15', dailyEngagementCount: 2 });

    // Below the cap (2 < 3) — should still deliver.
    const belowCap = await sendPush({
      toUids: [UID],
      channel: 'health_milestone',
      title: 't', body: 'b',
      rateCapHours: 0, // isolate the daily cap from the per-channel cap
    });
    expect(belowCap.delivered).toBe(1);
    expect(belowCap.skippedDailyCap).toBe(0);

    const afterFirst = await getRateDoc(UID);
    expect(afterFirst.dailyEngagementCount).toBe(3);

    // Now at the cap (3 >= 3) — the next engagement push must be skipped.
    const atCap = await sendPush({
      toUids: [UID],
      channel: 'health_milestone',
      title: 't', body: 'b',
      rateCapHours: 0,
    });
    expect(atCap.delivered).toBe(0);
    expect(atCap.skippedDailyCap).toBe(1);

    // A DIFFERENT engagement channel shares the same cross-channel ceiling —
    // this is the whole point of the feature (a global cap, not per-channel).
    const otherChannelAtCap = await sendPush({
      toUids: [UID],
      channel: 'community',
      title: 't', body: 'b',
      rateCapHours: 0,
    });
    expect(otherChannelAtCap.delivered).toBe(0);
    expect(otherChannelAtCap.skippedDailyCap).toBe(1);
  });

  it('(b) chat (transactional) still delivers even when the engagement cap is already exceeded', async () => {
    seedUser(UID);
    seedRate(UID, { dailyEngagementDate: '2026-01-15', dailyEngagementCount: 5 }); // already over the cap

    const result = await sendPush({
      toUids: [UID],
      channel: 'chat',
      title: 't', body: 'b',
      rateCapHours: 0,
    });

    expect(result.delivered).toBe(1);
    expect(result.skippedDailyCap).toBe(0);

    // Chat sends must never touch the engagement counter — confirms exemption
    // isn't just "the check is skipped" but "the count stays untouched too".
    const rateDoc = await getRateDoc(UID);
    expect(rateDoc.dailyEngagementCount).toBe(5);
  });

  it('(c) the daily counter resets when the stored date is not today', async () => {
    seedUser(UID);
    // Yesterday, already at (in fact over) the cap.
    seedRate(UID, { dailyEngagementDate: '2026-01-14', dailyEngagementCount: 3 });

    const result = await sendPush({
      toUids: [UID],
      channel: 'retention',
      title: 't', body: 'b',
      rateCapHours: 0,
    });

    // Stored date != today -> the cap check must not fire, regardless of
    // yesterday's count.
    expect(result.delivered).toBe(1);
    expect(result.skippedDailyCap).toBe(0);

    const rateDoc = await getRateDoc(UID);
    expect(rateDoc.dailyEngagementDate).toBe('2026-01-15');
    expect(rateDoc.dailyEngagementCount).toBe(1); // reset, not 4
  });

  it('does not penalize a uid with no fcmTokens — no send attempted, counter untouched', async () => {
    seedUser(UID, { fcmTokens: [] });
    seedRate(UID, { dailyEngagementDate: '2026-01-15', dailyEngagementCount: 1 });

    const result = await sendPush({
      toUids: [UID],
      channel: 'social',
      title: 't', body: 'b',
      rateCapHours: 0,
    });

    expect(result.delivered).toBe(0);
    const rateDoc = await getRateDoc(UID);
    expect(rateDoc.dailyEngagementCount).toBe(1); // unchanged — nothing was actually sent
  });
});
