/**
 * /api/user/update-authority
 *
 * POST { authorityId: string, neighborhoodId?: string | null }
 *
 * Server-side update of users/{uid}.core.authorityId (and, optionally,
 * core.neighborhoodId in the SAME update() call).
 *
 * core.authorityId is locked from client self-write by noTenantFieldsChanged()
 * in firestore.rules to prevent users from self-assigning to paying municipalities.
 * All mutations flow through this route via the Admin SDK.
 *
 * neighborhoodId itself isn't rules-locked, but a city+neighborhood pick is one
 * logical user action — bundling both fields into this single Admin update()
 * call (instead of a separate client setDoc for neighborhoodId + a decoupled
 * fire-and-forget call for authorityId) makes the pair atomic: one Firestore
 * write, both fields land together or neither does. Fixes a real production
 * bug where the two were written by unsynchronized calls and could resolve
 * out of order, leaving authorityId and neighborhoodId pointing at unrelated
 * cities. Pass neighborhoodId: null explicitly to clear it; omit the key
 * entirely to leave the existing value untouched.
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
    const { authorityId, neighborhoodId } = body as {
      authorityId?: string;
      neighborhoodId?: string | null;
    };
    if (!authorityId || typeof authorityId !== 'string' || authorityId.trim() === '') {
      return NextResponse.json({ error: 'authorityId required' }, { status: 400 });
    }
    const hasNeighborhoodKey = Object.prototype.hasOwnProperty.call(body, 'neighborhoodId');
    if (hasNeighborhoodKey && neighborhoodId != null && typeof neighborhoodId !== 'string') {
      return NextResponse.json({ error: 'neighborhoodId must be a string or null' }, { status: 400 });
    }

    const db = getAdminDb();

    // Verify the authority exists.
    // TODO(billing): also check authority.isActiveClient == true when payment is live.
    const authoritySnap = await db.doc(`authorities/${authorityId}`).get();
    if (!authoritySnap.exists) {
      return NextResponse.json({ error: 'Authority not found' }, { status: 404 });
    }

    // Defense in depth (same rule as findNeighborhoodIdByCity client-side):
    // never trust that a passed neighborhoodId actually belongs to authorityId —
    // re-verify its own parentAuthorityId server-side before writing either field.
    if (hasNeighborhoodKey && neighborhoodId) {
      const neighborhoodSnap = await db.doc(`authorities/${neighborhoodId}`).get();
      if (!neighborhoodSnap.exists || neighborhoodSnap.data()?.parentAuthorityId !== authorityId) {
        return NextResponse.json(
          { error: 'neighborhoodId does not belong to authorityId' },
          { status: 400 },
        );
      }
    }

    const update: Record<string, unknown> = {
      'core.authorityId': authorityId,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (hasNeighborhoodKey) {
      update['core.neighborhoodId'] = neighborhoodId ?? FieldValue.delete();
    }

    await db.doc(`users/${uid}`).update(update);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/user/update-authority] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
