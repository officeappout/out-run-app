import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  verifyAdminSession,
} from '@/lib/admin-session';

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host') || '';
  const domain = hostname.split(':')[0].toLowerCase();

  const isAdminDomain = domain === 'admin.outrun.co.il' || domain === 'admin.outrun.local';
  const isAuthorityDomain = domain === 'portal.outrun.co.il' || domain === 'portal.outrun.local';
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
  const shouldGateAdmin =
    pathname.startsWith('/admin') &&
    !isAdminPublic(pathname) &&
    (isAdminDomain || isLocalDev);

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
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|mp3|otf|woff|woff2)$).*)',
  ],
};
