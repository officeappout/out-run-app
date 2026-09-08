/**
 * GET /api/admin/invitations/check-email?email=<email>
 *
 * Public (no auth required) — resolves whether a pending admin_invitations
 * doc exists for the given email, via Admin SDK. Runs during the admin
 * passwordless-login flow, before the caller has any session at all.
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
 *  2. Rate limit — per-IP sliding window, matching /api/join/preview.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const ipWindows = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = (ipWindows.get(ip) ?? []).filter((t: number) => now - t < WINDOW_MS);
  if (prev.length >= MAX_REQUESTS_PER_WINDOW) return true;
  prev.push(now);
  ipWindows.set(ip, prev);
  if (ipWindows.size > 500) {
    ipWindows.forEach((ts, k) => {
      if (ts.every((t: number) => now - t >= WINDOW_MS)) ipWindows.delete(k);
    });
  }
  return false;
}

export async function GET(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = (forwarded ? forwarded.split(',')[0] : null)?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase() ?? '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ role: null }, { status: 400 });
  }

  try {
    const db = getAdminDb();
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
