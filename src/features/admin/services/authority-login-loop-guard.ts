/**
 * Loop guard for authority-portal/login's client-side redirect to
 * /admin/authority-manager (00-MASTER-PLAN.md §13.10).
 *
 * The FIRST version of this guard stopped on the mere presence of
 * ?redirected=1 — but landing here with that flag is also the NORMAL,
 * one-time, entirely legitimate outcome of an already-signed-in authority
 * manager visiting /admin/login directly (admin/login/page.tsx's own
 * isAuthorityManager check sends them straight here). Treating that as a
 * loop blocked a real manager who was never looping at all.
 *
 * This version tracks actual REPEATED attempts via a sessionStorage
 * timestamp instead: the first attempt always proceeds (mint cookie +
 * redirect), regardless of ?redirected=1. Only a SECOND attempt recorded
 * within a short time window counts as a genuine loop.
 *
 * decideLoopBreak() is pure (timestamps in, decision out) so the actual
 * threshold logic is unit-tested without sessionStorage or a browser.
 * readLastLoopAttempt/recordLoopAttempt/clearLoopAttempt are the
 * (non-pure, try/catch-guarded) sessionStorage glue around it.
 */

export const LOOP_GUARD_STORAGE_KEY = 'authority_login_redirect_attempt';
export const LOOP_GUARD_WINDOW_MS = 30_000;

export interface LoopAttemptRecord {
  timestampMs: number;
}

export type LoopBreakDecision = 'retry' | 'stop';

/**
 * `lastAttempt`: the previously recorded attempt (null if none, or if the
 * stored value couldn't be read/parsed — treated identically to "no prior
 * attempt", so a corrupted record fails open to retrying rather than
 * getting permanently stuck).
 * `nowMs` / `windowMs`: injected rather than read internally, so this
 * stays a pure function of its inputs.
 */
export function decideLoopBreak(
  lastAttempt: LoopAttemptRecord | null,
  nowMs: number,
  windowMs: number = LOOP_GUARD_WINDOW_MS,
): LoopBreakDecision {
  if (!lastAttempt) return 'retry';
  const elapsed = nowMs - lastAttempt.timestampMs;
  // Negative elapsed (clock skew, or a corrupted future timestamp) is
  // nonsensical as "still within the window" — fail open to retry rather
  // than risk a permanently-stuck guard.
  if (elapsed < 0) return 'retry';
  return elapsed < windowMs ? 'stop' : 'retry';
}

function hasSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function readLastLoopAttempt(): LoopAttemptRecord | null {
  if (!hasSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(LOOP_GUARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.timestampMs !== 'number' || !Number.isFinite(parsed.timestampMs)) {
      return null;
    }
    return { timestampMs: parsed.timestampMs };
  } catch {
    return null;
  }
}

export function recordLoopAttempt(nowMs: number = Date.now()): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.setItem(LOOP_GUARD_STORAGE_KEY, JSON.stringify({ timestampMs: nowMs }));
  } catch {
    /* quota exceeded / private-mode restrictions — non-fatal, the guard
       just won't remember this attempt across a reload */
  }
}

/** Called on successful arrival (e.g. admin/layout.tsx confirming the
 * manager actually landed on /admin/authority-manager) and on sign-out —
 * so a later, genuinely fresh login attempt isn't blocked by a stale
 * window from a completed or abandoned prior one. */
export function clearLoopAttempt(): void {
  if (!hasSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(LOOP_GUARD_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}
