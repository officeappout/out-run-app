/**
 * App-session signal — enable_app_session_signal (default OFF, owner-approved 22.10.2026,
 * docs/admin/ADMIN-AI-ASSISTANT-PLAN.md open question 10: "return to the app without tapping a
 * push").
 *
 * Why not re-add `app_open` / `session_start`: they were removed from AnalyticsEventType in
 * #171 (06.10.2026) because NOTHING ever fired them (declared-but-dead taxonomy), not because of
 * cost or noise. A raw per-open event in the client-writable `analytics_events` firehose would
 * be the noisiest, costliest shape, so this is an AGGREGATE instead:
 *
 *   app_sessions_daily/{uid}_{YYYY-MM-DD (Israel)} = { uid, date, sessions, pushSessions?,
 *                                                      platform, lastAt }
 *
 * - one write per session — a session starts when the app comes to the foreground after
 *   ≥ 30 minutes away (or on a cold start after that), the usual analytics definition;
 * - at most DAILY_CAP writes per user per day on this device;
 * - `pushSessions` is incremented in the same write when the session began with a push tap
 *   (src/lib/native/push.ts marks the tap) → organic returns = sessions − pushSessions;
 * - no location, no names, no free text; honours the analytics opt-out; nothing before sign-in.
 *
 * Off = byte-identical: the flag is read first, nothing is stored or written.
 */
import { doc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { readLiveFlag } from '@/lib/feature-flag-live';
import { isCustomAnalyticsAllowed } from './consent';
import { PUSH_TAP_MARK_KEY } from '@/lib/app-session-mark';

export { PUSH_TAP_MARK_KEY, markPushTap } from '@/lib/app-session-mark';

export const APP_SESSIONS_COLLECTION = 'app_sessions_daily';
export const SESSION_GAP_MS = 30 * 60 * 1000;
export const DAILY_CAP = 12;
export const SESSION_STATE_KEY = 'out_app_session_v1';
/** A push tap this close to the session start means the session came from the push. */
export const PUSH_TAP_WINDOW_MS = 15_000;
/** Wait this long after a start before writing, so a push tap delivered just after resume is seen. */
export const START_SETTLE_MS = 3_000;

export interface SessionState {
  lastSeenMs: number | null;
  day: string | null;
  count: number;
}

export const EMPTY_SESSION_STATE: SessionState = { lastSeenMs: null, day: null, count: 0 };

/** YYYY-MM-DD in Israel time. */
export function israelDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

/**
 * Pure. Does the app coming to the foreground at `nowMs` start a new session (and should it be
 * written)? `next` always records `nowMs` as last seen.
 */
export function planSessionStart(state: SessionState, nowMs: number): { start: boolean; day: string; next: SessionState } {
  const day = israelDayKey(nowMs);
  const countToday = state.day === day ? state.count : 0;
  const away = state.lastSeenMs == null || nowMs - state.lastSeenMs >= SESSION_GAP_MS || nowMs < state.lastSeenMs;
  const start = away && countToday < DAILY_CAP;
  return { start, day, next: { lastSeenMs: nowMs, day, count: start ? countToday + 1 : countToday } };
}

/** Pure. The app went to the background (or is still in use) — only "last seen" moves. */
export function touchSession(state: SessionState, nowMs: number): SessionState {
  return { ...state, lastSeenMs: nowMs };
}

/** Pure. Was this session started by a push tap? */
export function startedFromPush(tapAtMs: number | null, startMs: number): boolean {
  return tapAtMs != null && Math.abs(startMs - tapAtMs) <= PUSH_TAP_WINDOW_MS;
}

/** Pure. The exact document write (setDoc merge) for one session start. */
export function buildSessionWrite(uid: string, day: string, viaPush: boolean, platform: 'ios' | 'android' | 'web') {
  return {
    uid,
    date: day,
    sessions: increment(1),
    ...(viaPush ? { pushSessions: increment(1) } : {}),
    platform,
    lastAt: serverTimestamp(),
  };
}

export function isAppSessionSignalOn(): boolean {
  return readLiveFlag('enableAppSessionSignal');
}

function readState(): SessionState {
  try {
    const raw = window.localStorage.getItem(SESSION_STATE_KEY);
    if (!raw) return EMPTY_SESSION_STATE;
    const p = JSON.parse(raw) as Partial<SessionState>;
    return {
      lastSeenMs: typeof p?.lastSeenMs === 'number' ? p.lastSeenMs : null,
      day: typeof p?.day === 'string' ? p.day : null,
      count: typeof p?.count === 'number' ? p.count : 0,
    };
  } catch {
    return EMPTY_SESSION_STATE;
  }
}

function writeState(state: SessionState): void {
  try {
    window.localStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
  } catch {
    /* no storage — worst case one extra session is counted (still capped) */
  }
}

function readPushTapMark(): number | null {
  try {
    const v = Number(window.sessionStorage.getItem(PUSH_TAP_MARK_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function isAdminPath(): boolean {
  try {
    return window.location?.pathname?.startsWith('/admin') ?? false;
  } catch {
    return false;
  }
}

function detectPlatform(): 'ios' | 'android' | 'web' {
  try {
    const p = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
    return p === 'ios' || p === 'android' ? p : 'web';
  } catch {
    return 'web';
  }
}

/** The app is going to the background — remember when, so the next foreground can tell a new session. */
export function noteAppHidden(nowMs: number = Date.now()): void {
  if (!isAppSessionSignalOn() || typeof window === 'undefined') return;
  writeState(touchSession(readState(), nowMs));
}

/**
 * The app is in the foreground (cold start once signed in, or resume). Writes one counter
 * increment if this starts a new session. Never throws. Resolves when done (tests await it).
 */
export async function recordAppForeground(nowMs: number = Date.now(), settleMs: number = START_SETTLE_MS): Promise<void> {
  if (!isAppSessionSignalOn() || typeof window === 'undefined') return;
  if (isAdminPath()) return; // the admin panel shares the root layout — not app usage
  const uid = auth.currentUser?.uid;
  if (!uid || !isCustomAnalyticsAllowed()) return; // nothing stored → counted once there is a user
  const { start, day, next } = planSessionStart(readState(), nowMs);
  writeState(next);
  if (!start) return;
  if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));
  const viaPush = startedFromPush(readPushTapMark(), nowMs);
  try {
    await setDoc(
      doc(db, APP_SESSIONS_COLLECTION, `${uid}_${day}`),
      buildSessionWrite(uid, day, viaPush, detectPlatform()),
      { merge: true },
    );
  } catch (err) {
    console.warn('[app-session] write failed:', err);
  }
}
