import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Proves trainingReminderScheduler's personalized-hour targeting:
 *   - a user's preferred hour (users/{uid}.lifestyle.reminders.runningTime)
 *     only fires on the matching hourly run
 *   - no preference falls back to DEFAULT_HOUR (7)
 *   - quiet hours (real push.service.ts logic, not re-implemented here)
 *     suppress a push whose preferred hour falls in 22:00-07:00
 *   - the once-per-day guard blocks a second send the same day
 *
 * Uses the REAL sendPush() (not mocked) against an in-memory Firestore fake,
 * same style as push.service.daily-cap.test.ts, so quiet-hours/rate-cap/
 * daily-cap are exercised for real, not re-asserted by a mock. Wall-clock
 * time is controlled via vi fake timers so both this file's hour math and
 * push.service.ts's own Asia/Jerusalem checks see a consistent "now".
 */

const state = vi.hoisted(() => ({
  store: new Map<string, Record<string, any> | undefined>(),
  userSchedule: [] as Array<{ id: string; data: Record<string, any> }>,
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
      where: (field: string, _op: string, value: unknown) => ({
        limit: (n: number) => ({
          get: async () => {
            const matches =
              name === 'userSchedule'
                ? state.userSchedule.filter((d) => d.data[field] === value).slice(0, n)
                : [];
            return { docs: matches.map((d) => ({ id: d.id, data: () => d.data })) };
          },
        }),
      }),
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
    apps: [] as any[],
    initializeApp: vi.fn(),
    firestore: firestoreFn,
    messaging: () => fakeMessaging,
  };
});

vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => unknown) => handler,
}));

vi.mock('../services/push-events.service', () => ({
  writePushSentEvent: vi.fn(async () => {}),
}));

import { trainingReminderScheduler } from '../trainingReminderScheduler';

function setDoc(collection: string, id: string, data: Record<string, any>) {
  state.store.set(pathKey(collection, id), data);
}

function seedSchedule(uid: string, date: string) {
  state.userSchedule.push({
    id: `${uid}_${date}`,
    data: {
      userId: uid,
      date,
      entries: [{ type: 'training', completed: false, scheduledCategories: ['strength'] }],
    },
  });
}

function seedUser(uid: string, runningTime?: string) {
  setDoc('users', uid, {
    fcmTokens: [`tok-${uid}`],
    settings: { pushEnabled: true, notificationPrefs: { training_reminder: true } },
    ...(runningTime ? { lifestyle: { reminders: { runningTime } } } : {}),
  });
}

/** Set wall-clock time to a given Israel-local hour on 2026-09-10 (DST, UTC+3). */
function setIsraelTime(hour: number, minute = 0) {
  vi.setSystemTime(new Date(Date.UTC(2026, 8, 10, hour - 3, minute, 0)));
}

const TODAY = '2026-09-10';

describe('trainingReminderScheduler — personalized hour targeting', () => {
  beforeEach(() => {
    state.store.clear();
    state.userSchedule = [];
    fakeMessaging.sendEachForMulticast.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires when the user\'s preferred hour matches this run\'s hour', async () => {
    setIsraelTime(18);
    seedSchedule('user1', TODAY);
    seedUser('user1', '18:00');

    await (trainingReminderScheduler as any)();

    expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['tok-user1'] }),
    );
  });

  it('does not fire when the run hour does not match the preferred hour', async () => {
    setIsraelTime(17);
    seedSchedule('user1', TODAY);
    seedUser('user1', '18:00');

    await (trainingReminderScheduler as any)();

    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('falls back to hour 7 when no runningTime preference is set', async () => {
    setIsraelTime(7);
    seedSchedule('user2', TODAY);
    seedUser('user2'); // no runningTime at all

    await (trainingReminderScheduler as any)();

    expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: ['tok-user2'] }),
    );
  });

  it('suppresses via real quiet-hours logic when the preferred hour is 02:00', async () => {
    setIsraelTime(2);
    seedSchedule('user3', TODAY);
    seedUser('user3', '02:00');

    await (trainingReminderScheduler as any)();

    // Real push.service.ts quiet-hours check (22:00-07:00) suppresses before
    // any FCM call — the hour-match alone is not enough to deliver.
    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    // But the once-per-day guard still stamps — today's decision for this
    // user (quiet-suppressed) is final, not retried at a later hour.
    const rateDoc = state.store.get('push_rate/user3');
    expect(rateDoc?.trainingReminderSentDate).toBe(TODAY);
  });

  it('the once-per-day guard blocks a second send the same day', async () => {
    setIsraelTime(18);
    seedSchedule('user4', TODAY);
    seedUser('user4', '18:00');
    setDoc('push_rate', 'user4', { trainingReminderSentDate: TODAY });

    await (trainingReminderScheduler as any)();

    expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
  });
});
