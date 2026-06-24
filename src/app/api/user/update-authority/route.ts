/**
 * /api/user/update-authority
 *
 * POST { authorityId: string }
 *
 * Server-side update of users/{uid}.core.authorityId.
 *
 * core.authorityId is locked from client self-write by noTenantFieldsChanged()
 * in firestore.rules to prevent users from self-assigning to paying municipalities.
 * All mutations flow through this route via the Admin SDK.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * The caller may only update their own doc.
 *
 * TODO(billing): when municipality payment is live, add entitlement check before
 *   the write — verify authority.isActiveClient == true. For now all authorities
 *   are open and free, so we only verify the authority document exists.
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
    const { authorityId } = body as { authorityId?: string };
    if (!authorityId || typeof authorityId !== 'string' || authorityId.trim() === '') {
      return NextResponse.json({ error: 'authorityId required' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify the authority exists.
    // TODO(billing): also check authority.isActiveClient == true when payment is live.
    const authoritySnap = await db.doc(`authorities/${authorityId}`).get();
    if (!authoritySnap.exists) {
      return NextResponse.json({ error: 'Authority not found' }, { status: 404 });
    }

    await db.doc(`users/${uid}`).update({
      'core.authorityId': authorityId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/user/update-authority] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
