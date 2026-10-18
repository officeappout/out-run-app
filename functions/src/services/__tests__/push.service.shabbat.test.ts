import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Shabbat / yom-tov guard in sendPush() (owner decision 17.10.2026, opt-in
 * since 18.10.2026 — applies ONLY to recipients with
 * settings.shabbatObserver === true):
 *   - a non-observer gets pushes on Shabbat like any day
 *   - in a mixed send, only the observers are dropped
 *   - for observers, drops every non-exempt send inside the window, INCLUDING ones that pass
 *     skipQuietHours: true (the guard must not be bypassable)
 *   - drops personal interactions (kudos etc.) too — the daily-cap exemption
 *     is unrelated
 *   - exempts only `system` and a 1:1 chat (channel 'chat' + isDirectMessage)
 *   - a group chat (channel 'chat' without isDirectMessage) is dropped
 *   - outside the window nothing changes
 *
 * Same in-memory Firestore / FCM fake as push.service.daily-cap.test.ts.
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

const UID = 'uid-shabbat-test';

function seedUser(uid: string, shabbatObserver = true, token = 'tok-1') {
  state.store.set(pathKey('users', uid), {
    fcmTokens: [token],
    settings: shabbatObserver ? { shabbatObserver: true } : {},
  });
}

// Sat 16.01.2027 12:00 Israel (+2) — inside the Shabbat window.
const SHABBAT_NOON = new Date('2027-01-16T10:00:00.000Z');
// Wed 13.01.2027 12:00 Israel — a plain weekday.
const WEEKDAY_NOON = new Date('2027-01-13T10:00:00.000Z');

beforeEach(() => {
  state.store.clear();
  fakeMessaging.sendEachForMulticast.mockClear();
  vi.useFakeTimers();
  seedUser(UID);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sendPush — Shabbat/yom-tov guard is opt-in', () => {
  const OTHER = 'uid-not-observer';

  it('a non-observer gets an engagement push on Shabbat', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    seedUser(OTHER, false, 'tok-other');
    const r = await sendPush({ toUids: [OTHER], channel: 'retention', title: 't', body: 'b', rateCapHours: 0 });
    expect(r.skippedShabbat).toBe(0);
    expect(r.delivered).toBe(1);
  });

  it('shabbatObserver: false (explicit) behaves like unset', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    state.store.set(pathKey('users', OTHER), { fcmTokens: ['tok-other'], settings: { shabbatObserver: false } });
    const r = await sendPush({ toUids: [OTHER], channel: 'social', title: 't', body: 'b', rateCapHours: 0 });
    expect(r.skippedShabbat).toBe(0);
    expect(r.delivered).toBe(1);
  });

  it('a mixed send drops only the observer', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    seedUser(OTHER, false, 'tok-other');
    const r = await sendPush({
      toUids: [UID, OTHER], channel: 'encouragement', title: 't', body: 'b', rateCapHours: 0, skipQuietHours: true,
    });
    expect(r.skippedShabbat).toBe(1);
    expect(r.delivered).toBe(1);
    const sentTokens = fakeMessaging.sendEachForMulticast.mock.calls.flatMap((c: any[]) => c[0].tokens);
    expect(sentTokens).toEqual(['tok-other']);
  });

  it('a non-observer is still subject to quiet hours on Shabbat night', async () => {
    vi.setSystemTime(new Date('2027-01-15T21:00:00.000Z')); // Fri 23:00 Israel
    seedUser(OTHER, false, 'tok-other');
    const r = await sendPush({ toUids: [OTHER], channel: 'retention', title: 't', body: 'b', rateCapHours: 0 });
    expect(r.skippedQuietHours).toBe(1);
    expect(r.delivered).toBe(0);
  });
});

describe('sendPush — Shabbat/yom-tov guard (observers)', () => {
  it('drops an engagement push on Shabbat', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    const r = await sendPush({ toUids: [UID], channel: 'retention', title: 't', body: 'b', rateCapHours: 0 });
    expect(r.skippedShabbat).toBe(1);
    expect(r.delivered).toBe(0);
    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('is NOT bypassable with skipQuietHours: true', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    const r = await sendPush({
      toUids: [UID], channel: 'encouragement', title: 't', body: 'b', rateCapHours: 0, skipQuietHours: true,
    });
    expect(r.skippedShabbat).toBe(1);
    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('drops a personal interaction (kudos) too', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    const r = await sendPush({
      toUids: [UID], channel: 'social', title: 't', body: 'b', rateCapHours: 0, isPersonalInteraction: true,
    });
    expect(r.skippedShabbat).toBe(1);
    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('drops a group-chat push (chat without isDirectMessage)', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    const r = await sendPush({
      toUids: [UID], channel: 'chat', title: 't', body: 'b', rateCapHours: 0, skipQuietHours: true,
    });
    expect(r.skippedShabbat).toBe(1);
  });

  it('delivers a 1:1 chat message (person to person)', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    const r = await sendPush({
      toUids: [UID], channel: 'chat', title: 't', body: 'b', rateCapHours: 0, skipQuietHours: true, isDirectMessage: true,
    });
    expect(r.skippedShabbat).toBe(0);
    expect(r.delivered).toBe(1);
  });

  it('isDirectMessage does nothing outside the chat channel', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    const r = await sendPush({
      toUids: [UID], channel: 'social', title: 't', body: 'b', rateCapHours: 0, isDirectMessage: true,
    });
    expect(r.skippedShabbat).toBe(1);
  });

  it('delivers on the system channel', async () => {
    vi.setSystemTime(SHABBAT_NOON);
    const r = await sendPush({ toUids: [UID], channel: 'system', title: 't', body: 'b' });
    expect(r.skippedShabbat).toBe(0);
    expect(r.delivered).toBe(1);
  });

  it('a weekday is unaffected', async () => {
    vi.setSystemTime(WEEKDAY_NOON);
    const r = await sendPush({ toUids: [UID], channel: 'retention', title: 't', body: 'b', rateCapHours: 0 });
    expect(r.skippedShabbat).toBe(0);
    expect(r.delivered).toBe(1);
  });
});
