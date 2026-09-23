/**
 * GET /api/auth/admin-invite/verify-token?token=<token>
 *
 * Public (no auth required) — resolves an admin_invitations doc by its
 * token via Admin SDK. Runs when a brand-new admin clicks their invitation
 * link, before they have any admin role at all.
 *
 * Deliberately lives under /api/auth/*, NOT /api/admin/* — SEC-12's planned
 * fix extends the admin-gate middleware to block /api/admin/* on every
 * domain, not just the admin.outrun.co.il cookie check it does today. This
 * route must stay reachable pre-auth, so it can't sit under that prefix.
 *
 * SPEC-01 (docs/audit-2026-09/SPEC-01-close-guest-leaks.md), task 1: the
 * client used to run this as a direct `where('token', ...)` query against
 * Firestore, which required `admin_invitations` to allow open `list` —
 * letting any signed-in-anonymous guest dump every invitation (emails,
 * roles, live tokens). The query now runs server-side; the token itself
 * (64-char random hex, supplied by the caller) remains the authorization —
 * this endpoint just moves *where* it's checked, not the trust model.
 *
 * Rate limit — SPEC-02 SEC-15: shared Firestore-backed limiter
 * (rateLimit.ts). Not one of the two routes SEC-15 named explicitly, but
 * the identical in-memory-Map issue (I wrote this file in SPEC-01 with
 * the same pattern) — fixed here too rather than left as a known-twin bug.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { getRequestIp } from '@/lib/requestIp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

function toIso(v: any): string | null {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function GET(request: NextRequest) {
  const ip = getRequestIp(request);
  const db = getAdminDb();
  if (await isRateLimited(db, `verify-token:${ip}`, { windowMs: WINDOW_MS, maxRequests: MAX_REQUESTS_PER_WINDOW })) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const token = request.nextUrl.searchParams.get('token')?.trim() ?? '';
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return NextResponse.json({ invitation: null }, { status: 400 });
  }

  try {
    const snap = await db
      .collection('admin_invitations')
      .where('token', '==', token)
      .where('isUsed', '==', false)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ invitation: null });
    }

    const doc = snap.docs[0];
    const data = doc.data();

    const expiresAt = data.expiresAt?.toDate
      ? data.expiresAt.toDate()
      : data.expiresAt
        ? new Date(data.expiresAt)
        : null;
    if (expiresAt && expiresAt < new Date()) {
      return NextResponse.json({ invitation: null });
    }

    return NextResponse.json({
      invitation: {
        id: doc.id,
        email: data.email ?? '',
        role: data.role ?? 'authority_manager',
        authorityId: data.authorityId ?? undefined,
        tenantId: data.tenantId ?? undefined,
        unitId: data.unitId ?? undefined,
        unitPath: data.unitPath ?? undefined,
        managedVertical: data.managedVertical ?? undefined,
        allowedSections: Array.isArray(data.allowedSections) ? data.allowedSections : undefined,
        teamRole: data.teamRole ?? undefined,
        token: data.token ?? '',
        isUsed: data.isUsed ?? false,
        expiresAt: toIso(data.expiresAt),
        createdAt: toIso(data.createdAt),
        createdBy: data.createdBy ?? '',
        usedAt: toIso(data.usedAt),
        usedBy: data.usedBy ?? undefined,
      },
    });
  } catch (err) {
    console.error('[admin/invitations/verify-token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
