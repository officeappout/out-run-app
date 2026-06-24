/**
 * /api/social/sync-user-memberships
 *
 * POST — copies users/{uid}.social.groupIds → user_memberships/{uid}.groupIds.
 *
 * Called by useGroupMembershipReconciliation on login to backfill the lean
 * membership document for users who joined before the dual-write was added.
 * After the first successful call, group-membership dual-writes keep them
 * in lock-step and this becomes a cheap no-op (set+merge with the same data).
 *
 * Auth: Firebase ID token (Bearer).  The caller may only sync their own doc.
 *
 * Server-side Admin SDK reads users/{uid} without the 1 MiB Rules limit,
 * so this is the only path that can reliably see social.groupIds on large docs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();

    // Admin SDK read — no 1 MiB limit on server-side reads.
    const userSnap = await db.doc(`users/${uid}`).get();
    const groupIds: string[] = userSnap.data()?.social?.groupIds ?? [];

    // Idempotent: set+merge writes the same data every time.
    await db.doc(`user_memberships/${uid}`).set(
      { groupIds, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({ ok: true, synced: groupIds.length });
  } catch (err: any) {
    console.error('[/api/social/sync-user-memberships] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
