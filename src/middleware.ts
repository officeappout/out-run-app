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
const AUTHORITY_MANAGER_ALLOWED_PATHS = [
  '/admin/authority-manager',
  '/admin/dashboard',
  '/admin/authority/locations',
  '/admin/authority/routes',
  '/admin/authority/reports',
  '/admin/authority/team',
  '/admin/authority/community',
  '/admin/authority/events',
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
  '/admin/access-codes',
  '/admin/admin-directory',
  '/admin/organizations',
];

// §26 follow-up (29.09.2026, David's live-test findings 1-2) — "tenant_owner/
// unit_admin reuse the SAME list as authority_manager" turned out to be a
// real vulnerability, not a harmless simplification: a unit_admin (a single
// unit commander) reached /admin/parks, /admin/locations, /admin/organizations,
// and the BARE /admin/authority/units list — pages with unscoped
// system-wide reads and destructive UI (delete-all, bulk JSON import,
// bulk park remapping) that render with no internal role gate. The only
// thing that had been stopping a real write from most of them was each
// page's OWN incidental early-return failing safe for unrelated reasons
// (§26) — not a gate. David's explicit correction: park/route MAPPING is
// root-only, full stop — a local-manager scope reaching /admin/parks or
// /admin/locations (both fully unscoped — getAllParks(), not filtered by
// tenant) is a direct violation of that, not a theoretical gap.
//
// Fix: default-deny per scope. Every scope gets its OWN explicit allowlist,
// derived from what that scope's OWN sidebar actually links to (never the
// broadest list that happens to work) — not one shared list three roles
// happen to reuse. authority_manager's list above is UNCHANGED (existing,
// production-proven for real municipal managers) pending its own separate
// review — flagged, not touched here.

// tenant_owner's real footprint = the union of SIDEBAR_CONFIGS.military_unit
// and SIDEBAR_CONFIGS.school (sidebarConfigs.ts) — the only two verticals
// the tenant_owner role covers. /admin/authority/users is deliberately
// excluded even though both configs still link to it — that's a pre-existing
// stale link (super_admin/system_admin-only since 22.09.2026, see the
// comment on AUTHORITY_MANAGER_ALLOWED_PATHS above), not fixed here.
// /admin/parks, /admin/locations, /admin/organizations are deliberately
// excluded too — neither sidebar links to them, same root-only/
// vertical-admin-only violation class as unit_admin's case.
const TENANT_OWNER_ALLOWED_PATHS = [
  '/admin/dashboard',
  '/admin/authority-manager',
  '/admin/authority/readiness',
  '/admin/authority/units',
  '/admin/authority/grades',
  '/admin/authority/locations',
  '/admin/authority/team',
  '/admin/heatmap',
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
 *     + pathname in the (broadest,
 *       authority_manager) allowlist  → redirect to /authority-portal/login,
 *                                       preserveNext: true — NOT /admin/login
 *                                       (login-entry-points unification,
 *                                       David's hard rule #1, 00-MASTER-
 *                                       PLAN.md — confirmed live 28.09.2026:
 *                                       an officer whose session expired
 *                                       mid-navigation on an authority-
 *                                       scoped path was bounced to David's
 *                                       own super-admin portal and shown
 *                                       "email not found in the system"
 *                                       there). This IS the legitimate
 *                                       "resume where you were" case `next`
 *                                       exists for: there's no session yet
 *                                       to know whether the destination is
 *                                       even in-scope — if it turns out not
 *                                       to be, THIS SAME gate re-evaluates it
 *                                       after login and returns the
 *                                       preserveNext:false branch above,
 *                                       converging safely rather than
 *                                       looping. The PATHNAME alone is the
 *                                       only signal available here — the
 *                                       broadest (authority_manager's) list
 *                                       is checked since every other scope's
 *                                       list is already a subset of it; this
 *                                       only decides which LOGIN DOOR to
 *                                       show, never which page to allow.
 *     + pathname NOT in it            → redirect to /admin/login,
 *                                       preserveNext: true (unchanged)
 */
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
  if (AUTHORITY_MANAGER_ALLOWED_PATHS.some((p) => pathname.startsWith(p))) {
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
