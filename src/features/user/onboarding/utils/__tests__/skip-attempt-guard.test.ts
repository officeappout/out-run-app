import { describe, it, expect } from 'vitest';
import { createSkipAttemptGuard } from '../skip-attempt-guard';

// Pins the fix to round-3 review Finding 1: HealthDeclarationPage's
// already-accepted auto-skip used a raw boolean ref that, once set, never
// reset on a failed sync — leaving the alreadyAccepted render gate stuck on
// "טוען..." forever with no way for the user to proceed. This guard is the
// extracted fire-once/reset-on-failure contract runAutoSkip (health/page.tsx)
// is built on: fires exactly once on success, but reopens for exactly one
// retry — not an uncontrolled loop — after a failure.
describe('createSkipAttemptGuard', () => {
  it('is open before any attempt', () => {
    const guard = createSkipAttemptGuard();
    expect(guard.shouldStart()).toBe(true);
  });

  it('fires exactly once — closes after markStarted() and stays closed on success', () => {
    const guard = createSkipAttemptGuard();
    expect(guard.shouldStart()).toBe(true);
    guard.markStarted();
    expect(guard.shouldStart()).toBe(false);
    // A second effect run (e.g. a re-render before the async attempt
    // resolves) must not be able to fire a second concurrent attempt.
    expect(guard.shouldStart()).toBe(false);
  });

  it('reopens for exactly one retry after markFailed()', () => {
    const guard = createSkipAttemptGuard();
    guard.markStarted();
    expect(guard.shouldStart()).toBe(false);

    guard.markFailed();
    expect(guard.shouldStart()).toBe(true);
  });

  it('a full success run never reopens — no markFailed means no retry', () => {
    const guard = createSkipAttemptGuard();
    guard.markStarted();
    // success path: runAutoSkip never calls markFailed()
    expect(guard.shouldStart()).toBe(false);
  });

  it('simulates the real sequence: fail once, retry, then succeed — exactly two attempts total, never a third', () => {
    const guard = createSkipAttemptGuard();

    // Attempt 1 (auto-fired by the effect) — fails.
    expect(guard.shouldStart()).toBe(true);
    guard.markStarted();
    guard.markFailed();

    // Attempt 2 (user taps "נסה שוב") — succeeds.
    expect(guard.shouldStart()).toBe(true);
    guard.markStarted();
    // no markFailed() this time

    // Nothing left to retry — the guard must not permit a third attempt.
    expect(guard.shouldStart()).toBe(false);
  });
});
