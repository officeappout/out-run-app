/**
 * POST /api/calendar/token
 *
 * Mints the caller's personal calendar-feed token. Auth: Firebase ID token in
 * `Authorization: Bearer <token>`, verified with checkRevoked=true. Anonymous
 * accounts are rejected (403) — a throwaway anonymous uid has no real schedule
 * and must not be able to obtain a long-lived feed URL.
 *
 * Returns { token, path } for the AUTHENTICATED uid only (never a client-
 * supplied one). `path` is host-less; the client composes webcal://{host}{path}.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { isFeedTokenConfigured, mintFeedToken } from '@/lib/calendar-feed-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  if (!isFeedTokenConfigured()) {
    return NextResponse.json({ error: 'Calendar feed unavailable' }, { status: 503, headers: NO_STORE });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!idToken) {
    return NextResponse.json({ error: 'Missing auth token' }, { status: 401, headers: NO_STORE });
  }

  let uid: string;
  let provider: string | undefined;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    uid = decoded.uid;
    provider = decoded.firebase?.sign_in_provider;
  } catch {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401, headers: NO_STORE });
  }

  if (provider === 'anonymous') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 403, headers: NO_STORE });
  }

  const token = mintFeedToken(uid);
  if (!token) {
    // Secret verified above, so this means a uid that fails the format check.
    return NextResponse.json({ error: 'Calendar feed unavailable' }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json(
    { token, path: `/api/calendar/t/${token}` },
    { status: 200, headers: NO_STORE },
  );
}
