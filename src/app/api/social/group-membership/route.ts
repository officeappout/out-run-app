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

    // Pre-seed check — same logic as /api/join/session-token and /api/join/confirm:
    // if the users doc has no progression, seed it so the subsequent client-side
    // onboarding-sync (UPDATE path) doesn't violate noGameIntegrityFieldsChanged()
    // (incoming globalLevel:1 vs existing default 0 → PERMISSION-DENIED).
    // Only on join; leave can't create a doc for a non-existent user anyway.
    const existingUserSnap = action === 'join'
      ? await db.doc(`users/${uid}`).get()
      : null;
    const hasProgression = existingUserSnap?.exists && Boolean(existingUserSnap.data()?.progression);

    const membershipUpdate = action === 'join'
      ? FieldValue.arrayUnion(groupId)
      : FieldValue.arrayRemove(groupId);

    const userDocPayload: Record<string, any> = {
      social: { groupIds: membershipUpdate },
      updatedAt: FieldValue.serverTimestamp(),
    };
    const userDocMergeFields: string[] = ['social.groupIds', 'updatedAt'];
    if (action === 'join' && !hasProgression) {
      userDocPayload.progression = {
        globalLevel: 1,
        globalXP: 0,
        coins: 0,
        totalCaloriesBurned: 0,
        hasUnlockedAdvancedStats: false,
        avatarId: 'default',
        unlockedBadges: [],
        domains: {},
        activePrograms: [],
        unlockedBonusExercises: [],
      };
      userDocMergeFields.push('progression');
    }

    const batch = db.batch();

    // set+mergeFields (not update) so the batch doesn't throw NOT_FOUND when
    // users/{uid} doesn't exist yet. If the doc is absent the merge creates it
    // with the specified fields; existing docs are unaffected on unspecified fields.
    batch.set(
      db.doc(`users/${uid}`),
      userDocPayload,
      { mergeFields: userDocMergeFields },
    );
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
