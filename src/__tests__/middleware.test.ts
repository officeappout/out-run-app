import { describe, it, expect } from 'vitest';
import { shouldGateAdminRequest } from '../middleware';

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
