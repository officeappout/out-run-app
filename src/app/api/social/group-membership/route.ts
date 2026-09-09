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
import { validateDirectGroupJoin } from '@/lib/validateGroupJoinAccess';

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
    let isAnonymous: boolean;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
      displayName = decoded.name ?? 'משתמש';
      isAnonymous = decoded.firebase?.sign_in_provider === 'anonymous';
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const body = await request.json();
    const { groupId, action, code } = body as { groupId?: string; action?: string; code?: string };

    if (!groupId || typeof groupId !== 'string' || groupId.length === 0) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }
    if (action !== 'join' && action !== 'leave') {
      return NextResponse.json({ error: 'action must be join or leave' }, { status: 400 });
    }

    const db = getAdminDb();

    if (action === 'join') {
      // SPEC-02 (SEC-13 / SPEC-1 t3): this used to call joinEngine's
      // 'direct' target with NO validation at all — any authenticated
      // caller could join ANY group by id, bypassing the invite code,
      // the isLocked gate, and the reserve-persona gate entirely (Admin
      // SDK, so it also bypasses firestore.rules' own groupInviteCode()/
      // blockedByGroupPersonaGate() checks that a real client-SDK join
      // goes through).
      //
      // But this route ALSO has a legitimate caller with no code to give:
      // useWorkoutPresence.ts's session-start guard, which repairs a
      // drifted users/{uid}.social.groupIds mirror for a user who is
      // ALREADY a real member (joinEngine.ts's own comment on the
      // 'direct' case: "caller is responsible for validating the groupId
      // is legitimate — e.g. guard repair path where the user is already
      // a member but social.groupIds is stale"). Requiring a code there
      // would break that repair path for every locked/persona-gated
      // group, for users who already joined it correctly.
      //
      // Resolution: skip validation ONLY when a real members/{uid} doc
      // already exists (proof they were validated once, by some other
      // path, already) — apply full validation for anyone who is not
      // already a member, which is exactly the case that was open before.
      const memberSnap = await db.doc(`community_groups/${groupId}/members/${uid}`).get();
      if (!memberSnap.exists) {
        // SPEC-03 Wave C: joining a group makes you visible in its roster
        // to every other member — requires a real account. Checked here
        // (not just in firestore.rules' own members/{uid} create rule)
        // because this route uses the Admin SDK, which bypasses rules
        // entirely — the client-SDK direct-join path (group.service.ts's
        // joinGroup, for public/no-code groups) is covered by the rule;
        // this route is the code-gated / server-validated path. Skipped
        // for the repair-guard case (memberSnap.exists) same as the
        // validation call below — that path fixes a drifted mirror for a
        // user who is ALREADY a real member, not a new join.
        if (isAnonymous) {
          return NextResponse.json({ error: 'account-required' }, { status: 403 });
        }
        // Validation logic lives in validateGroupJoinAccess.ts (pure,
        // unit-tested independently of firebase-admin's server-only
        // guard) — mirrors firestore.rules' groupInviteCode() /
        // blockedByGroupPersonaGate(), not duplicated from scratch.
        const validation = await validateDirectGroupJoin(db, groupId, uid, code);
        if (!validation.ok) {
          const status = validation.error === 'group-not-found' ? 404
            : validation.error === 'group-inactive' ? 400
            : 403; // invalid-code | persona-mismatch
          return NextResponse.json({ error: validation.error }, { status });
        }
      }

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
