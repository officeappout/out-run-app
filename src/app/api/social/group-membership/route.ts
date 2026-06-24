/**
 * /api/social/group-membership — server-side update of users/{uid}.social.groupIds
 *
 * POST { groupId, action: 'join' | 'leave' }
 *
 * social.groupIds is the trust anchor for the presence `group` scope:
 * the Firestore rule for mode='group' reads the broadcaster's groupIds to
 * decide who may see their location. Because we need that field to be
 * tamper-proof, it is locked from client self-write and all mutations flow
 * through this route via the Admin SDK.
 *
 * join  → joinEngine (atomic triple-write: members + user_memberships + social.groupIds)
 * leave → direct batch (no engine — engine handles joins only)
 *
 * Authentication: Firebase ID token in Authorization: Bearer <token>.
 * The caller may only update their own doc (uid from the verified token).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { joinEngine, JoinEngineError } from '@/lib/joinEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    let displayName: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
      displayName = decoded.name ?? 'משתמש';
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

    if (action === 'join') {
      // ── Join: delegate to engine (resolves, seeds, writes atomically) ────────
      try {
        await joinEngine({
          target: { type: 'direct', groupId },
          uid,
          displayName,
        });
      } catch (err) {
        if (err instanceof JoinEngineError) {
          return NextResponse.json({ error: err.code }, { status: 400 });
        }
        throw err;
      }
    } else {
      // ── Leave: dual-write (arrayRemove from social.groupIds + user_memberships) ─
      // Engine is join-only; leave logic stays here.
      // axiom §5: arrayRemove is valid for string-type elements (groupId is a string).
      const batch = db.batch();
      batch.set(
        db.doc(`users/${uid}`),
        {
          social: { groupIds: FieldValue.arrayRemove(groupId) },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { mergeFields: ['social.groupIds', 'updatedAt'] },
      );
      batch.set(
        db.doc(`user_memberships/${uid}`),
        { groupIds: FieldValue.arrayRemove(groupId), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      await batch.commit();
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/social/group-membership] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
