import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { setDoc } = vi.hoisted(() => ({ setDoc: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  setDoc: (...args: unknown[]) => setDoc(...args),
  increment: (n: number) => ({ __inc: n }),
  serverTimestamp: () => ({ __ts: true }),
}));
const { authState, consent } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u1' } as { uid: string } | null },
  consent: { allowed: true },
}));
vi.mock('@/lib/firebase', () => ({ auth: authState, db: {} }));
vi.mock('../consent', () => ({ isCustomAnalyticsAllowed: () => consent.allowed }));

import {
  DAILY_CAP,
  SESSION_GAP_MS,
  SESSION_STATE_KEY,
  EMPTY_SESSION_STATE,
  PUSH_TAP_MARK_KEY,
  buildSessionWrite,
  israelDayKey,
  markPushTap,
  noteAppHidden,
  planSessionStart,
  recordAppForeground,
  startedFromPush,
} from '../app-session';
import { LIVE_FLAGS_CACHE_KEY } from '@/lib/feature-flag-live';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

// 2026-10-22 10:00 Israel (UTC+3).
const T0 = Date.UTC(2026, 9, 22, 7, 0, 0);
const MIN = 60_000;

function stubWindow(flagOn: boolean, path = '/home') {
  const local: Record<string, string> = {};
  const session: Record<string, string> = {};
  if (flagOn) local[LIVE_FLAGS_CACHE_KEY] = JSON.stringify({ enableAppSessionSignal: true });
  const localStorage = {
    getItem: vi.fn((k: string) => local[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { local[k] = v; }),
  };
  const sessionStorage = {
    getItem: vi.fn((k: string) => session[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { session[k] = v; }),
  };
  vi.stubGlobal('window', { localStorage, sessionStorage, location: { pathname: path } });
  return { local, session, localStorage, sessionStorage };
}

describe('planSessionStart (pure)', () => {
  it('first ever foreground starts a session', () => {
    const r = planSessionStart(EMPTY_SESSION_STATE, T0);
    expect(r.start).toBe(true);
    expect(r.day).toBe('2026-10-22');
    expect(r.next).toEqual({ lastSeenMs: T0, day: '2026-10-22', count: 1 });
  });
  it('back within 30 min → same session; after ≥ 30 min → new one', () => {
    const a = planSessionStart(EMPTY_SESSION_STATE, T0).next;
    expect(planSessionStart(a, T0 + 29 * MIN).start).toBe(false);
    expect(planSessionStart(a, T0 + SESSION_GAP_MS).start).toBe(true);
  });
  it('daily cap, reset on the next Israel day', () => {
    const capped = { lastSeenMs: T0 - 2 * SESSION_GAP_MS, day: '2026-10-22', count: DAILY_CAP };
    expect(planSessionStart(capped, T0).start).toBe(false);
    const nextDay = planSessionStart(capped, Date.UTC(2026, 9, 22, 21, 30)); // 00:30 Israel on the 23rd
    expect(nextDay.start).toBe(true);
    expect(nextDay.next).toMatchObject({ day: '2026-10-23', count: 1 });
  });
  it('clock moved backwards → counts as a new session', () => {
    expect(planSessionStart({ lastSeenMs: T0 + 10 * MIN, day: '2026-10-22', count: 1 }, T0).start).toBe(true);
  });
  it('israelDayKey uses Israel time', () => {
    expect(israelDayKey(Date.UTC(2026, 9, 22, 22, 30))).toBe('2026-10-23');
  });
  it('push tap within 15 s of the start = push session', () => {
    expect(startedFromPush(T0 - 5000, T0)).toBe(true);
    expect(startedFromPush(T0 + 2000, T0)).toBe(true);
    expect(startedFromPush(T0 - 60_000, T0)).toBe(false);
    expect(startedFromPush(null, T0)).toBe(false);
  });
  it('the write: increments only, no location, pushSessions only when from a push', () => {
    const organic = buildSessionWrite('u1', '2026-10-22', false, 'ios');
    expect(Object.keys(organic).sort()).toEqual(['date', 'lastAt', 'platform', 'sessions', 'uid']);
    expect(buildSessionWrite('u1', '2026-10-22', true, 'android')).toMatchObject({ pushSessions: { __inc: 1 }, sessions: { __inc: 1 } });
  });
});

describe('runtime — enable_app_session_signal', () => {
  beforeEach(() => {
    setDoc.mockClear();
    authState.currentUser = { uid: 'u1' };
    consent.allowed = true;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is a panel flag, default OFF, same value for admins', () => {
    expect(FLAG_DEFS.find((d) => d.key === 'enableAppSessionSignal')).toEqual({
      key: 'enableAppSessionSignal',
      firestoreKey: 'enable_app_session_signal',
      defaultValue: false,
      superAdminValue: false,
    });
  });

  it('flag OFF → no write, no storage read or write (byte-identical)', async () => {
    const w = stubWindow(false);
    await recordAppForeground(T0, 0);
    noteAppHidden(T0);
    markPushTap(T0);
    expect(setDoc).not.toHaveBeenCalled();
    expect(w.localStorage.setItem).not.toHaveBeenCalled();
    expect(w.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(w.sessionStorage.getItem).not.toHaveBeenCalled();
  });

  it('flag ON: one write per session, merge + increment, doc {uid}_{day}', async () => {
    stubWindow(true);
    await recordAppForeground(T0, 0);
    await recordAppForeground(T0 + 5 * MIN, 0);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, data, opts] = setDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>, unknown];
    expect(ref.path).toBe('app_sessions_daily/u1_2026-10-22');
    expect(data).toMatchObject({ uid: 'u1', date: '2026-10-22', sessions: { __inc: 1 }, platform: 'web' });
    expect(data).not.toHaveProperty('pushSessions');
    expect(opts).toEqual({ merge: true });
  });

  it('flag ON: background → gap measured from going hidden', async () => {
    stubWindow(true);
    await recordAppForeground(T0, 0);
    noteAppHidden(T0 + 60 * MIN);
    await recordAppForeground(T0 + 80 * MIN, 0); // only 20 min away
    expect(setDoc).toHaveBeenCalledTimes(1);
    noteAppHidden(T0 + 81 * MIN);
    await recordAppForeground(T0 + 120 * MIN, 0);
    expect(setDoc).toHaveBeenCalledTimes(2);
  });

  it('flag ON: a session opened by a push tap increments pushSessions', async () => {
    const w = stubWindow(true);
    markPushTap(T0 - 2000);
    expect(w.session[PUSH_TAP_MARK_KEY]).toBe(String(T0 - 2000));
    await recordAppForeground(T0, 0);
    expect((setDoc.mock.calls[0] as unknown[])[1]).toMatchObject({ pushSessions: { __inc: 1 } });
  });

  it('flag ON: no user / opted out / admin panel → nothing written, nothing stored', async () => {
    const w = stubWindow(true);
    authState.currentUser = null;
    await recordAppForeground(T0, 0);
    authState.currentUser = { uid: 'u1' };
    consent.allowed = false;
    await recordAppForeground(T0, 0);
    expect(setDoc).not.toHaveBeenCalled();
    expect(w.local[SESSION_STATE_KEY]).toBeUndefined();

    consent.allowed = true;
    const a = stubWindow(true, '/admin/journey');
    await recordAppForeground(T0, 0);
    expect(setDoc).not.toHaveBeenCalled();
    expect(a.local[SESSION_STATE_KEY]).toBeUndefined();
  });

  it('a failed write never throws', async () => {
    stubWindow(true);
    setDoc.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(recordAppForeground(T0, 0)).resolves.toBeUndefined();
  });
});
