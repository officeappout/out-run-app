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

// Page size 2 for this whole file, so every case also runs through the
// cursor pagination (19.10.2026) — not just the single-page path.
vi.hoisted(() => {
  process.env.TRAINING_REMINDER_BATCH = '2';
});

const state = vi.hoisted(() => ({
  store: new Map<string, Record<string, any> | undefined>(),
  userSchedule: [] as Array<{ id: string; data: Record<string, any> }>,
  workouts: [] as Array<{ id: string; data: Record<string, any> }>,
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

function getPath(obj: Record<string, any> | undefined, dotted: string): unknown {
  return dotted.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), obj);
}

function rowsOf(name: string): Array<{ id: string; data: Record<string, any> }> {
  if (name === 'userSchedule') return state.userSchedule;
  if (name === 'workouts') return state.workouts;
  const out: Array<{ id: string; data: Record<string, any> }> = [];
  state.store.forEach((data, key) => {
    const [col, id] = key.split('/');
    if (col === name && data) out.push({ id, data });
  });
  return out;
}

type Filter = { field: string; op: string; value: unknown };

function makeQuery(name: string, filters: Filter[], n = Number.POSITIVE_INFINITY, afterId: string | null = null, orderDesc: string | null = null): any {
  return {
    where: (field: string, op: string, value: unknown) => makeQuery(name, [...filters, { field, op, value }], n, afterId, orderDesc),
    orderBy: (field: string, dir?: string) => makeQuery(name, filters, n, afterId, dir === 'desc' ? field : null),
    select: () => makeQuery(name, filters, n, afterId, orderDesc),
    limit: (m: number) => makeQuery(name, filters, m, afterId, orderDesc),
    startAfter: (cursor: { id: string }) => makeQuery(name, filters, n, cursor.id, orderDesc),
    get: async () => {
      let all = rowsOf(name).filter((d) =>
        filters.every((f) => {
          const v = getPath(d.data, f.field) as any;
          if (f.op === '==') return v === f.value;
          if (v === undefined || v === null) return false;
          if (f.op === '>=') return v >= (f.value as any);
          if (f.op === '<=') return v <= (f.value as any);
          return false;
        }),
      );
      all = orderDesc
        ? all.sort((a, b) => String(getPath(b.data, orderDesc)).localeCompare(String(getPath(a.data, orderDesc))))
        : all.sort((a, b) => a.id.localeCompare(b.id));
      const start = afterId === null ? 0 : all.findIndex((d) => d.id === afterId) + 1;
      const matches = all.slice(start, start + n);
      return { empty: matches.length === 0, docs: matches.map((d) => ({ id: d.id, data: () => d.data })) };
    },
  };
}

function makeFakeDb() {
  return {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name, id),
      // Paged like Firestore (19.10.2026): limit + startAfter(<last doc>), doc-id order.
      // 21.10.2026: chained where (==, >=, <=) on dotted paths over userSchedule,
      // users (the template pass) and workouts (orderBy date desc).
      where: (field: string, op: string, value: unknown) => makeQuery(name, [{ field, op, value }]),
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

function seedSchedule(uid: string, date: string, startTime?: string) {
  state.userSchedule.push({
    id: `${uid}_${date}`,
    data: {
      userId: uid,
      date,
      entries: [{ type: 'training', completed: false, scheduledCategories: ['strength'], ...(startTime ? { startTime } : {}) }],
    },
  });
}

function setWorkoutEntriesGate(enabled: boolean) {
  setDoc('app_config', 'feature_flags', { reminderSweepWorkoutEntriesEnabled: enabled });
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
    state.workouts = [];
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

  it('pages past the first page — every scheduled user is reminded, each once (was capped at one page)', async () => {
    setIsraelTime(18);
    const uids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    for (const uid of uids) {
      seedSchedule(uid, TODAY);
      seedUser(uid, '18:00');
    }

    await (trainingReminderScheduler as any)();

    const tokens = fakeMessaging.sendEachForMulticast.mock.calls.flatMap((c: any[]) => c[0].tokens as string[]);
    expect(tokens.sort()).toEqual(uids.map((u) => `tok-${u}`));
  });

  it('demo world guard (20.10.2026): a demo user is never reminded, the real one next to them is', async () => {
    setIsraelTime(18);
    seedSchedule('demo_c1', TODAY);
    seedUser('demo_c1', '18:00');
    seedSchedule('user1', TODAY);
    seedUser('user1', '18:00');

    await (trainingReminderScheduler as any)();

    const tokens = fakeMessaging.sendEachForMulticast.mock.calls.flatMap((c: any) => c[0].tokens);
    expect(tokens).toEqual(['tok-user1']);
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

  describe('reminderSweepWorkoutEntriesEnabled gate (v2, 06.10.2026)', () => {
    // All 3 cases: current time = 17:00 = the user's preferred hour (so
    // hour-matching alone would pass), entry startTime = 18:00 — in the
    // FUTURE relative to "now," so the pre-existing "already passed" skip
    // (trainEntry.startTime <= now) never fires either. This isolates the
    // NEW gate as the only possible cause of a skip in test 1.
    it('gate ON + entry HAS a startTime — skipped here entirely, even though the hour matches', async () => {
      setWorkoutEntriesGate(true);
      setIsraelTime(17);
      seedSchedule('user5', TODAY, '18:00'); // has startTime, not yet passed
      seedUser('user5', '17:00');

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('gate ON + entry has NO startTime — still fires normally (the residual case the sweep cannot serve)', async () => {
      setWorkoutEntriesGate(true);
      setIsraelTime(17);
      seedSchedule('user6', TODAY); // no startTime
      seedUser('user6', '17:00');

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({ tokens: ['tok-user6'] }),
      );
    });

    it('gate OFF/absent — an entry WITH a startTime still fires exactly as before (zero-code-change reversibility)', async () => {
      // Deliberately NOT calling setWorkoutEntriesGate — app_config/feature_flags absent entirely.
      setIsraelTime(17);
      seedSchedule('user7', TODAY, '18:00');
      seedUser('user7', '17:00');

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({ tokens: ['tok-user7'] }),
      );
    });
  });

  // ── Push-lifecycle audit, gap 2 (21.10.2026) ──────────────────────────────
  // Template-created entries (hydrateFromTemplate) carry startTime = the
  // user's reminder time, or 07:00. The reminder runs at that same hour, so
  // the old `startTime <= now` check skipped exactly these sessions. The
  // older tests above never caught it: their entries had no startTime.
  describe('template-created entries WITH startTime at the send hour (gap 2)', () => {
    function seedTemplateEntry(uid: string, startTime: string) {
      state.userSchedule.push({
        id: `${uid}_${TODAY}`,
        data: {
          userId: uid,
          date: TODAY,
          entries: [{ type: 'training', source: 'recurring', completed: false, programIds: ['full_body'], startTime }],
        },
      });
    }

    it('strength at 07:00 (no reminder time set) is reminded at the 07:00 run, even 40s into it', async () => {
      setIsraelTime(7);
      vi.setSystemTime(new Date(Date.now() + 40_000));
      seedTemplateEntry('s7', '07:00');
      seedUser('s7');

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['tok-s7'] }));
    });

    it('evening run at 19:00 (runningTime 19:00) is reminded at the 19:00 run', async () => {
      setIsraelTime(19, 2); // scheduler delay of 2 minutes
      seedTemplateEntry('r19', '19:00');
      seedUser('r19', '19:00');

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['tok-r19'] }));
    });

    it('a session that started before the run hour is still skipped', async () => {
      setIsraelTime(7);
      seedTemplateEntry('early', '06:30');
      seedUser('early');

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });
  });

  // ── Gap 4: no day doc → today's sessions from the recurring template ───────
  describe('server-side materialisation from the recurring template (gap 4)', () => {
    // 2026-09-10 is a Thursday → day letter 'ה'.
    function seedTemplateUser(uid: string, opts: { runningTime?: string; template?: Record<string, string[]>; runId?: string } = {}) {
      setDoc('users', uid, {
        onboardingStatus: 'COMPLETED',
        fcmTokens: [`tok-${uid}`],
        settings: { pushEnabled: true, notificationPrefs: { training_reminder: true } },
        lifestyle: {
          recurringTemplate: opts.template ?? { ה: ['full_body'] },
          ...(opts.runningTime ? { reminders: { runningTime: opts.runningTime } } : {}),
        },
        ...(opts.runId ? { running: { activeProgram: { programId: opts.runId } } } : {}),
      });
    }

    function sentTitles(): string[] {
      return fakeMessaging.sendEachForMulticast.mock.calls.map((c: any[]) => c[0].notification?.title as string);
    }

    it('a user who never opened today gets the reminder at their hour, labelled by the session (a run)', async () => {
      setIsraelTime(19);
      seedTemplateUser('t1', { runningTime: '19:00', template: { ה: ['run_prog'] }, runId: 'run_prog' });

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['tok-t1'] }));
      expect(sentTitles()[0]).toBe('ריצה היום');
      // Nothing written to userSchedule (virtual), the once-per-day guard stamped.
      expect(state.userSchedule).toHaveLength(0);
      expect(state.store.get('push_rate/t1')?.trainingReminderSentDate).toBe(TODAY);
    });

    it('no reminder time set → the 07:00 run, labelled strength', async () => {
      setIsraelTime(7);
      seedTemplateUser('t2');

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['tok-t2'] }));
      expect(sentTitles()[0]).toBe('אימון כוח היום');
    });

    it('not at another hour, not on a weekday the template does not plan, not on a template rest day', async () => {
      setIsraelTime(18);
      seedTemplateUser('t3', { runningTime: '19:00' });
      seedTemplateUser('t4', { runningTime: '18:00', template: { א: ['full_body'] } });
      seedTemplateUser('t5', { runningTime: '18:00', template: { ה: [] } });

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it("the user's own edit of the day (rest override) blocks the template", async () => {
      setIsraelTime(18);
      seedTemplateUser('t6', { runningTime: '18:00' });
      state.userSchedule.push({
        id: `t6_${TODAY}`,
        data: { userId: 't6', date: TODAY, entries: [{ type: 'rest', source: 'manual', override: true }] },
      });

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('a day doc already hydrated and completed → no second reminder from the template', async () => {
      setIsraelTime(18);
      seedTemplateUser('t7', { runningTime: '18:00' });
      state.userSchedule.push({
        id: `t7_${TODAY}`,
        data: { userId: 't7', date: TODAY, entries: [{ type: 'training', source: 'recurring', completed: true, startTime: '18:00' }] },
      });

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('a user with a day doc AND a template is reminded once (from the day doc)', async () => {
      setIsraelTime(18);
      seedTemplateUser('t8', { runningTime: '18:00' });
      seedSchedule('t8', TODAY, '18:00');

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).toHaveBeenCalledTimes(1);
    });

    it('already trained today → no reminder', async () => {
      setIsraelTime(18);
      seedTemplateUser('t9', { runningTime: '18:00' });
      state.workouts.push({ id: 'w1', data: { userId: 't9', date: new Date(Date.now() - 3 * 3600_000) } });

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('kill switch: trainingReminderFromTemplate === false → day docs only', async () => {
      setIsraelTime(18);
      setDoc('app_config', 'feature_flags', { trainingReminderFromTemplate: false });
      seedTemplateUser('t10', { runningTime: '18:00' });

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('demo users are never materialised', async () => {
      setIsraelTime(18);
      seedTemplateUser('demo_t', { runningTime: '18:00' });

      await (trainingReminderScheduler as any)();

      expect(fakeMessaging.sendEachForMulticast).not.toHaveBeenCalled();
    });
  });
});
