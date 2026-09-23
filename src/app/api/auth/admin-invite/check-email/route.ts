/**
 * GET /api/auth/admin-invite/check-email?email=<email>
 *
 * Public (no auth required) — resolves whether a pending admin_invitations
 * doc exists for the given email, via Admin SDK. Runs during the admin
 * passwordless-login flow, before the caller has any session at all.
 *
 * Deliberately lives under /api/auth/*, NOT /api/admin/* — SEC-12's planned
 * fix extends the admin-gate middleware to block /api/admin/* on every
 * domain, not just the admin.outrun.co.il cookie check it does today. This
 * route must stay reachable pre-auth, so it can't sit under that prefix.
 *
 * SPEC-01 (docs/audit-2026-09/SPEC-01-close-guest-leaks.md), task 1: the
 * client used to run this as a direct `where('email', ...)` query against
 * Firestore, which required `admin_invitations` to allow open `list` —
 * letting any signed-in-anonymous guest dump every invitation (emails,
 * roles, live tokens). The query now runs server-side and returns only the
 * single boolean/role decision the caller needs — never the raw invitation,
 * and never its token.
 *
 * Security constraints:
 *  1. Response never includes the invitation token, id, or any field beyond
 *     `role` — otherwise typing in a known admin's email would hand back
 *     their live invitation token.
 *  2. Rate limit — SPEC-02 SEC-15: shared Firestore-backed limiter
 *     (rateLimit.ts), not a per-instance in-memory Map — that reset on
 *     every serverless cold start, which Vercel does routinely, so it
 *     never actually bounded anything in production.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

export async function GET(request: NextRequest) {
  const ip = getRequestIp(request);
  const db = getAdminDb();
  if (await isRateLimited(db, `check-email:${ip}`, { windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS_PER_WINDOW })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase() ?? '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ role: null }, { status: 400 });
  }

  try {
    const snap = await db
      .collection('admin_invitations')
      .where('email', '==', email)
      .where('isUsed', '==', false)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ role: null });
    }

    const data = snap.docs[0].data();
    const role = data.role;

    const expiresAt = data.expiresAt?.toDate
      ? data.expiresAt.toDate()
      : data.expiresAt
        ? new Date(data.expiresAt)
        : null;
    const isExpired = expiresAt ? expiresAt < new Date() : false;

    if (isExpired || !role) {
      return NextResponse.json({ role: null });
    }

    // Mirrors the pre-existing client logic exactly: only an
    // 'authority_manager' invitation grants a role via this path.
    return NextResponse.json({ role: role === 'authority_manager' ? 'authority_manager' : null });
  } catch (err) {
    console.error('[admin/invitations/check-email] error:', err);
    return NextResponse.json({ role: null }, { status: 500 });
  }
}
