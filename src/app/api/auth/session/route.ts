/**
 * /api/auth/session — Server-Side Admin Session Cookie API
 *
 * POST   { idToken } → verifies the Firebase ID token via the Admin SDK,
 *                       resolves whether the caller is an admin, and
 *                       sets an HttpOnly HMAC-signed session cookie.
 * DELETE                 → clears the cookie (sign-out cleanup).
 * GET                    → returns the decoded session (for debugging /
 *                       client-side reflection); does NOT mint a new one.
 *
 * This route is the bridge between the Firebase client (which only has
 * an ID token) and the Edge middleware (which can only verify HMAC).
 * See src/lib/admin-session.ts for the rationale.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity } from '@/lib/firebase-admin';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signAdminSession,
  verifyAdminSession,
} from '@/lib/admin-session';

// Force Node.js runtime — firebase-admin is not Edge-compatible.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildCookie(token: string, maxAge: number): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }

  const idToken = typeof body?.idToken === 'string' ? body.idToken : null;
  if (!idToken) {
    return NextResponse.json({ ok: false, error: 'idToken required' }, { status: 400 });
  }

  let identity;
  try {
    identity = await resolveIdentity(idToken);
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: 'invalid ID token', detail: err?.message ?? 'verify failed' },
      { status: 401 },
    );
  }

  const sessionToken = await signAdminSession({
    uid: identity.uid,
    email: identity.email,
    admin: identity.admin,
  });

  const res = NextResponse.json({
    ok: true,
    uid: identity.uid,
    email: identity.email,
    admin: identity.admin,
  });
  res.headers.set('Set-Cookie', buildCookie(sessionToken, SESSION_TTL_SECONDS));
  return res;
}

export async function DELETE(_req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  // Max-Age=0 expires the cookie immediately.
  res.headers.set('Set-Cookie', buildCookie('', 0));
  return res;
}

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return NextResponse.json({ ok: false, session: null });
  const session = await verifyAdminSession(cookie);
  return NextResponse.json({ ok: !!session, session });
}
