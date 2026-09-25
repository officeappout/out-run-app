import { describe, it, expect } from 'vitest';
import { resolveAuthLinkOutcome } from '../resolveAuthLinkOutcome';

// P0-4 (25.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md §13.24):
// David's exact scenarios — a guest tapping "המשך עם Google/Apple" must
// link (not swap sessions), an existing-account conflict must not change
// anything until an explicit confirm, cancel must be a true no-op, and a
// network failure must be visible, never silent. Every real failure path
// (including account_exists, as its own distinct reason) must carry a
// reportReason so page.tsx can log it to signup_failures.

describe('resolveAuthLinkOutcome — P0-4', () => {
  it('a successful link keeps the SAME uid — proves data is never abandoned', () => {
    const outcome = resolveAuthLinkOutcome(
      'google',
      { user: { uid: 'anon-uid-123' }, error: null },
      'anon-uid-123',
    );
    expect(outcome).toEqual({ kind: 'proceed', uid: 'anon-uid-123' });
  });

  it('a successful Apple link also keeps the same uid', () => {
    const outcome = resolveAuthLinkOutcome(
      'apple',
      { user: { uid: 'anon-uid-456' }, error: null },
      'anon-uid-456',
    );
    expect(outcome).toEqual({ kind: 'proceed', uid: 'anon-uid-456' });
  });

  it('google_account_exists changes NOTHING by itself — no uid, no redirect, just a decision to surface', () => {
    const outcome = resolveAuthLinkOutcome(
      'google',
      { user: null, error: 'google_account_exists' },
      'anon-uid-123',
    );
    expect(outcome.kind).toBe('account_exists');
    expect(outcome).not.toHaveProperty('uid');
    if (outcome.kind === 'account_exists') {
      expect(outcome.provider).toBe('google');
      expect(outcome.reportReason).toBe('google_account_exists');
    }
  });

  it('apple_account_exists — same shape for Apple', () => {
    const outcome = resolveAuthLinkOutcome(
      'apple',
      { user: null, error: 'apple_account_exists' },
      'anon-uid-456',
    );
    expect(outcome.kind).toBe('account_exists');
    if (outcome.kind === 'account_exists') {
      expect(outcome.provider).toBe('apple');
      expect(outcome.reportReason).toBe('apple_account_exists');
    }
  });

  it('cancel (google_canceled) is silent — no report reason, no uid, nothing to act on', () => {
    const outcome = resolveAuthLinkOutcome('google', { user: null, error: 'google_canceled' }, 'anon-uid');
    expect(outcome).toEqual({ kind: 'silent' });
  });

  it('closing the popup (popup_closed) is treated the same as cancel', () => {
    const outcome = resolveAuthLinkOutcome('google', { user: null, error: 'popup_closed' }, 'anon-uid');
    expect(outcome).toEqual({ kind: 'silent' });
  });

  it('apple_canceled is silent', () => {
    const outcome = resolveAuthLinkOutcome('apple', { user: null, error: 'apple_canceled' }, 'anon-uid');
    expect(outcome).toEqual({ kind: 'silent' });
  });

  it('a network/generic failure is a visible error with a non-empty toast message and a report reason', () => {
    const outcome = resolveAuthLinkOutcome(
      'google',
      { user: null, error: 'auth/network-request-failed' },
      'anon-uid',
    );
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.reportReason).toBe('auth/network-request-failed');
      expect(outcome.toastMessage.length).toBeGreaterThan(0);
    }
  });

  it('a timeout is also a visible error, distinct from account_exists/cancel', () => {
    const outcome = resolveAuthLinkOutcome('google', { user: null, error: 'google_timeout' }, 'anon-uid');
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.reportReason).toBe('google_timeout');
    }
  });

  it('not_anonymous with a current user proceeds using that uid (defensive branch)', () => {
    const outcome = resolveAuthLinkOutcome('google', { user: null, error: 'not_anonymous' }, 'already-real-uid');
    expect(outcome).toEqual({ kind: 'proceed', uid: 'already-real-uid' });
  });

  it('not_anonymous with no current user (should not happen) still surfaces as a visible error, not a silent no-op', () => {
    const outcome = resolveAuthLinkOutcome('google', { user: null, error: 'not_anonymous' }, null);
    expect(outcome.kind).toBe('error');
  });

  it('no user and no error (should not happen) falls back to a visible error, never silent', () => {
    const outcome = resolveAuthLinkOutcome('google', { user: null, error: null }, 'anon-uid');
    expect(outcome.kind).toBe('error');
    if (outcome.kind === 'error') {
      expect(outcome.reportReason).toBe('unknown');
    }
  });
});
