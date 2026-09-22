import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * 22.09.2026 (rate-limiting rollout, phase B) — proves the ordering
 * property .claude/plans/rate-limiting-sensitive-endpoints.md part ג
 * requires: sendAdminMagicLink (used by /admin/login) checks the
 * login-link rate-limit gate BEFORE doing any of checkAdminEmail's role-
 * check work (getUserByEmail, getAuthoritiesByManager). A blocked caller
 * must never reach — and therefore never cost, and never learn anything
 * from the timing/behavior of — the existence-check machinery.
 *
 * Every dependency checkAdminEmail touches is mocked so a "not blocked"
 * run never needs a real Firestore/network call; this test only asserts
 * which mocks were or weren't invoked, not what checkAdminEmail decides.
 */

vi.mock('@/lib/auth.service', () => ({
  checkLoginLinkGate: vi.fn(),
  sendMagicLink: vi.fn(),
}));
vi.mock('../authority.service', () => ({
  getAuthoritiesByManager: vi.fn(),
}));
vi.mock('../admin-management.service', () => ({
  getUserByEmail: vi.fn(),
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('sendAdminMagicLink — gate runs before any existence check', () => {
  it('when the gate blocks: returns its error, never calls getUserByEmail/getAuthoritiesByManager/sendMagicLink', async () => {
    const { checkLoginLinkGate, sendMagicLink } = await import('@/lib/auth.service');
    const { getUserByEmail } = await import('../admin-management.service');
    const { getAuthoritiesByManager } = await import('../authority.service');

    vi.mocked(checkLoginLinkGate).mockResolvedValue({
      allowed: false,
      error: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
    });

    const { sendAdminMagicLink } = await import('../passwordless-auth.service');
    const result = await sendAdminMagicLink('manager@example.com', 'super_admin');

    expect(result).toEqual({ sent: false, error: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' });
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(getAuthoritiesByManager).not.toHaveBeenCalled();
    expect(sendMagicLink).not.toHaveBeenCalled();
  });

  it('when the gate allows: proceeds to the existence check (getUserByEmail is called)', async () => {
    const { checkLoginLinkGate } = await import('@/lib/auth.service');
    const { getUserByEmail } = await import('../admin-management.service');

    vi.mocked(checkLoginLinkGate).mockResolvedValue({ allowed: true, error: null });
    vi.mocked(getUserByEmail).mockResolvedValue(null);

    const { sendAdminMagicLink } = await import('../passwordless-auth.service');
    await sendAdminMagicLink('manager@example.com', 'super_admin');

    expect(getUserByEmail).toHaveBeenCalledWith('manager@example.com');
  });
});
