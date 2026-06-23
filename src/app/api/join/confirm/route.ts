/**
 * POST /api/join/confirm
 *
 * Authenticated endpoint — confirms group membership after the user has
 * completed the identity gate (name + gender + DOB via /api/user/complete-profile).
 *
 * Why this exists instead of the client-side joinGroup():
 *   1. Verifies inviteCode server-side (Admin SDK) — client can't spoof.
 *   2. Atomic batch: writes community_groups/{groupId}/members/{uid} AND
 *      user_memberships/{uid}.groupIds AND users/{uid}.social.groupIds together.
 *      user_memberships is the document read by the presence write rule via
 *      memberGroupIds() — missing it means presence writes are rejected.
 *   3. Idempotent — double-taps and retries are safe.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * Body: { inviteCode: string }
 * Returns: { ok: true, groupId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
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

    // ── Body ──────────────────────────────────────────────────────────────
    const body = await request.json();
    const { inviteCode } = body as { inviteCode?: string };
    if (!inviteCode || typeof inviteCode !== 'string' || inviteCode.trim().length === 0) {
      return NextResponse.json({ error: 'inviteCode required' }, { status: 400 });
    }
    const code = inviteCode.trim().toUpperCase();

    // ── Look up group by inviteCode (server-side — never trust client groupId) ──
    const db = getAdminDb();
    const groupSnap = await db
      .collection('community_groups')
      .where('inviteCode', '==', code)
      .limit(1)
      .get();

    if (groupSnap.empty) {
      return NextResponse.json({ error: 'invalid-invite-code' }, { status: 404 });
    }

    const groupDoc = groupSnap.docs[0];
    const groupId = groupDoc.id;
    const groupData = groupDoc.data();

    // Validate code for private groups (should always match since we looked up by code,
    // but an extra explicit check guards against case-sensitivity edge cases).
    if (groupData.isPublic === false) {
      const expected = ((groupData.inviteCode as string | undefined) ?? '').toUpperCase();
      if (code !== expected) {
        return NextResponse.json({ error: 'invalid-invite-code' }, { status: 403 });
      }
    }

    // ── Idempotency check — already a member? ──────────────────────────────
    // We still read the member doc to guard against double-counting the member
    // counter, but we NO LONGER early-return here. user_memberships and
    // social.groupIds are always written (arrayUnion is idempotent) so that a
    // prior join via a different code path (e.g. client-side joinGroup() that
    // wrote the member doc but failed to update user_memberships) is repaired
    // automatically. Without this, PERMISSION-DENIED fires on the presence
    // listener because memberGroupIds() finds an empty user_memberships.
    const memberRef = db
      .collection('community_groups')
      .doc(groupId)
      .collection('members')
      .doc(uid);
    const memberSnap = await memberRef.get();
    const alreadyMember = memberSnap.exists;

    // ── Resolve display name from users doc if token name is missing ──────
    // Anonymous users won't have a displayName in the token; fall back to
    // core.name written by complete-profile.
    let memberName = displayName;
    if (!memberName || memberName === 'משתמש') {
      const userSnap = await db.collection('users').doc(uid).get();
      memberName = userSnap.data()?.core?.name ?? 'משתמש';
    }

    // ── Atomic batch write ─────────────────────────────────────────────────
    // Three documents updated together so they never drift:
    //   1. community_groups/{groupId}/members/{uid}  — membership record
    //   2. user_memberships/{uid}                    — Rules mirror (presence gate)
    //   3. users/{uid}.social.groupIds               — client read array
    const batch = db.batch();

    // 1. Member record — set+merge so joinedAt is preserved on re-joins
    batch.set(memberRef, {
      uid,
      name: memberName,
      role: 'member',
      inviteCode: code,
      ...(alreadyMember ? {} : { joinedAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    // 2. user_memberships mirror (read by presence write rule via memberGroupIds())
    batch.set(db.doc(`user_memberships/${uid}`), {
      groupIds: FieldValue.arrayUnion(groupId),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // 3. Denormalised copy for client reads.
    //    set+mergeFields (not update) so anonymous users without an existing
    //    users/{uid} doc don't trigger NOT_FOUND and roll back the whole batch,
    //    leaving user_memberships un-written and presence reads broken.
    //    mergeFields ensures other social.* fields on existing docs are untouched.
    batch.set(db.doc(`users/${uid}`), {
      social: { groupIds: FieldValue.arrayUnion(groupId) },
      updatedAt: FieldValue.serverTimestamp(),
    }, { mergeFields: ['social.groupIds', 'updatedAt'] });

    await batch.commit();

    // ── Non-fatal: increment member counters (new joins only) ─────────────
    if (!alreadyMember) {
      try {
        await db.doc(`community_groups/${groupId}`).update({
          memberCount: FieldValue.increment(1),
          currentParticipants: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch {
        // Non-fatal — counter drift is acceptable; corrected by next sync.
      }
    }

    return NextResponse.json({ ok: true, groupId });
  } catch (err) {
    console.error('[join/confirm] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
