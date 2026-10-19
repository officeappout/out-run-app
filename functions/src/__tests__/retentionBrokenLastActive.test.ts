import { describe, it, expect, vi } from 'vitest';

/**
 * 19.10.2026 — users.lastActive stored as { _methodName: 'serverTimestamp' }
 * (452 of 802 users) or missing (339). retentionScheduler's only candidate
 * query was where(lastActive <= cutoff), which a map/missing value never
 * matches, so retention reached ~10 users. Hermetic: fake Firestore, no emulator.
 */

vi.mock('firebase-admin', () => {
  const firestoreFn = () => ({});
  (firestoreFn as any).Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms }) };
  (firestoreFn as any).FieldValue = {};
  (firestoreFn as any).FieldPath = { documentId: () => '__name__' };
  return { apps: [{}], initializeApp: vi.fn(), firestore: firestoreFn, messaging: () => ({}) };
});
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));

import { activityToMillis, isQueryableTimestamp, isSerializedSentinel, lastActivityFromUserData } from '../lib/user-activity';
import { collectRetentionCandidates, confirmRealInactivity, toRetentionCandidate } from '../retentionScheduler';

const DAY = 86_400_000;
const NOW = Date.UTC(2027, 0, 13, 8);
const ts = (ms: number) => ({ toMillis: () => ms });
const SENTINEL = { _methodName: 'serverTimestamp' };

type Row = { id: string; data: Record<string, any> };

/**
 * Fake Firestore for the users queries (equality, lastActive <= range — which,
 * like Firestore, only matches real Timestamps — orderBy, limit, startAfter)
 * and the workouts lookup (`workouts[uid]` = latest workout ms).
 */
function fakeDb(rows: Row[], workouts: Record<string, number> = {}) {
  const calls: string[] = [];
  const usersQuery = (state: any): any => ({
    where: (f: string, op: string, v: any) => usersQuery({ ...state, wheres: [...state.wheres, [f, op, v]] }),
    orderBy: (f: string, dir = 'asc') => usersQuery({ ...state, order: [f, dir] }),
    limit: (n: number) => usersQuery({ ...state, limit: n }),
    startAfter: (c: any) => usersQuery({ ...state, after: typeof c === 'string' ? c : c.id }),
    select: () => usersQuery(state),
    get: async () => {
      calls.push(JSON.stringify(state.wheres.map((w: any) => w[0])));
      let out = rows.filter((r) =>
        state.wheres.every(([f, op, v]: any) => {
          if (op === '==') return r.data[f] === v;
          if (op === '<=') return isQueryableTimestamp(r.data[f]) && r.data[f].toMillis() <= v.toMillis();
          return true;
        }),
      );
      const [of, dir] = state.order ?? ['__name__', 'asc'];
      const key = (r: Row) => (of === '__name__' ? r.id : r.data[of].toMillis());
      out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
      if (state.after) out = out.slice(out.findIndex((r) => r.id === state.after) + 1);
      out = out.slice(0, state.limit ?? out.length);
      const docs = out.map((r) => ({ id: r.id, data: () => r.data }));
      return { empty: docs.length === 0, docs };
    },
  });
  const workoutsQuery = (uid?: string): any => ({
    where: (_f: string, _op: string, v: string) => workoutsQuery(v),
    orderBy: () => workoutsQuery(uid),
    limit: () => workoutsQuery(uid),
    select: () => workoutsQuery(uid),
    get: async () => {
      const ms = uid ? workouts[uid] : undefined;
      const docs = ms === undefined ? [] : [{ data: () => ({ date: ts(ms) }) }];
      return { empty: docs.length === 0, docs };
    },
  });
  const db = {
    collection: (name: string) => (name === 'users' ? usersQuery({ wheres: [] }) : workoutsQuery()),
  } as any;
  return { db, calls };
}

const user = (id: string, extra: Record<string, any>): Row => ({
  id,
  data: { onboardingStatus: 'COMPLETED', core: { name: 'דנה' }, ...extra },
});

const OPTS = { nowMs: NOW, thresholdDays: 7, inShabbatWindow: false, useAllSignals: true, batchLimit: 2, maxPages: 10 };

