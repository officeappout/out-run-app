/**
 * /api/social/group-membership — Server-side update of users/{uid}.social.groupIds
 *
 * POST { groupId, action: 'join' | 'leave' }
 *
 * social.groupIds is the trust anchor for the presence `group` scope:
 * the Firestore rule for mode='group' reads the broadcaster's groupIds to
 * decide who may see their location. Because we need that field to be
 * tamper-proof, it is locked from client self-write (Group E in firestore.rules)
 * and all mutations flow through this route via the Admin SDK.
 *
 * Authentication: Firebase ID token in Authorization: Bearer <token>.
 * The caller may only update their own doc (uid from the verified token).
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

    const body = await request.json();
    const { groupId, action } = body as { groupId?: string; action?: string };

    if (!groupId || typeof groupId !== 'string' || groupId.length === 0) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }
    if (action !== 'join' && action !== 'leave') {
      return NextResponse.json({ error: 'action must be join or leave' }, { status: 400 });
    }

    const db = getAdminDb();

    // Dual-write: keep users.social.groupIds (client read) and
    // user_memberships.groupIds (Rules get() — avoids 1 MiB doc-size limit)
    // in lock-step.  Both writes are batched so they never drift.
    const batch = db.batch();
    const membershipUpdate = action === 'join'
      ? FieldValue.arrayUnion(groupId)
      : FieldValue.arrayRemove(groupId);

    batch.update(db.doc(`users/${uid}`), {
      'social.groupIds': membershipUpdate,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(
      db.doc(`user_memberships/${uid}`),
      { groupIds: membershipUpdate, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/social/group-membership] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
