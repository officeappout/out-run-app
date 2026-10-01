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

    it('by contrast, a genuine "no session yet" bounce on an authority-scoped path DOES preserve next= — this is the legitimate resume case, not a block', () => {
        const decision = decideAdminGateAction('/admin/authority/team', invalidCookieOrNoCookie);
        expect(decision).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: true });
        if (decision.action !== 'redirect') throw new Error('expected a redirect decision');
        const params = buildGateRedirectParams(decision, '/admin/authority/team');
        expect(params.next).toBe('/admin/authority/team');
        expect(params.blocked).toBe(false);
      });

      // 30.09.2026 allowlist rebuild (00-MASTER-PLAN.md §13.58): /admin/parks
      // is root-only now — no scoped role has ANY legitimate reason to land
      // there, so a session-less visitor gets the ROOT login door, not the
      // officer one. Before the rebuild this asserted the opposite
      // (/authority-portal/login), correct only because the old, overly
      // broad authority_manager list still happened to include /admin/parks
      // — exactly the "accidental correctness" pattern axioms.md §26 warns
      // about, just for routing rather than data exposure this time.
      it('a session-less visit to a root-only path (e.g. /admin/parks) goes to /admin/login, not /authority-portal/login — no scoped role has it any more', () => {
        const decision = decideAdminGateAction('/admin/parks', invalidCookieOrNoCookie);
        expect(decision).toEqual({ action: 'redirect', to: '/admin/login', preserveNext: true });
      });

      // The regression this rebuild could have silently caused: narrowing
      // AUTHORITY_MANAGER_ALLOWED_PATHS below TENANT_OWNER_ALLOWED_PATHS
      // means checking authority_manager's list alone is no longer enough
      // to find every scoped-role destination — isAnyScopedPath() in
      // middleware.ts is the explicit fix. /admin/authority/readiness is
      // tenant_owner-only (not in the new, narrower authority_manager
      // list) — a tenant_owner whose session expires mid-navigation there
      // must still land on /authority-portal/login, per hard rule #1.
      it('a session-less visit to a TENANT_OWNER-only path (not in the narrower authority_manager list) still resolves to /authority-portal/login — proves the union fix, not an accident of one list being broadest', () => {
        const decision = decideAdminGateAction('/admin/authority/readiness', invalidCookieOrNoCookie);
        expect(decision).toEqual({ action: 'redirect', to: '/authority-portal/login', preserveNext: true });
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
      expect(decideAdminGateAction('/admin/access-codes', tenantOwner)).toEqual({ action: 'allow' });
    });

    // 01.10.2026 (00-MASTER-PLAN.md SS13.61) — David's live-test finding:
    // a military tenant_owner reached /admin/heatmap and saw a live map.
    // Hard constraint, not a product preference: an officer sees
    // aggregate fitness data only, never a map, a route, or a location
    // point. Removed from this list (safe for school's tenant_owner too
    // -- school's own sidebar never linked to heatmap).
    it('blocked on /admin/heatmap -- removed, an officer never reaches a map', () => {
      expect(decideAdminGateAction('/admin/heatmap', tenantOwner)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
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

  // 30.09.2026 — authority_manager's own allowlist rebuilt (00-MASTER-
  // PLAN.md §13.58), same default-deny-derived-from-the-real-sidebar
  // method already applied to tenant_owner/unit_admin. Derived from
  // SIDEBAR_CONFIGS.municipal (sidebarConfigs.ts) plus two explicitly
  // justified additions (neighborhoods, events — see the allowlist's own
  // comment in middleware.ts). David's live question — can a city manager
  // reach another city's screen, or the military/org side, by typing an
  // address? — is what triggered this: /admin/parks, /admin/locations,
  // /admin/organizations, /admin/admin-directory, /admin/access-codes,
  // /admin/authority/units, /admin/authority/grades were all reachable
  // before this, none of them linked from this role's own sidebar.
  describe('authority_manager — rebuilt allowlist, derived from SIDEBAR_CONFIGS.municipal', () => {
    it('allowed on every real sidebar destination', () => {
      expect(decideAdminGateAction('/admin/dashboard', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority-manager', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/heatmap', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/locations', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/routes', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/approval-center', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/community', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/reports', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/team', authorityManager)).toEqual({ action: 'allow' });
    });

    it('allowed on /admin/authority/neighborhoods — not a literal sidebar entry, but real, nested navigation from the analytics dashboard (NeighborhoodBreakdown.tsx), kept deliberately', () => {
      expect(decideAdminGateAction('/admin/authority/neighborhoods', authorityManager)).toEqual({ action: 'allow' });
      expect(decideAdminGateAction('/admin/authority/neighborhoods/some-id', authorityManager)).toEqual({ action: 'allow' });
    });

    it('allowed on /admin/authority/events — pure client redirect into an already-allowed page, kept so the bookmarkable link doesn\'t break', () => {
      expect(decideAdminGateAction('/admin/authority/events', authorityManager)).toEqual({ action: 'allow' });
    });

    it('blocked on /admin/parks, /admin/locations, /admin/organizations, /admin/admin-directory — the exact gaps David\'s question found; municipal\'s own sidebar never linked to any of these', () => {
      expect(decideAdminGateAction('/admin/parks', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/locations', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/organizations', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/admin-directory', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
    });

    it('blocked on /admin/authority/units and /admin/authority/grades — military_unit/school sidebars only, never linked from municipal', () => {
      expect(decideAdminGateAction('/admin/authority/units', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/authority/units/9307', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/authority/grades', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
    });

    it('blocked on /admin/access-codes, /admin/insights, /admin/statistics — not linked from municipal\'s sidebar, even though access-codes/page.tsx\'s own role check admits authority_manager', () => {
      expect(decideAdminGateAction('/admin/access-codes', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/insights', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
      expect(decideAdminGateAction('/admin/statistics', authorityManager)).toEqual({ action: 'redirect', to: '/admin/authority-manager', preserveNext: false });
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

  // 30.09.2026 — David's explicit ask: confirm in code that a brand-new
  // path, never added to ANY scope's list, is blocked by DEFAULT — not
  // "happens to be blocked because someone remembered to list it
  // elsewhere." A path invented here on the spot, that exists nowhere in
  // middleware.ts, proves this: every scoped session's own `.some(p =>
  // pathname.startsWith(p))` check structurally returns false for
  // anything unlisted — there is no branch anywhere in
  // decideAdminGateAction that defaults to `allow` when a scope's own
  // list doesn't recognize the path. A future path someone adds a page
  // for in a month, without also adding it here, inherits this same
  // default: blocked, not exposed.
  describe('a never-configured future path defaults to blocked, for every scope — proof, not assumption', () => {
    const neverConfiguredPath = '/admin/some-future-feature-nobody-has-built-yet';

    it('unit_admin — blocked (their pattern requires /admin/authority/units/[id] specifically)', () => {
      expect(decideAdminGateAction(neverConfiguredPath, unitAdmin).action).toBe('redirect');
    });

    it('tenant_owner — blocked (not in their explicit list)', () => {
      expect(decideAdminGateAction(neverConfiguredPath, tenantOwner).action).toBe('redirect');
    });

    it('authority_manager — blocked (not in their explicit list either)', () => {
      expect(decideAdminGateAction(neverConfiguredPath, authorityManager).action).toBe('redirect');
    });

    it('anonymous / no session — blocked, straight to /admin/login (not even a login-door special case, since it matches no allowlist at all)', () => {
      expect(decideAdminGateAction(neverConfiguredPath, anonymous)).toEqual({ action: 'redirect', to: '/admin/login', preserveNext: true });
      expect(decideAdminGateAction(neverConfiguredPath, invalidCookieOrNoCookie)).toEqual({ action: 'redirect', to: '/admin/login', preserveNext: true });
    });

    it('only session.admin===true (root/super_admin/system_admin) reaches it — the one intentional "allow anywhere" case, unrelated to any scope list', () => {
      expect(decideAdminGateAction(neverConfiguredPath, root)).toEqual({ action: 'allow' });
    });
  });
});
