import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  verifyAdminSession,
} from '@/lib/admin-session';

// ─────────────────────────────────────────────────────────────────────────
// Capacitor CORS — allowed origins for the native iOS / Android shell
//
// When the app is built for TestFlight / production (server.url commented
// out in capacitor.config.ts), the WebView loads from the local bundle and
// its Origin header is:
//   • iOS   → capacitor://localhost
//   • Android (androidScheme: 'https') → https://localhost
//
// Both must be whitelisted so WKWebView / Android WebView allow the
// cross-origin fetch to https://out-run-app.vercel.app/api/*.
// ─────────────────────────────────────────────────────────────────────────
const CAPACITOR_ORIGINS = new Set([
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Firebase-AppCheck, X-Requested-With',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
};

/**
 * Middleware — Domain routing AND server-side admin gating.
 *
 * Server-side admin gating (Ashkelon Req. 17.1)
 * ─────────────────────────────────────────────
 * The admin UI bundles contain references to administrative APIs and
 * privileged components. Previously they were served to anyone who
 * browsed to /admin/login or /admin/* and the role check happened
 * client-side after hydration — meaning a determined attacker could
 * already see the admin source code.
 *
 * This middleware runs on the Edge BEFORE any HTML is shipped:
 *   • For every /admin/* path other than the unauthenticated entry
 *     points (/admin/login, /admin/auth/callback, /admin/pending-approval),
 *     we read the `out_admin_session` cookie.
 *   • The cookie is an HMAC-signed JWT minted by /api/auth/session
 *     after the Admin SDK verified the user's Firebase ID token.
 *   • If the cookie is missing OR not admin → 302 to /admin/login.
 *
 * This is a defence-in-depth layer ON TOP of:
 *   • Firestore Security Rules (the real source of truth for data),
 *   • the client-side guard in src/app/admin/layout.tsx,
 *   • Cloud Function `enforceAppCheck` + role checks.
 */

// Paths that an unauthenticated user MUST be able to reach — otherwise
// they could never sign in. These short-circuit the admin gate.
const ADMIN_PUBLIC_PATHS = [
  '/admin/login',
  '/admin/auth/callback',
  '/admin/auth',
  '/admin/pending-approval',
  '/admin/authority-login',
];

function isAdminPublic(pathname: string): boolean {
  return ADMIN_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function isLocalDevDomain(domain: string): boolean {
  return domain === 'localhost' || domain.includes('127.0.0.1') || domain.includes('192.168');
}

/**
 * SPEC-02 SEC-12: decides whether a /admin/* PAGE request needs the
 * signed-session cookie check. Extracted as a pure function (domain +
 * pathname in, boolean out) so the fix — gate on `!isLocalDev` instead
 * of `isAdminDomain` — is unit-testable without constructing a real
 * NextRequest/Edge-runtime context.
 */
export function shouldGateAdminRequest(pathname: string, domain: string): boolean {
  return pathname.startsWith('/admin') && !isAdminPublic(pathname) && !isLocalDevDomain(domain);
}

// ──────────────────────────────────────────────────────────────────────────
// Authority-scoped gate (00-MASTER-PLAN.md §13.10, extended §13.16)
//
// A plain authority_manager was never covered by `admin: true` — that flag
// stays `admin`/`system_admin`/root-only on purpose (it also gates routes
// that return cross-tenant PII with no per-authority scoping, e.g.
// /api/admin/photo-release/[submissionId] — granting it broadly would open
// every OTHER city's data too, not just the manager's own). Instead
// resolveIdentity() (firebase-admin.ts) computes a separate, narrower
// `scope` claim, server-side, from authorities.managerIds (authority_manager)
// or resolveUnitPermissionScope (tenant_owner/unit_admin, 24.09.2026) — and
// this middleware allows THAT claim through for only the same path
// allowlist admin/layout.tsx already enforces client-side for the identical
// roles (kept in sync manually — no shared import is possible from Edge
// middleware into a 'use client' page).
// `/admin/authority/users` is deliberately absent (super_admin/
// system_admin-only since 22.09.2026) — this list must never add it back
// without also updating layout.tsx's copy.
// Rebuilt 30.09.2026 (00-MASTER-PLAN.md §13.58) — this list used to be 21
// paths, built by hand over time rather than derived from anything, and
// turned out to admit real gaps: /admin/parks, /admin/locations,
// /admin/organizations, /admin/admin-directory, /admin/access-codes,
// /admin/authority/units, /admin/authority/grades were all reachable for
// a plain municipal authority_manager despite none of them being linked
// from that role's own sidebar — the same "broadest list that happens to
// work" pattern §26 already found dangerous for tenant_owner/unit_admin
// (see below), just not yet applied to authority_manager itself. Two of
// those (organizations, the bare units list) are reachable-but-currently-
// empty, not reachable-and-safe — axioms.md §26, accidental protection is
// not protection.
//
// Rebuilt the same way as TENANT_OWNER_ALLOWED_PATHS: default-deny,
// derived ONLY from SIDEBAR_CONFIGS.municipal (sidebarConfigs.ts) — the
// authority_manager role's real, current sidebar.
//
// Two paths kept despite not being literal sidebar entries:
//   - /admin/authority/neighborhoods — /admin/authority-manager's own
//     AnalyticsDashboard links each row of its neighborhood breakdown
//     (server-scoped to the caller's own authorityId) to
//     /admin/authority/neighborhoods/[id] (NeighborhoodBreakdown.tsx:156)
//     — removing it breaks a real, currently-used feature, not just an
//     unused door. This allowlist entry does NOT by itself fix
//     neighborhoods/[id]'s own unvalidated-neighborhoodId bug — that page
//     still trusts the URL param with no ownership check; tracked
//     separately (00-MASTER-PLAN.md §13.58), fixed alongside this.
//   - /admin/authority/events — a pure client-side redirect into
//     /admin/authority/community?tab=rsvp (events/page.tsx), zero data
//     access of its own; removing it breaks a bookmarkable link without
//     closing anything.
//
// Removed (9), none linked from SIDEBAR_CONFIGS.municipal: /admin/parks,
// /admin/locations (municipal's own sidebar links /admin/authority/locations
// instead — already correctly scoped, this was just a redundant extra
// door), /admin/authority/units + /admin/authority/grades (military_unit/
// school sidebars only), /admin/access-codes (same — access-codes/page.tsx's
// own role check admits authority_manager, but no sidebar link ever sends
// one there; flagged as likely-unwired intent, not fixed here),
// /admin/admin-directory + /admin/organizations (wrong domain entirely —
// see axioms.md §26), /admin/insights, /admin/statistics (not linked).
const AUTHORITY_MANAGER_ALLOWED_PATHS = [
  '/admin/dashboard',
  '/admin/authority-manager',
  '/admin/heatmap',
  '/admin/authority/locations',
  '/admin/authority/routes',
  '/admin/approval-center',
  '/admin/authority/community',
  '/admin/authority/reports',
  '/admin/authority/team',
  '/admin/authority/neighborhoods',
  '/admin/authority/events',
];

// tenant_owner's real footprint = the union of SIDEBAR_CONFIGS.military_unit
// and SIDEBAR_CONFIGS.school (sidebarConfigs.ts) — the only two verticals
// the tenant_owner role covers. /admin/authority/users is deliberately
// excluded even though both configs still link to it — that's a pre-existing
// stale link (super_admin/system_admin-only since 22.09.2026, see the
// comment on AUTHORITY_MANAGER_ALLOWED_PATHS above), not fixed here.
// /admin/parks, /admin/locations, /admin/organizations are deliberately
// excluded too — neither sidebar links to them, same root-only/
// vertical-admin-only violation class as unit_admin's case.
//
// 01.10.2026 (00-MASTER-PLAN.md §13.61) — /admin/heatmap REMOVED. David's
// hard constraint: an officer never reaches a map, a route, or a location
// point, period — a brigade-level heatmap is operational information, not
// a fitness metric. Confirmed safe to remove from this SHARED list:
// SIDEBAR_CONFIGS.school never linked to heatmap at all (only
// military_unit did), so this costs school nothing.
//
// /admin/authority/locations and /admin/access-codes are NOT removed here
// despite the same hard constraint applying to military — this list is
// shared with school's tenant_owner, whose own sidebar legitimately links
// to both. This session (GateSessionInfo) carries scope only, not which
// vertical the tenant_owner belongs to — there is no way to apply the
// military-only removal to this one shared array without ALSO blocking a
// real school tenant_owner. A real per-vertical split needs the session
// to carry tenantType, which is a bigger change than this round's menu/
// label fixes. Flagged for David's decision — not fixed here. The
// military SIDEBAR no longer links to either (sidebarConfigs.ts,
// §13.61), so a military officer won't find them through normal
// navigation; a typed URL still reaches them until this is resolved.
const TENANT_OWNER_ALLOWED_PATHS = [
  '/admin/dashboard',
  '/admin/authority-manager',
  '/admin/authority/readiness',
  '/admin/authority/units',
  '/admin/authority/grades',
  '/admin/authority/locations',
  '/admin/authority/team',
  '/admin/access-codes',
];

// unit_admin's real footprint is exactly ONE page, always with a real
// unitId: /admin/authority/units/[unitId] — decideUnitAdminRedirect's own
// single destination (postAcceptRedirect.ts), and the minimal sidebar's
// only link (admin/layout.tsx's isUnitAdminOnly branch). A regex (not a
// prefix string) is required specifically so it does NOT match the bare
// /admin/authority/units list page — that page is exactly the brigade-wide
// delete-all/import/create tool David's live test caught a unit_admin
// reaching (a `startsWith('/admin/authority/units')` prefix check, which
// AUTHORITY_MANAGER_ALLOWED_PATHS still correctly uses for authority_manager/
// tenant_owner, cannot make that distinction).
const UNIT_ADMIN_PATH_PATTERN = /^\/admin\/authority\/units\/[^/]+/;

export interface GateSessionInfo {
  admin: boolean;
  scope?: 'authority_manager' | 'tenant_owner' | 'unit_admin';
}

export type AdminGateAction =
  | { action: 'allow' }
  | { action: 'redirect'; to: string; preserveNext: boolean };

/**
 * Pure decision for an already-gated /admin/* request: given the decoded
 * session (or null — missing cookie, invalid/expired cookie, and "no
 * session" all collapse to the same null input here; verifyAdminSession
 * itself is what distinguishes them, before this function ever runs), what
 * should happen?
 *
 *   session.admin === true           → allow (root / super_admin / etc.,
 *                                       unchanged from before this fix)
 *   scope === 'authority_manager'     → AUTHORITY_MANAGER_ALLOWED_PATHS
 *   scope === 'tenant_owner'          → TENANT_OWNER_ALLOWED_PATHS
 *   scope === 'unit_admin'            → UNIT_ADMIN_PATH_PATTERN (regex, not
 *                                       prefix — see its own comment)
 *     path in the matching scope's
 *     own list/pattern                → allow
 *     path NOT in it                  → redirect to their own portal,
 *                                       preserveNext: false ALWAYS. This is
 *                                       an intentional, authorized-session
 *                                       block — David's live-test trap
 *                                       (29.09.2026): a unit_admin blocked
 *                                       from /admin/parks got bounced to
 *                                       /authority-portal/login?next=/admin/parks
 *                                       (their own valid destination
 *                                       redirect target IS a login door —
 *                                       see below), re-authenticated, tried
 *                                       the preserved next= again, got
 *                                       blocked again, and decideLoopBreak
 *                                       mistook the repeat for a real
 *                                       identification failure. `next` may
 *                                       only ever carry a path the caller is
 *                                       ALREADY authorized for — a blocked
 *                                       path in `next` is a loop generator,
 *                                       not navigation. authority_manager/
 *                                       tenant_owner redirect to
 *                                       /admin/authority-manager (in both
 *                                       their own lists, so never blocked
 *                                       again there regardless); unit_admin
 *                                       specifically redirects to
 *                                       /authority-portal/login instead —
 *                                       /admin/authority-manager is NOT in
 *                                       their narrow pattern. Their own login
 *                                       door re-resolves role + destination
 *                                       via decideUnitAdminRedirect and shows
 *                                       an explicit "no access" screen with a
 *                                       link to it — never auto-navigates
 *                                       there (see authority-portal/login/
 *                                       page.tsx's own handling of this exact
 *                                       redirect target's ?blocked=1 flag).
 *   no session at all (missing/
 *   invalid/expired cookie)
 *     + pathname in ANY scoped role's  → redirect to /authority-portal/login,
 *       own allowlist/pattern            preserveNext: true — NOT /admin/login
 *       (authority_manager OR            (login-entry-points unification,
 *       tenant_owner OR unit_admin)      David's hard rule #1, 00-MASTER-
 *                                        PLAN.md — confirmed live 28.09.2026:
 *                                        an officer whose session expired
 *                                        mid-navigation on an authority-
 *                                        scoped path was bounced to David's
 *                                        own super-admin portal and shown
 *                                        "email not found in the system"
 *                                        there). This IS the legitimate
 *                                        "resume where you were" case `next`
 *                                        exists for: there's no session yet
 *                                        to know WHICH scope this caller will
 *                                        turn out to have, so the pathname is
 *                                        checked against the UNION of all
 *                                        three scoped allowlists/pattern —
 *                                        not just authority_manager's. Before
 *                                        30.09.2026's allowlist rebuild,
 *                                        authority_manager's list happened to
 *                                        be a superset of tenant_owner's and
 *                                        unit_admin's, so checking it alone
 *                                        was sufficient — an accident of the
 *                                        old, overly broad list, not a
 *                                        designed invariant. Once that list
 *                                        was narrowed to authority_manager's
 *                                        own real sidebar, it stopped
 *                                        covering tenant_owner-only paths
 *                                        (e.g. /admin/authority/readiness) —
 *                                        an expired-session tenant_owner on
 *                                        one of those would have silently
 *                                        regressed into the exact bug hard
 *                                        rule #1 fixed. isAnyScopedPath()
 *                                        below is the explicit fix: never
 *                                        rely on one list happening to be
 *                                        broadest again.
 *     + pathname NOT in any of them   → redirect to /admin/login,
 *                                       preserveNext: true (unchanged)
 */

/**
 * True if `pathname` is a legitimate destination for ANY scoped role —
 * used ONLY to pick which login door a session-less visitor sees, never to
 * decide what an authenticated session may reach (each scope's own branch
 * in decideAdminGateAction below still does that with its own list/pattern
 * alone). See the "no session at all" case in decideAdminGateAction's own
 * doc comment above for why this must be a union, not any single scope's
 * list.
 */
function isAnyScopedPath(pathname: string): boolean {
  return (
    AUTHORITY_MANAGER_ALLOWED_PATHS.some((p) => pathname.startsWith(p)) ||
    TENANT_OWNER_ALLOWED_PATHS.some((p) => pathname.startsWith(p)) ||
    UNIT_ADMIN_PATH_PATTERN.test(pathname)
  );
}

export function decideAdminGateAction(
  pathname: string,
  session: GateSessionInfo | null,
): AdminGateAction {
  if (session?.admin === true) {
    return { action: 'allow' };
  }
  if (session?.scope === 'authority_manager') {
    const isAllowed = AUTHORITY_MANAGER_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
    return isAllowed ? { action: 'allow' } : { action: 'redirect', to: '/admin/authority-manager', preserveNext: false };
  }
  if (session?.scope === 'tenant_owner') {
    const isAllowed = TENANT_OWNER_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
    return isAllowed ? { action: 'allow' } : { action: 'redirect', to: '/admin/authority-manager', preserveNext: false };
  }
  if (session?.scope === 'unit_admin') {
    return UNIT_ADMIN_PATH_PATTERN.test(pathname)
      ? { action: 'allow' }
      : { action: 'redirect', to: '/authority-portal/login', preserveNext: false };
  }
  if (isAnyScopedPath(pathname)) {
    return { action: 'redirect', to: '/authority-portal/login', preserveNext: true };
  }
  return { action: 'redirect', to: '/admin/login', preserveNext: true };
}

/**
 * Pure, extracted so the exact sequence David's live test caught
 * (29.09.2026) is directly unit-testable: blocked path → out-of-scope
 * decision → the redirect URL never carries the blocked destination as
 * `next=` (the loop generator) → `blocked=1` instead, only for the one
 * redirect target (unit_admin's) that happens to be login-shaped despite
 * being a valid-session block.
 */
export function buildGateRedirectParams(
  decision: { to: string; preserveNext: boolean },
  pathname: string,
): { next: string | null; blocked: boolean } {
  if (decision.preserveNext) {
    return { next: pathname, blocked: false };
  }
  if (decision.to === '/authority-portal/login') {
    return { next: null, blocked: true };
  }
  return { next: null, blocked: false };
}

// ──────────────────────────────────────────────────────────────────────────
// Public guest-accessible routes.
//
// These are standalone, unauthenticated pages (e.g. the parent-facing Photo
// Release / consent forms shared via WhatsApp). They live OUTSIDE the
// logged-in app dashboard and MUST be reachable without any auth cookie or
// redirect to a login screen. We short-circuit the middleware for any path
// under `/public/` so no future admin/domain gating can accidentally block a
// parent from opening the link.
// ──────────────────────────────────────────────────────────────────────────
const PUBLIC_PATHS = [
  '/public/forms/photo-release',
  '/public',
];

function isPublicGuestPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Capacitor CORS ──────────────────────────────────────────────────────
  // Handle cross-origin requests from the native Capacitor shell to /api/*.
  // Must run before any redirect or auth logic so preflight OPTIONS requests
  // are never accidentally redirected (a redirect on OPTIONS causes the real
  // request to be blocked by the browser).
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') ?? '';
    const isCapacitorOrigin = CAPACITOR_ORIGINS.has(origin);

    // Respond to preflight immediately — no further middleware logic needed.
    if (request.method === 'OPTIONS' && isCapacitorOrigin) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          ...CORS_HEADERS,
        },
      });
    }

    // Attach CORS header to actual requests from Capacitor and let them pass.
    if (isCapacitorOrigin) {
      const response = NextResponse.next();
      response.headers.set('Access-Control-Allow-Origin', origin);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => response.headers.set(k, v));
      return response;
    }

    // Non-Capacitor origin — pass through unchanged (same-origin Vercel requests).
    return NextResponse.next();
  }
  // ───────────────────────────────────────────────────────────────────────

  const hostname = request.headers.get('host') || '';
  const domain = hostname.split(':')[0].toLowerCase();

  // Public guest forms (Photo Release, etc.) bypass ALL gating — these links
  // are opened by unauthenticated parents and must never redirect to login.
  if (isPublicGuestPath(pathname)) {
    return NextResponse.next();
  }

  const isAdminDomain = domain === 'admin.outrun.co.il' || domain === 'admin.outrun.local';
  const isAuthorityDomain = domain === 'portal.outrun.co.il' || domain === 'portal.outrun.local';

  // ──────────────────────────────────────────────────────────────
  // 1. Domain-based routing (unchanged from previous middleware).
  // ──────────────────────────────────────────────────────────────
  if (isAdminDomain) {
    if (pathname.startsWith('/authority-portal')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    if (pathname.startsWith('/admin/authority-manager')) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  if (isAuthorityDomain) {
    if (pathname.startsWith('/admin/login') || pathname.startsWith('/admin/system-settings')) {
      return NextResponse.redirect(new URL('/authority-portal/login', request.url));
    }
    if (pathname === '/admin' || pathname === '/admin/') {
      return NextResponse.redirect(new URL('/admin/authority-manager', request.url));
    }
    if (pathname.startsWith('/admin')) {
      const allowedPaths = [
        '/admin/authority-manager',
        '/admin/dashboard',
        '/admin/authority/locations',
        '/admin/authority/routes',
        '/admin/authority/reports',
        '/admin/authority/team',
        '/admin/authority/community',
        '/admin/authority/events',
        '/admin/authority/users',
        '/admin/authority/neighborhoods',
        '/admin/authority/readiness',
        '/admin/authority/units',
        '/admin/authority/grades',
        '/admin/approval-center',
        '/admin/parks',
        '/admin/locations',
        '/admin/heatmap',
        '/admin/insights',
        '/admin/statistics',
        '/admin/auth/callback',
        '/admin/authority-login',
        '/admin/pending-approval',
        '/admin/access-codes',
        '/admin/admin-directory',
        '/admin/organizations',
        '/admin/users',
      ];
      const isAllowed = allowedPaths.some((path) => pathname.startsWith(path));
      if (!isAllowed) {
        return NextResponse.redirect(new URL('/admin/authority-manager', request.url));
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 2. Server-side admin gating — runs on EVERY /admin/* request
  //    on every domain except local dev.
  //
  //    The authority-portal domain is intentionally exempted here
  //    because authority managers are gated by their own portal
  //    layout + Firestore rules; introducing the admin cookie
  //    requirement there would break their flow.
  // ──────────────────────────────────────────────────────────────
  // SPEC-02 SEC-12: this used to be `isAdminDomain` — the gate only ever
  // fired on admin.outrun.co.il/admin.outrun.local. /admin/* served on
  // ANY OTHER domain (the Vercel domain the native app actually loads
  // via server.url, or any preview/staging deploy) shipped its full
  // HTML/JS bundle to anyone with zero server-side check — this
  // middleware's whole stated purpose (its own docstring above) was to
  // prevent exactly that. Now gates on `!isLocalDev` instead: every real
  // domain gets the cookie check, only local dev is exempted (Admin SDK
  // credentials aren't configured there — see the comment below).
  //
  // Verified safe for the public, pre-auth API routes this same spec
  // moved out from under /api/admin/* (commit a254426a): this check only
  // ever applies to `/admin/*` PAGE paths. Every /api/* request —
  // including /api/admin/* and /api/auth/admin-invite/* — returns early
  // at the Capacitor-CORS block above (line ~124, `return
  // NextResponse.next()`), long before this code runs, regardless of
  // domain. Widening this condition cannot affect them.
  //
  // On localhost the Firebase Admin SDK is typically not configured (no
  // FIREBASE_SERVICE_ACCOUNT_KEY), so /api/auth/session returns 401 and the
  // session cookie is never minted — causing a middleware redirect loop.
  // Client-side auth in the layout is sufficient for local development.
  const shouldGateAdmin = shouldGateAdminRequest(pathname, domain);

  if (shouldGateAdmin) {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = cookie ? await verifyAdminSession(cookie) : null;
    const decision = decideAdminGateAction(pathname, session);

    if (decision.action === 'redirect') {
      const url = new URL(decision.to, request.url);
      const params = buildGateRedirectParams(decision, pathname);
      if (params.next) url.searchParams.set('next', params.next);
      if (params.blocked) url.searchParams.set('blocked', '1');
      const res = NextResponse.redirect(url);
      // Only wipe the cookie on the preserveNext (no valid session at all,
      // or a session with neither claim) branches. Every out-of-scope
      // block (preserveNext: false) has a perfectly valid session that
      // just tried a path outside it — clearing it would force a
      // needless re-login for no reason.
      if (cookie && decision.preserveNext) {
        res.cookies.delete(SESSION_COOKIE_NAME);
      }
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public static assets (svg, png, jpg, etc.)
     *
     * NOTE: /api/* is intentionally included (removed from the exclusion list)
     * so the Capacitor CORS branch above can handle preflight OPTIONS requests
     * and attach Access-Control-Allow-Origin headers for native builds.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|mp3|otf|woff|woff2)$).*)',
  ],
};
