/**
 * "I'm training here" pushes held back by quiet hours / Shabbat (review of #827): the marker is
 * deferred, the scheduler tick re-tries it once the window ends if it is still relevant, and drops
 * it otherwise. Plus the marker pre-check that saves the session re-read on the second tick.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const DELETE = Symbol('delete');
vi.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: vi.fn(),
  firestore: Object.assign(() => ({}), {
    FieldValue: { serverTimestamp: () => 'TS', delete: () => DELETE },
    Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
  }),
}));
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type Result = { attempted: number; delivered: number; skippedQuietHours?: number; skippedShabbat?: number };
const DELIVERED: Result = { attempted: 1, delivered: 1 };
const QUIET: Result = { attempted: 1, delivered: 0, skippedQuietHours: 1 };
const SHABBAT: Result = { attempted: 1, delivered: 0, skippedShabbat: 1 };
let nextResult: Result = DELIVERED;
const sendPush = vi.fn(async (_o: unknown) => nextResult);
vi.mock('../services/push.service', () => ({ sendPush: (o: unknown) => sendPush(o) }));
vi.mock('../services/push-copy.service', () => ({
  resolvePushCopy: async (t: string) => ({ title: t, body: 'b', deepLink: '/map', pushType: t, rowId: 'r' }),
  pushCopyData: () => ({}),
  loadPushRecipient: async () => ({ audience: {}, firstName: 'דנה' }),
  loadPushSubjectGender: async () => null,
}));

import { runTrainingHereReminderPass, sendPartnerNotices } from '../trainingHere/send-training-here-push';
import { runTrainingHereDeferredPass } from '../trainingHere/training-here-deferred';
import {
  deferredVerdict, parseMarkerMeta, suppressedByWindow, nextRetryMs, type TrainingHereMarkerMeta,
} from '../trainingHere/training-here-defer';
import { ownerReminderMarkerId, partnerNoticeMarkerId, toMs } from '../trainingHere/training-here-time';

const MIN = 60_000;
const START = Date.UTC(2026, 9, 27, 4, 30); // 06:30 Israel — just after the night window
const ts = (ms: number) => ({ toMillis: () => ms });

function session(over: Record<string, unknown> = {}) {
  return {
    userId: 'owner', displayName: 'יואב', parkId: 'p1', parkName: 'גן', startTime: ts(START),
    createdAt: ts(START - 10 * 60 * MIN), status: 'planned', privacyMode: 'squad', ...over,
  };
}

// ── in-memory Firestore: planned_sessions + markers (create / get / update with lastUpdateTime) ──
function fakeDb(opts: { flag?: boolean; sessions?: Record<string, Record<string, unknown>>; conn?: Record<string, unknown> } = {}) {
  const sessions = opts.sessions ?? {};
  const markers = new Map<string, { data: Record<string, unknown>; v: number }>();
  const reads = { sessions: 0 };
  let clock = 0;
  const markerRef = (id: string) => ({
    id,
    get: async () => ({ exists: markers.has(id), data: () => markers.get(id)?.data }),
    create: async (data: Record<string, unknown>) => {
      if (markers.has(id)) throw Object.assign(new Error('exists'), { code: 6 });
      markers.set(id, { data: { ...data }, v: ++clock });
    },
    update: async (patch: Record<string, unknown>, pre?: { lastUpdateTime?: number }) => {
      const m = markers.get(id);
      if (!m) throw Object.assign(new Error('missing'), { code: 5 });
      if (pre?.lastUpdateTime !== undefined && pre.lastUpdateTime !== m.v) throw Object.assign(new Error('pre'), { code: 9 });
      for (const [k, v] of Object.entries(patch)) {
        if (v === DELETE) delete m.data[k];
        else m.data[k] = v;
      }
      m.v = ++clock;
    },
  });
  const db = {
    doc: (path: string) => ({
      get: async () => {
        if (path === 'app_config/feature_flags') return { exists: true, data: () => ({ enableTrainingHereReminders: opts.flag ?? true }) };
        if (path.startsWith('connections/')) return opts.conn ? { exists: true, data: () => opts.conn } : { exists: false };
        return { exists: false };
      },
    }),
    collection: (c: string) => {
      if (c === 'training_here_push_fired') {
        return {
          doc: markerRef,
          where: (_f: string, _o: string, until: { toMillis: () => number }) => ({
            limit: (n: number) => ({
              get: async () => {
                const docs = Array.from(markers.entries())
                  .filter(([, m]) => { const d = toMs(m.data.deferredUntil); return d != null && d <= until.toMillis(); })
                  .slice(0, n)
                  .map(([id, m]) => ({ id, data: () => ({ ...m.data }), updateTime: m.v, ref: markerRef(id) }));
                return { size: docs.length, docs };
              },
            }),
          }),
        };
      }
      return {
        doc: (id: string) => ({
          get: async () => { reads.sessions += 1; return sessions[id] ? { exists: true, data: () => sessions[id] } : { exists: false }; },
        }),
        where: (_f: string, _o: string, from: { toMillis: () => number }) => ({
          where: (_f2: string, _o2: string, to: { toMillis: () => number }) => ({
            get: async () => {
              const docs = Object.entries(sessions)
                .filter(([, s]) => { const ms = toMs(s.startTime); return ms != null && ms > from.toMillis() && ms <= to.toMillis(); })
                .map(([id, s]) => ({ id, data: () => s }));
              return { size: docs.length, docs };
            },
          }),
        }),
      };
    },
  };
  return { db: db as never, sessions, markers, reads };
}

beforeEach(() => {
  sendPush.mockClear();
  nextResult = DELIVERED;
});

describe('pure helpers', () => {
  const m: TrainingHereMarkerMeta = { kind: 'reminder', sessionId: 's1', uid: 'owner', startMs: START };
  it('suppressedByWindow: only a quiet-hours / Shabbat drop with nothing delivered', () => {
    expect(suppressedByWindow(QUIET)).toBe('quiet_hours');
    expect(suppressedByWindow(SHABBAT)).toBe('shabbat');
    expect(suppressedByWindow(DELIVERED)).toBeNull();
    expect(suppressedByWindow({ attempted: 1, delivered: 0 })).toBeNull(); // prefs / caps: never retried
    expect(suppressedByWindow(null)).toBeNull();
  });
  it('reminder: sent only while planned, same owner + start, and not started', () => {
    expect(deferredVerdict(m, session(), START - 5 * MIN, false)).toEqual({ action: 'send' });
    expect(deferredVerdict(m, session(), START, false)).toMatchObject({ action: 'drop', reason: 'started' });
    expect(deferredVerdict(m, session({ status: 'cancelled' }), START - 5 * MIN, false)).toMatchObject({ action: 'drop' });
    expect(deferredVerdict(m, session({ startTime: ts(START + 60 * MIN) }), START - 5 * MIN, false))
      .toMatchObject({ action: 'drop', reason: 'time_changed' });
    expect(deferredVerdict(m, undefined, START - 5 * MIN, false)).toMatchObject({ action: 'drop', reason: 'session_gone' });
  });
  it('partner: future + planned + still shared with partners + still a mutual partner', () => {
    const p = { ...m, kind: 'partner' as const, uid: 'a' };
    expect(deferredVerdict(p, session({ startTime: ts(START + 60 * MIN) }), START, true)).toEqual({ action: 'send' }); // edited time is fine
    expect(deferredVerdict(p, session(), START - MIN, false)).toMatchObject({ action: 'drop', reason: 'not_partner' });
    expect(deferredVerdict(p, session({ privacyMode: 'ghost' }), START - MIN, true)).toMatchObject({ action: 'drop', reason: 'audience' });
    expect(deferredVerdict(p, session(), START + MIN, true)).toMatchObject({ action: 'drop', reason: 'started' });
  });
  it('marker meta round-trip; bad markers are rejected; retry spacing per kind', () => {
    expect(parseMarkerMeta({ ...m, at: 'TS' })).toEqual(m);
    expect(parseMarkerMeta({ kind: 'x', sessionId: 's', uid: 'u', startMs: 1 })).toBeNull();
    expect(nextRetryMs('reminder', 0)).toBe(5 * MIN);
    expect(nextRetryMs('partner', 0)).toBe(15 * MIN);
  });
});

describe('owner reminder: quiet hours → deferred → retried', () => {
  const marker = ownerReminderMarkerId('s1', START);

  it('suppressed → deferred → sent once when the window ends', async () => {
    const { db, markers } = fakeDb({ sessions: { s1: session() } });
    nextResult = QUIET;
    expect(await runTrainingHereReminderPass(db, START - 14 * MIN)).toBe(1);
    expect(markers.get(marker)!.data).toMatchObject({ kind: 'reminder', uid: 'owner', startMs: START, deferredReason: 'quiet_hours' });
    // Next tick, still quiet: the regular pass leaves it alone (marker), the deferred pass re-tries and re-defers.
    expect(await runTrainingHereReminderPass(db, START - 9 * MIN)).toBe(0);
    expect(await runTrainingHereDeferredPass(db, START - 9 * MIN)).toBe(0);
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(toMs(markers.get(marker)!.data.deferredUntil)).toBe(START - 4 * MIN);
    // Window over.
    nextResult = DELIVERED;
    expect(await runTrainingHereDeferredPass(db, START - 4 * MIN)).toBe(1);
    expect(markers.get(marker)!.data.deferredUntil).toBeUndefined();
    expect(await runTrainingHereDeferredPass(db, START - MIN)).toBe(0); // idempotent
    expect(sendPush).toHaveBeenCalledTimes(3);
  });

  it('suppressed → session started before the window ended → dropped, no push', async () => {
    const { db, markers } = fakeDb({ sessions: { s1: session() } });
    nextResult = SHABBAT;
    await runTrainingHereReminderPass(db, START - 12 * MIN);
    expect(markers.get(marker)!.data.deferredReason).toBe('shabbat');
    nextResult = DELIVERED;
    expect(await runTrainingHereDeferredPass(db, START + MIN)).toBe(0);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(markers.get(marker)!.data).toMatchObject({ droppedReason: 'started' });
    expect(markers.get(marker)!.data.deferredUntil).toBeUndefined();
  });

  it('suppressed → cancelled in between → dropped, no push', async () => {
    const { db, sessions, markers } = fakeDb({ sessions: { s1: session() } });
    nextResult = QUIET;
    await runTrainingHereReminderPass(db, START - 12 * MIN);
    sessions.s1 = session({ status: 'cancelled' });
    nextResult = DELIVERED;
    expect(await runTrainingHereDeferredPass(db, START - 7 * MIN)).toBe(0);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(markers.get(marker)!.data.droppedReason).toBe('not_planned');
  });

  it('a lease taken by another tick is not sent twice', async () => {
    const { db, markers } = fakeDb({ sessions: { s1: session() } });
    nextResult = QUIET;
    await runTrainingHereReminderPass(db, START - 12 * MIN);
    nextResult = DELIVERED;
    const both = await Promise.all([runTrainingHereDeferredPass(db, START - 7 * MIN), runTrainingHereDeferredPass(db, START - 7 * MIN)]);
    expect(both[0] + both[1]).toBe(1);
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(markers.get(marker)!.data.deferredUntil).toBeUndefined();
  });

  it('a delivered reminder is never deferred; the second tick skips the session re-read', async () => {
    const { db, markers, reads } = fakeDb({ sessions: { s1: session() } });
    expect(await runTrainingHereReminderPass(db, START - 14 * MIN)).toBe(1);
    expect(markers.get(marker)!.data.deferredUntil).toBeUndefined();
    const before = reads.sessions;
    expect(await runTrainingHereReminderPass(db, START - 9 * MIN)).toBe(0);
    expect(reads.sessions).toBe(before); // marker pre-check: no planned_sessions doc read
    expect(await runTrainingHereDeferredPass(db, START)).toBe(0);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });
});

describe('partner notice: quiet hours → deferred → retried', () => {
  const conn = { followers: ['a'], following: ['a'] };
  const NIGHT = START - 8 * 60 * MIN; // shared at 22:30 for 06:30
  const marker = partnerNoticeMarkerId('s1', 'a');

  it('suppressed → deferred → sent once in the morning, before the start', async () => {
    const { db, sessions, markers } = fakeDb({ conn, sessions: {} });
    sessions.s1 = session({ createdAt: ts(NIGHT) });
    nextResult = QUIET;
    expect(await sendPartnerNotices(db, 's1', sessions.s1, NIGHT)).toBe(1);
    expect(markers.get(marker)!.data).toMatchObject({ kind: 'partner', uid: 'a', deferredReason: 'quiet_hours' });
    expect(await runTrainingHereDeferredPass(db, NIGHT + 5 * MIN)).toBe(0); // not due yet: nothing read or sent
    expect(sendPush).toHaveBeenCalledTimes(1);
    nextResult = DELIVERED;
    expect(await runTrainingHereDeferredPass(db, START - 30 * MIN)).toBe(1);
    expect(await runTrainingHereDeferredPass(db, START - 10 * MIN)).toBe(0);
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect((sendPush.mock.calls[1][0] as { toUids: string[] }).toUids).toEqual(['a']);
  });

  it('suppressed → expired (session already started) → dropped', async () => {
    const { db, sessions, markers } = fakeDb({ conn });
    sessions.s1 = session({ createdAt: ts(NIGHT) });
    nextResult = QUIET;
    await sendPartnerNotices(db, 's1', sessions.s1, NIGHT);
    nextResult = DELIVERED;
    expect(await runTrainingHereDeferredPass(db, START + 5 * MIN)).toBe(0);
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(markers.get(marker)!.data.droppedReason).toBe('started');
  });

  const cases: [string, (sess: Record<string, Record<string, unknown>>, c: { following: string[] }) => void, string][] = [
    ['cancelled', (sess) => { sess.s1 = { ...sess.s1, status: 'cancelled' }; }, 'not_planned'],
    ['made private', (sess) => { sess.s1 = { ...sess.s1, privacyMode: 'ghost' }; }, 'audience'],
    ['unfollowed', (_s, c) => { c.following = []; }, 'not_partner'],
  ];
  for (const [label, change, reason] of cases) {
    it(`suppressed → ${label} in between → dropped, no push`, async () => {
      const liveConn = { followers: ['a'], following: ['a'] };
      const { db, sessions, markers } = fakeDb({ conn: liveConn });
      sessions.s1 = session({ createdAt: ts(NIGHT) });
      nextResult = QUIET;
      await sendPartnerNotices(db, 's1', sessions.s1, NIGHT);
      change(sessions, liveConn);
      nextResult = DELIVERED;
      expect(await runTrainingHereDeferredPass(db, START - 30 * MIN)).toBe(0);
      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(markers.get(marker)!.data.droppedReason).toBe(reason);
    });
  }
});