describe('sentinel values read as missing', () => {
  it('activityToMillis / lastActivityFromUserData ignore { _methodName }', () => {
    expect(isSerializedSentinel(SENTINEL)).toBe(true);
    expect(isSerializedSentinel(ts(1))).toBe(false);
    expect(activityToMillis(SENTINEL)).toBeNull();
    expect(lastActivityFromUserData({ lastActive: SENTINEL })).toBeNull();
    expect(lastActivityFromUserData({ lastActive: SENTINEL, progression: { lastActiveDate: '2027-01-01' } })).not.toBeNull();
    expect(isQueryableTimestamp(SENTINEL)).toBe(false);
    expect(isQueryableTimestamp({ seconds: 1, nanoseconds: 0 })).toBe(false);
    expect(isQueryableTimestamp(ts(1))).toBe(true);
  });
});

describe('collectRetentionCandidates — broken / missing lastActive', () => {
  const rows: Row[] = [
    user('a-valid-old', { lastActive: ts(NOW - 20 * DAY) }), // pass 1
    user('b-valid-recent', { lastActive: ts(NOW - 1 * DAY) }), // active → never a candidate
    user('c-sentinel-old-signal', { lastActive: SENTINEL, progression: { lastActiveDate: '2026-12-20' } }), // pass 2, doc signal
    user('d-sentinel-recent-signal', { lastActive: SENTINEL, running: { lastWorkoutDate: new Date(NOW - DAY).toISOString() } }),
    user('e-sentinel-no-signal', { lastActive: SENTINEL }), // provisional → workouts decide
    user('f-missing-no-signal', {}), // provisional
    user('g-optout', { lastActive: SENTINEL, settings: { pushEnabled: false } }),
    { id: 'h-onboarding', data: { onboardingStatus: 'ONBOARDING', lastActive: SENTINEL } },
  ];

  it('before: the range query alone reaches only the valid-Timestamp user', async () => {
    const { db } = fakeDb(rows);
    const r = await collectRetentionCandidates(db, { ...OPTS, useAllSignals: false });
    expect(r.candidates.map((x) => x.c.uid)).toEqual(['a-valid-old']);
    expect(r.fetchedUntimed).toBe(0);
  });

  it('now: users with a broken/missing lastActive are evaluated too, paginated', async () => {
    const { db } = fakeDb(rows);
    const r = await collectRetentionCandidates(db, OPTS);
    const uids = r.candidates.map((x) => x.c.uid).sort();
    expect(uids).toEqual(['a-valid-old', 'c-sentinel-old-signal', 'e-sentinel-no-signal', 'f-missing-no-signal']);
    expect(r.fetched).toBe(1);
    expect(r.fetchedUntimed).toBe(5); // c, d, e, f, g (h is not COMPLETED)
    const e = r.candidates.find((x) => x.c.uid === 'e-sentinel-no-signal')!;
    expect(e.c.lastActivityMs).toBeUndefined(); // provisional — must be confirmed
  });

  it('respects maxPages per pass (bounded cost)', async () => {
    const { db } = fakeDb(rows);
    const r = await collectRetentionCandidates(db, { ...OPTS, batchLimit: 1, maxPages: 2 });
    expect(r.fetchedUntimed).toBeLessThanOrEqual(2);
  });

  it('provisional candidates are sent only if the workouts collection confirms the absence', async () => {
    const { db } = fakeDb(rows, { 'e-sentinel-no-signal': NOW - 10 * DAY, 'f-missing-no-signal': NOW - 2 * DAY });
    const r = await collectRetentionCandidates(db, OPTS);
    const get = (u: string) => r.candidates.find((x) => x.c.uid === u)!;
    const e = await confirmRealInactivity(db, get('e-sentinel-no-signal').c, get('e-sentinel-no-signal').data, NOW, 7);
    expect(e).toMatchObject({ daysSince: 10, lastActivityMs: NOW - 10 * DAY });
    const f = await confirmRealInactivity(db, get('f-missing-no-signal').c, get('f-missing-no-signal').data, NOW, 7);
    expect(f).toBeNull(); // trained 2 days ago
  });

  it('no doc signal and no workout → never sent', async () => {
    const { db } = fakeDb(rows, {});
    const c = toRetentionCandidate('e', { lastActive: SENTINEL }, NOW, false, { allowUnknownDocActivity: true })!;
    expect(c).not.toBeNull();
    expect(await confirmRealInactivity(db, c, { lastActive: SENTINEL }, NOW, 7)).toBeNull();
  });

  it('without allowUnknownDocActivity (pass 1 / legacy) a signal-less user is still skipped', () => {
    expect(toRetentionCandidate('e', { lastActive: SENTINEL }, NOW)).toBeNull();
    expect(toRetentionCandidate('e', { lastActive: SENTINEL }, NOW, false, { useAllSignals: false, allowUnknownDocActivity: true })).toBeNull();
  });
});
