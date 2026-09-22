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
import { getAdminDb, resolveIdentity } from '@/lib/firebase-admin';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signAdminSession,
  verifyAdminSession,
} from '@/lib/admin-session';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';

function tooManyRequests(windowMs: number): NextResponse {
  return NextResponse.json(
    { ok: false, error: 'too many requests' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) } },
  );
}

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
  // IP dimension checked first — cheapest gate, before the real
  // Firebase ID-token verify below. AdminSessionSync refreshes this
  // roughly every 50 minutes per tab/device, so a generous ceiling is
  // needed to not break multi-tab/multi-device legitimate use — see
  // .claude/plans/rate-limiting-sensitive-endpoints.md part ב (priority 3).
  const ip = getRequestIp(req);
  const db = getAdminDb();
  const ipCheck = await isBlockedByAny(db, [
    { key: `session:ip:${ip}:short`, window: RATE_LIMITS.session.ipShort() },
    { key: `session:ip:${ip}:hourly`, window: RATE_LIMITS.session.ipHourly() },
  ]);
  if (ipCheck.blocked) {
    logRateLimitBlock({ route: 'session', dimension: 'ip', ip });
    return tooManyRequests(ipCheck.window?.windowMs ?? 900_000);
  }

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

  // uid dimension, checked once we actually know who this is — catches a
  // single malfunctioning/scripted client looping session refresh, even
  // when its IP dimension alone would still have headroom (e.g. it's
  // sharing a generous municipal-office IP budget with real coworkers).
  const uidCheck = await isBlockedByAny(db, [
    { key: `session:uid:${identity.uid}:short`, window: RATE_LIMITS.session.uidShort() },
    { key: `session:uid:${identity.uid}:hourly`, window: RATE_LIMITS.session.uidHourly() },
  ]);
  if (uidCheck.blocked) {
    logRateLimitBlock({ route: 'session', dimension: 'uid', ip, identifier: identity.uid });
    return tooManyRequests(uidCheck.window?.windowMs ?? 900_000);
  }

  const sessionToken = await signAdminSession({
    uid: identity.uid,
    email: identity.email,
    admin: identity.admin,
    scope: identity.scope,
  });

  const res = NextResponse.json({
    ok: true,
    uid: identity.uid,
    email: identity.email,
    admin: identity.admin,
    scope: identity.scope,
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
