/**
 * GET /api/admin/signup-failures — the most recent recorded signup/
 * onboarding failures, root-only.
 *
 * David, 24.09.2026, explicit: "זה לא מידע שצריך להיות נגיש לאף אחד
 * מלבדי" — literally isRootAdmin(email), NOT the broader admin:true
 * bucket (which also covers super_admin/system_admin/vertical_admin),
 * and never authority_manager/tenant_owner/unit_admin. This is the same
 * gate POST /api/admin/invitations already uses for its root-only
 * branches — reused as-is, not a new mechanism.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRootAdmin } from '@/config/feature-flags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 100;

export interface SignupFailureRow {
  id: string;
  uid: string | null;
  stage: string | null;
  reason: string | null;
  timestampMs: number | null;
}

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this
 * session. No authorization logic here by design: the root-only check
 * happens once, in the HTTP handler, before this is ever called.
 */
export async function computeSignupFailuresList(db: Firestore, limit = DEFAULT_LIMIT): Promise<SignupFailureRow[]> {
  const snap = await db.collection('signup_failures').orderBy('timestamp', 'desc').limit(limit).get();
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.timestamp;
    return {
      id: d.id,
      uid: typeof data.uid === 'string' ? data.uid : null,
      stage: typeof data.stage === 'string' ? data.stage : null,
      reason: typeof data.reason === 'string' ? data.reason : null,
      timestampMs: typeof ts?.toMillis === 'function' ? ts.toMillis() : null,
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let email: string | null;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      email = (decoded.email as string | undefined) ?? null;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // David, 24.09.2026, explicit: root only — literally isRootAdmin, NOT
    // the broader admin:true bucket (super_admin/system_admin/
    // vertical_admin included), and never authority_manager/tenant_owner/
    // unit_admin. Same gate POST /api/admin/invitations already uses for
    // its root-only branches, reused as-is.
    if (!isRootAdmin(email)) {
      return NextResponse.json({ error: 'Root only' }, { status: 403 });
    }

    const db = getAdminDb();
    const failures = await computeSignupFailuresList(db);
    return NextResponse.json({ failures });
  } catch (err: any) {
    console.error('[/api/admin/signup-failures] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
