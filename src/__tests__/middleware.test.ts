import { describe, it, expect } from 'vitest';
import { shouldGateAdminRequest, decideAdminGateAction, type GateSessionInfo } from '../middleware';

/**
 * SPEC-02 SEC-12: the admin-page cookie gate used to fire only when
 * `domain === 'admin.outrun.co.il' | 'admin.outrun.local'`. `/admin/*`
 * served on any OTHER real domain — the Vercel domain the native app
 * actually loads via capacitor.config.ts's `server.url`, or any
 * preview/staging deploy — shipped its full HTML/JS bundle with zero
 * server-side session check. This proves the fix: every non-local
 * domain is now gated, not just the two admin-specific hostnames.
 */
describe('shouldGateAdminRequest', () => {
  it('gates /admin/* on the admin domain (unchanged behavior)', () => {
    expect(shouldGateAdminRequest('/admin/dashboard', 'admin.outrun.co.il')).toBe(true);
  });

  it('SEC-12 fix: gates /admin/* on the Vercel/production domain — this used to slip through', () => {
    expect(shouldGateAdminRequest('/admin/dashboard', 'out-run-app.vercel.app')).toBe(true);
  });

  it('SEC-12 fix: gates /admin/* on any other real domain (e.g. a preview deploy)', () => {
    expect(shouldGateAdminRequest('/admin/users', 'some-preview-deploy.vercel.app')).toBe(true);
  });

  it('gates /admin/* on the authority-portal domain too (portal managers are gated elsewhere, but this page path is still /admin)', () => {
    expect(shouldGateAdminRequest('/admin/authority-manager', 'portal.outrun.co.il')).toBe(true);
  });

  it('exempts localhost — Admin SDK credentials are typically not configured there', () => {
    expect(shouldGateAdminRequest('/admin/dashboard', 'localhost')).toBe(false);
  });

  it('exempts 127.0.0.1', () => {
    expect(shouldGateAdminRequest('/admin/dashboard', '127.0.0.1')).toBe(false);
  });

  it('exempts a LAN dev IP (192.168.x.x)', () => {
    expect(shouldGateAdminRequest('/admin/dashboard', '192.168.1.50')).toBe(false);
  });

  it('exempts /admin/login (public entry point) even on a real domain', () => {
    expect(shouldGateAdminRequest('/admin/login', 'admin.outrun.co.il')).toBe(false);
  });

  it('exempts /admin/auth/callback (public entry point)', () => {
    expect(shouldGateAdminRequest('/admin/auth/callback', 'out-run-app.vercel.app')).toBe(false);
  });

  it('exempts /admin/pending-approval (public entry point)', () => {
    expect(shouldGateAdminRequest('/admin/pending-approval', 'admin.outrun.co.il')).toBe(false);
  });

  it('does not gate non-/admin paths', () => {
    expect(shouldGateAdminRequest('/dashboard', 'out-run-app.vercel.app')).toBe(false);
  });
});

/**
 * 00-MASTER-PLAN.md §13.10 — the redirect loop. authority-portal/login
 * (client-side, checkUserRole) sent a manager to /admin/authority-manager
 * as soon as they were confirmed to be one; this middleware's old gate
 * required session.admin===true, which resolveIdentity() never granted a
 * plain authority_manager (deliberately — see the scope comment in
 * firebase-admin.ts, and the AUTHORITY_MANAGER_ALLOWED_PATHS comment
 * above). So every visit bounced to /admin/login, whose own client-side
 * check sent them right back to authority-portal/login — forever.
 *
 * The fix adds a narrower `scope: 'authority_manager'` session claim,
 * server-computed from authorities.managerIds, that this function honors
 * for the SAME path allowlist authority managers already have client-side
 * — never widening `admin` itself.
 */
describe('decideAdminGateAction', () => {
  const root: GateSessionInfo = { admin: true };
  const superAdmin: GateSessionInfo = { admin: true }; // same session shape at this layer — resolveIdentity already folds super_admin/system_admin into `admin`
  const authorityManager: GateSessionInfo = { admin: false, scope: 'authority_manager' };
  const anonymous: GateSessionInfo = { admin: false }; // resolveIdentity for an anonymous uid: no claims, no email, not in any managerIds
  const invalidCookieOrNoCookie: GateSessionInfo | null = null; // verifyAdminSession returns null for both a missing cookie and one that fails signature/issuer/audience verification

  it('root admin — allowed anywhere', () => {
    expect(decideAdminGateAction('/admin/users', root)).toEqual({ action: 'allow' });
  });

  it('super_admin/system_admin — allowed anywhere (resolveIdentity already grants admin:true)', () => {
    expect(decideAdminGateAction('/admin/system-settings', superAdmin)).toEqual({ action: 'allow' });
  });

  it('authority manager on an allowed path — allowed', () => {
    expect(decideAdminGateAction('/admin/authority-manager', authorityManager)).toEqual({ action: 'allow' });
    expect(decideAdminGateAction('/admin/authority/team', authorityManager)).toEqual({ action: 'allow' });
  });

  it('authority manager on a forbidden path — redirected to their own portal, NOT to login (session stays valid)', () => {
    expect(decideAdminGateAction('/admin/users', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager' });
  });

  it('authority manager cannot reach /admin/authority/users — deliberately excluded (super_admin/system_admin-only since 22.09.2026)', () => {
    expect(decideAdminGateAction('/admin/authority/users', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager' });
  });

  it('anonymous session (admin:false, no scope) — redirected to login', () => {
    expect(decideAdminGateAction('/admin/authority-manager', anonymous)).toEqual({ action: 'redirect', to: '/admin/login' });
  });

  it('no cookie at all — redirected to login', () => {
    expect(decideAdminGateAction('/admin/authority-manager', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/admin/login' });
  });

  it('invalid/expired cookie (verifyAdminSession already returned null) — redirected to login, same as no cookie', () => {
    expect(decideAdminGateAction('/admin/dashboard', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/admin/login' });
  });
});
