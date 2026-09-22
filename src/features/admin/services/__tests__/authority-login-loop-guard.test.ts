import { describe, it, expect } from 'vitest';
import { decideLoopBreak, LOOP_GUARD_WINDOW_MS, type LoopAttemptRecord } from '../authority-login-loop-guard';

const NOW = 1_700_000_000_000; // arbitrary fixed instant

describe('decideLoopBreak', () => {
  it('first attempt, no prior record — retries (normal case, no ?redirected=1 involved)', () => {
    expect(decideLoopBreak(null, NOW, LOOP_GUARD_WINDOW_MS)).toBe('retry');
  });

  it('first attempt arriving with ?redirected=1 — still retries, because there is no PRIOR recorded attempt yet; ?redirected=1 itself is not a decision input (this is the exact false-positive the previous version had)', () => {
    // The component only calls decideLoopBreak with whatever sessionStorage
    // actually holds — an authority manager bounced once through
    // /admin/login (a real, legitimate, one-time redirect) has no loop-guard
    // record from THIS mechanism yet, so this is indistinguishable from
    // "first attempt, no prior record" at this layer, by design.
    const noPriorRecord: LoopAttemptRecord | null = null;
    expect(decideLoopBreak(noPriorRecord, NOW, LOOP_GUARD_WINDOW_MS)).toBe('retry');
  });

  it('second attempt within the window — stops (genuine loop)', () => {
    const fiveSecondsAgo: LoopAttemptRecord = { timestampMs: NOW - 5_000 };
    expect(decideLoopBreak(fiveSecondsAgo, NOW, LOOP_GUARD_WINDOW_MS)).toBe('stop');
  });

  it('second attempt after the window expired — retries (stale record, not a live loop)', () => {
    const thirtyFiveSecondsAgo: LoopAttemptRecord = { timestampMs: NOW - 35_000 };
    expect(decideLoopBreak(thirtyFiveSecondsAgo, NOW, LOOP_GUARD_WINDOW_MS)).toBe('retry');
  });

  // ── Boundary and defensive cases ────────────────────────────────────────

  it('exactly at the window boundary — treated as expired (strict less-than), retries', () => {
    const exactlyAtWindow: LoopAttemptRecord = { timestampMs: NOW - LOOP_GUARD_WINDOW_MS };
    expect(decideLoopBreak(exactlyAtWindow, NOW, LOOP_GUARD_WINDOW_MS)).toBe('retry');
  });

  it('one millisecond inside the window — still stops', () => {
    const justInsideWindow: LoopAttemptRecord = { timestampMs: NOW - LOOP_GUARD_WINDOW_MS + 1 };
    expect(decideLoopBreak(justInsideWindow, NOW, LOOP_GUARD_WINDOW_MS)).toBe('stop');
  });

  it('a future/corrupted timestamp (negative elapsed) fails open to retry rather than getting stuck', () => {
    const futureTimestamp: LoopAttemptRecord = { timestampMs: NOW + 10_000 };
    expect(decideLoopBreak(futureTimestamp, NOW, LOOP_GUARD_WINDOW_MS)).toBe('retry');
  });

  it('respects a custom window when explicitly passed', () => {
    const twoSecondsAgo: LoopAttemptRecord = { timestampMs: NOW - 2_000 };
    expect(decideLoopBreak(twoSecondsAgo, NOW, 1_000)).toBe('retry'); // outside a 1s window
    expect(decideLoopBreak(twoSecondsAgo, NOW, 5_000)).toBe('stop'); // inside a 5s window
  });
});
