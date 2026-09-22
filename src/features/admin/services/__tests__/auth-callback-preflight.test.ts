import { describe, it, expect } from 'vitest';
import { decidePreflightAction, type PreflightSessionInfo } from '../auth-callback-preflight';

describe('decidePreflightAction', () => {
  it('no session — proceeds with the link (normal sign-in)', () => {
    const result = decidePreflightAction(null, 'someone@example.com');
    expect(result).toEqual({ kind: 'proceed' });
  });

  it('anonymous session — proceeds with the link, exactly like no session (the regression\'s case)', () => {
    const anon: PreflightSessionInfo = { uid: 'anon-uid-1', email: null, isAnonymous: true };
    const result = decidePreflightAction(anon, 'someone@example.com');
    expect(result).toEqual({ kind: 'proceed' });
  });

  it('same email, real session — resolves destination directly, does not re-consume the code', () => {
    const real: PreflightSessionInfo = { uid: 'real-uid-1', email: 'manager@example.com', isAnonymous: false };
    const result = decidePreflightAction(real, 'manager@example.com');
    expect(result).toEqual({ kind: 'resolve', uid: 'real-uid-1' });
  });

  it('different email, real session — shows the account-switch confirm screen', () => {
    const real: PreflightSessionInfo = { uid: 'real-uid-1', email: 'someone-else@example.com', isAnonymous: false };
    const result = decidePreflightAction(real, 'manager@example.com');
    expect(result).toEqual({
      kind: 'confirm-switch',
      fromEmail: 'someone-else@example.com',
      toEmail: 'manager@example.com',
    });
  });

  // ── Edge cases beyond the four core scenarios ──────────────────────────

  it('email comparison is case-insensitive — same address in different case is NOT a switch', () => {
    const real: PreflightSessionInfo = { uid: 'real-uid-1', email: 'Manager@Example.com', isAnonymous: false };
    const result = decidePreflightAction(real, 'manager@example.com');
    expect(result).toEqual({ kind: 'resolve', uid: 'real-uid-1' });
  });

  it('real session, unresolvable target email (invitation link, verify-token failed) — resolves directly rather than blocking on an unknown target', () => {
    const real: PreflightSessionInfo = { uid: 'real-uid-1', email: 'someone@example.com', isAnonymous: false };
    const result = decidePreflightAction(real, '');
    expect(result).toEqual({ kind: 'resolve', uid: 'real-uid-1' });
  });

  it('anonymous session with a known target email still proceeds — never shows the switch screen for an anonymous identity', () => {
    const anon: PreflightSessionInfo = { uid: 'anon-uid-2', email: null, isAnonymous: true };
    const result = decidePreflightAction(anon, 'manager@example.com');
    expect(result).toEqual({ kind: 'proceed' });
  });
});
