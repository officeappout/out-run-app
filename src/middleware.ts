import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  verifyAdminSession,
} from '@/lib/admin-session';
import { ADMIN_URL, AUTHORITY_PORTAL_URL } from '@/lib/config/domain-config';

// Real production hostnames, derived from the single domain-config source.
// The `.local` variants below are a separate, dev-only local-DNS-alias
// convention (not part of the ROOT_DOMAIN/subdomain model) — left as literals
// on purpose, see docs/architecture/domain-config.md.
const ADMIN_HOSTNAME = new URL(ADMIN_URL).hostname;
const AUTHORITY_PORTAL_HOSTNAME = new URL(AUTHORITY_PORTAL_URL).hostname;

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

  const isAdminDomain = domain === ADMIN_HOSTNAME || domain === 'admin.outrun.local';
  const isAuthorityDomain = domain === AUTHORITY_PORTAL_HOSTNAME || domain === 'portal.outrun.local';
  const isLocalDev =
    domain === 'localhost' || domain.includes('127.0.0.1') || domain.includes('192.168');

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
  //    on the admin domain (and on localhost for dev parity).
  //
  //    The authority-portal domain is intentionally exempted here
  //    because authority managers are gated by their own portal
  //    layout + Firestore rules; introducing the admin cookie
  //    requirement there would break their flow.
  // ──────────────────────────────────────────────────────────────
  // Admin gating applies only on the dedicated admin domain.
  // On localhost the Firebase Admin SDK is typically not configured (no
  // FIREBASE_SERVICE_ACCOUNT_KEY), so /api/auth/session returns 401 and the
  // session cookie is never minted — causing a middleware redirect loop.
  // Client-side auth in the layout is sufficient for local development.
  const shouldGateAdmin =
    pathname.startsWith('/admin') &&
    !isAdminPublic(pathname) &&
    isAdminDomain; // intentionally excludes isLocalDev

  if (shouldGateAdmin) {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = cookie ? await verifyAdminSession(cookie) : null;
    if (!session || session.admin !== true) {
      const url = new URL('/admin/login', request.url);
      // Preserve the requested path so the login flow can bounce
      // the user back after successful authentication.
      url.searchParams.set('next', pathname);
      const res = NextResponse.redirect(url);
      // Ensure stale/invalid cookies are wiped.
      if (cookie) {
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
