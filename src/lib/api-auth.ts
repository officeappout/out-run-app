import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity } from '@/lib/firebase-admin';
import { SESSION_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-session';

/**
 * True when the request carries valid admin credentials, via either:
 *   1. `Authorization: Bearer <Firebase ID token>` (verified by the Admin SDK), or
 *   2. the `out_admin_session` HMAC cookie (same credential the middleware checks).
 *
 * Mirrors the original isAuthorizedAdmin() in the photo-release route, which was
 * the only API route doing server-side admin auth correctly.
 */
export async function isAuthorizedAdmin(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) {
    try {
      const identity = await resolveIdentity(bearer);
      if (identity.admin) return true;
    } catch (err) {
      console.warn('[api-auth] Bearer verification failed:', err);
    }
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    const session = await verifyAdminSession(cookie);
    if (session?.admin === true) return true;
  }

  return false;
}

/**
 * Route guard for admin API endpoints.
 * Returns `null` when authorized; otherwise a 401 NextResponse to return early.
 *
 *   const denied = await requireAdminApi(request);
 *   if (denied) return denied;
 */
export async function requireAdminApi(request: NextRequest): Promise<NextResponse | null> {
  if (await isAuthorizedAdmin(request)) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
