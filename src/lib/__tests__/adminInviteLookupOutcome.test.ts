import { describe, it, expect } from 'vitest';
import { resolveInviteLookupOutcome } from '../adminInviteLookupOutcome';

/**
 * SPEC-02 SEC-16: check-email/route.ts's catch returns `{ role: null }`
 * with HTTP 500 on an unexpected server error — indistinguishable, before
 * this fix, from a clean 200 response that legitimately found no
 * invitation. A real admin hitting a transient failure was told "email
 * not found in the system, contact the administrator" instead of "try
 * again." This proves the fix: a non-ok response is always flagged
 * checkFailed, never treated as a confirmed absence.
 */
describe('resolveInviteLookupOutcome', () => {
  it("SEC-16 fix: a non-ok response (e.g. the route's 500) is a failed check, not a confirmed absence", () => {
    expect(resolveInviteLookupOutcome(false, null)).toEqual({ role: null, checkFailed: true });
  });

  it('a clean 200 with role:null is a confirmed absence, not a failure', () => {
    expect(resolveInviteLookupOutcome(true, null)).toEqual({ role: null, checkFailed: false });
  });

  it('a clean 200 with a real role is returned as-is, not a failure', () => {
    expect(resolveInviteLookupOutcome(true, 'authority_manager')).toEqual({
      role: 'authority_manager',
      checkFailed: false,
    });
  });
});
