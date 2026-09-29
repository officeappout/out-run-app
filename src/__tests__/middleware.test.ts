import { describe, it, expect } from 'vitest';
import { shouldGateAdminRequest, decideAdminGateAction, buildGateRedirectParams, type GateSessionInfo } from '../middleware';

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
    expect(decideAdminGateAction('/admin/users', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
  });

  it('authority manager cannot reach /admin/authority/users — deliberately excluded (super_admin/system_admin-only since 22.09.2026)', () => {
    expect(decideAdminGateAction('/admin/authority/users', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
  });

  it('anonymous session (admin:false, no scope) on an authority-scoped path — redirected to the officer/authority-manager door, NOT /admin/login (login-entry-points unification, 28.09.2026 — see decideAdminGateAction\'s own doc comment)', () => {
    expect(decideAdminGateAction('/admin/authority-manager', anonymous)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: true });
  });

  it('anonymous session on a NON-authority path — still redirected to /admin/login (unchanged)', () => {
    expect(decideAdminGateAction('/admin/roadmap', anonymous)).toEqual({ action: 'redirect', to: '/admin/login', preserveNext: true });
  });

  it('no cookie at all, authority-scoped path — redirected to /authority-portal/login, not /admin/login (the exact production case: an officer\'s session expires mid-navigation on their own unit page)', () => {
    expect(decideAdminGateAction('/admin/authority-manager', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: true });
    expect(decideAdminGateAction('/admin/authority/units/9307', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: true });
  });

  it('invalid/expired cookie (verifyAdminSession already returned null), authority-scoped path — same fix applies, same as no cookie', () => {
    expect(decideAdminGateAction('/admin/authority/team', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: true });
  });

  it('no session at all on a NON-authority path (e.g. root-only screens) — still redirected to /admin/login, the allowlist is unchanged', () => {
    expect(decideAdminGateAction('/admin/dashboard', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: true }); // /admin/dashboard IS in AUTHORITY_MANAGER_ALLOWED_PATHS
    expect(decideAdminGateAction('/admin/roadmap', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/admin/login', preserveNext: true });
    expect(decideAdminGateAction('/admin', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/admin/login', preserveNext: true });
    expect(decideAdminGateAction('/admin/exercises', invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/admin/login', preserveNext: true });
  });

  // 29.09.2026 — David's live-test findings 1-2: unit_admin reached
  // /admin/parks, /admin/locations, /admin/organizations, and the BARE
  // /admin/authority/units list (delete-all/bulk-import/create) — all
  // through the SAME shared allowlist authority_manager/tenant_owner used,
  // a documented "Stage 4" simplification that turned out to be a real
  // vulnerability. Fixed with default-deny per scope: each scope now has
  // its OWN explicit allowlist/pattern, derived from what it actually needs.
  const unitAdmin: GateSessionInfo = { admin: false, scope: 'unit_admin' };
  const tenantOwner: GateSessionInfo = { admin: false, scope: 'tenant_owner' };

  describe('unit_admin — narrow regex, not the shared list', () => {
    it('allowed on their own real destination (a unit id present)', () => {
      expect(decideAdminGateAction('/admin/authority/units/9307', unitAdmin)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/units/9307/sub-page', unitAdmin)).toEqual({ action: 'allow' });
    });

    it('blocked on the BARE units list — the exact page David\'s live test caught (delete-all/bulk-import/create battalion)', () => {
      expect(decideAdminGateAction('/admin/authority/units', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
      expect(decideAdminGateAction('/admin/authority/units/', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
    });

    it('blocked on /admin/parks and /admin/locations — root-only park/route mapping, unscoped system-wide data', () => {
      expect(decideAdminGateAction('/admin/parks', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
      expect(decideAdminGateAction('/admin/parks/new', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
      expect(decideAdminGateAction('/admin/locations', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
      expect(decideAdminGateAction('/admin/locations/import/parks', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
    });

    it('blocked on /admin/organizations — that door is isVerticalAdmin\'s, not theirs', () => {
      expect(decideAdminGateAction('/admin/organizations', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
    });

    it('blocked on /admin/dashboard and /admin/authority-manager — not their scope\'s vertical', () => {
      expect(decideAdminGateAction('/admin/dashboard', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
      expect(decideAdminGateAction('/admin/authority-manager', unitAdmin)).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
    });

    it('the "not allowed" redirect target is their OWN login door, never /admin/authority-manager — that would fail the SAME gate again (loop risk)', () => {
      const result = decideAdminGateAction('/admin/parks', unitAdmin);
      expect(result).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
      // Prove no loop: /authority-portal/login isn't itself subject to this gate.
      expect(decideAdminGateAction('/admin/authority-manager', unitAdmin).action).toBe('redirect');
    });

    // 29.09.2026 — David's live-test trap, and the exact sequence he asked
    // for a regression test covering: blocked path → out-of-scope decision
    // → the redirect URL must never carry the blocked destination as
    // next= (that's what looped — the resumed navigation hit the SAME
    // block again, and decideLoopBreak mistook the repeat for a real
    // identification failure) → blocked=1 instead, so the login door
    // shows "no access" rather than auto-navigating.
    describe('the next= loop trap — blocked path never becomes next=', () => {
      it('decideAdminGateAction never sets preserveNext:true for an out-of-scope block', () => {
        const decision = decideAdminGateAction('/admin/parks', unitAdmin);
        expect(decision).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: false });
      });

      it('buildGateRedirectParams — the blocked destination is NEVER forwarded as next=, blocked=1 is set instead', () => {
        const decision = decideAdminGateAction('/admin/parks', unitAdmin);
        if (decision.action !== 'redirect') throw new Error('expected a redirect decision');
        const params = buildGateRedirectParams(decision, '/admin/parks');
        expect(params.next).toBeNull(); // the loop generator this closes
        expect(params.blocked).toBe(true);
      });

      it('by contrast, a genuine "no session yet" bounce on the same path DOES preserve next= — this is the legitimate resume case, not a block', () => {
        const decision = decideAdminGateAction('/admin/parks', invalidCookieOrNoCookie);
        expect(decision).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: true });
        if (decision.action !== 'redirect') throw new Error('expected a redirect decision');
        const params = buildGateRedirectParams(decision, '/admin/parks');
        expect(params.next).toBe('/admin/parks');
        expect(params.blocked).toBe(false);
      });

      it('an authority_manager/tenant_owner out-of-scope block also never sets blocked=1 — that flag is unit_admin-specific (their redirect target isn\'t login-shaped)', () => {
        const decision = decideAdminGateAction('/admin/parks', tenantOwner);
        if (decision.action !== 'redirect') throw new Error('expected a redirect decision');
        const params = buildGateRedirectParams(decision, '/admin/parks');
        expect(params.next).toBeNull();
        expect(params.blocked).toBe(false);
      });
    });
  });

  describe('tenant_owner — own narrow list, not the shared one', () => {
    it('allowed on their real sidebar destinations (union of SIDEBAR_CONFIGS.military_unit + .school)', () => {
      expect(decideAdminGateAction('/admin/dashboard', tenantOwner)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority-manager', tenantOwner)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/readiness', tenantOwner)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/units', tenantOwner)).toEqual({ action: 'allow' }); // legitimate for them — whole-org owner
      expect(decideAdminGateAction('/admin/authority/grades', tenantOwner)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/locations', tenantOwner)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/team', tenantOwner)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/heatmap', tenantOwner)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/access-codes', tenantOwner)).toEqual({ action: 'allow' });
    });

    it('blocked on /admin/parks, /admin/locations, /admin/organizations — same violation class as unit_admin, neither sidebar links there', () => {
      expect(decideAdminGateAction('/admin/parks', tenantOwner)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/locations', tenantOwner)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/organizations', tenantOwner)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
    });

    it('blocked on /admin/authority/users — the pre-existing super_admin/system_admin-only exclusion applies here too', () => {
      expect(decideAdminGateAction('/admin/authority/users', tenantOwner)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
    });
  });

  describe('authority_manager — unchanged (existing list, production-proven, deliberately not touched today)', () => {
    it('still allowed on /admin/parks, /admin/locations, /admin/organizations — flagged as a likely follow-up, not fixed here', () => {
      expect(decideAdminGateAction('/admin/parks', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/locations', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/organizations', authorityManager)).toEqual({ action: 'allow' });
    });

    it('still allowed on /admin/dashboard and the bare units list — no change from before', () => {
      expect(decideAdminGateAction('/admin/dashboard', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/units', authorityManager)).toEqual({ action: 'allow' });
    });
  });

  describe('buildGateRedirectParams — cookie-clear alignment', () => {
    it('preserveNext:true is exactly the "stale/invalid session" case where the cookie should be wiped (verified via the params it produces, the actual wipe happens in middleware() itself)', () => {
      const noSession = decideAdminGateAction('/admin/parks', invalidCookieOrNoCookie);
      if (noSession.action !== 'redirect') throw new Error('expected a redirect decision');
      expect(noSession.preserveNext).toBe(true);

      const outOfScope = decideAdminGateAction('/admin/parks', unitAdmin);
      if (outOfScope.action !== 'redirect') throw new Error('expected a redirect decision');
      expect(outOfScope.preserveNext).toBe(false);
    });
  });
});
