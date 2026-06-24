/**
 * POST /api/join/session-token
 *
 * Called by consumeSessionInvitation() immediately after the client-side
 * attendance write. Writes the Firestore state that the thin session-token
 * join path skips (compared to the full /api/join/confirm invite-code path):
 *
 *   1. users/{uid}            — minimal shell doc so subsequent client-side
 *                               setDoc+merge hits UPDATE (not CREATE).
 *                               Without this, syncOnboardingToFirestore in
 *                               CREATE mode trips the core.role == '' guard
 *                               and the health declaration can never be saved.
 *
 *   2. user_memberships/{uid} — presence-read gate. memberGroupIds() in
 *                               firestore.rules reads this doc; if it's
 *                               missing, [].hasAny([groupId]) → false →
 *                               PERMISSION-DENIED on every group presence read.
 *
 * Both writes go through Admin SDK (bypasses client rules). This mirrors
 * what /api/join/confirm does for invite-code joins.
 *
 * SECURITY — three-layer gate before any write:
 *   1. Firebase ID token verified (anonymous tokens accepted).
 *   2. group_invitations/{token} must exist, match the claimed groupId, and
 *      not be expired — prevents a caller from substituting an arbitrary
 *      groupId to gain presence-read access to a group they didn't join.
 *   3. (Layer 4 — attendance check — intentionally removed)
 *      Checking uid in attendees after the client-side arrayUnion write
 *      creates a read-after-write race: the Firestore web SDK with offline
 *      persistence resolves `await updateDoc()` when the write is locally
 *      persisted (IndexedDB), before the server has committed it. The Admin
 *      SDK read in this route would then see stale data and deny legitimate
 *      callers. Layers 1-2 are sufficient: a valid, unexpired token that
 *      maps to the claimed groupId proves the caller was given the invitation.
 *
 * Auth: Firebase ID token in Authorization: Bearer <token>.
 * Body: { token: string; groupId: string }
 * Returns: { ok: true }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // ── 1. Verify Firebase ID token ───────────────────────────────────────────
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    try {
      // checkRevoked=true so stolen anonymous tokens are rejected promptly.
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // ── 2. Parse and validate body ────────────────────────────────────────────
    const body = await request.json();
    const { token, groupId } = body as { token?: string; groupId?: string };

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return NextResponse.json({ error: 'token required' }, { status: 400 });
    }
    if (!groupId || typeof groupId !== 'string' || groupId.trim().length === 0) {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }

    const db = getAdminDb();

    // ── 3. Verify the invitation token ────────────────────────────────────────
    // Reads group_invitations/{token} via Admin SDK (bypasses read rules so
    // anonymous users can reach this path). Two checks:
    //   a) Token exists and maps to the claimed groupId — prevents groupId
    //      substitution (passing token for group A, claiming membership in group B).
    //   b) Token has not expired — session invitations are time-limited (2 h).
    const invitationSnap = await db.doc(`group_invitations/${token}`).get();
    if (!invitationSnap.exists) {
      return NextResponse.json({ error: 'invalid-token' }, { status: 403 });
    }

    const invitation = invitationSnap.data() as {
      groupId: string;
      expiresAt: Timestamp;
    };

    // a) groupId must match what the token was issued for.
    if (invitation.groupId !== groupId) {
      return NextResponse.json({ error: 'token-group-mismatch' }, { status: 403 });
    }

    // b) Token must not be expired.
    if (invitation.expiresAt.toMillis() < Date.now()) {
      return NextResponse.json({ error: 'token-expired' }, { status: 403 });
    }

    // ── 4. Batch write (Admin SDK — bypasses firestore.rules) ─────────────────

    // Pre-seed progression so the subsequent client-side setDoc (onboarding-sync
    // UPDATE path) doesn't violate noGameIntegrityFieldsChanged(). Without this,
    // the shell doc has no progression, so onboarding-sync writes globalLevel:1
    // against an existing value of 0 (rule default) → 1≠0 → PERMISSION-DENIED.
    //
    // Only seed when the doc is absent or has no progression — never overwrite an
    // existing user's earned XP/level (e.g. a regular user who scans a session QR).
    const existingUserSnap = await db.doc(`users/${uid}`).get();
    const hasProgression = existingUserSnap.exists && Boolean(existingUserSnap.data()?.progression);

    const shellPayload: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };
    if (!hasProgression) {
      shellPayload.progression = {
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
    }

    const batch = db.batch();

    // Shell doc — creates users/{uid} if absent, otherwise merges.
    // Includes initial progression when the doc is new (no existing progression)
    // so that the client-side onboarding-sync UPDATE hits UPDATE (not CREATE)
    // and noGameIntegrityFieldsChanged() sees identical before/after values.
    batch.set(
      db.doc(`users/${uid}`),
      shellPayload,
      { merge: true },
    );

    // Presence gate — memberGroupIds(uid) in firestore.rules reads this doc.
    // Without it, [].hasAny([groupId]) → false → PERMISSION-DENIED on every
    // mode='group' presence read for this session.
    batch.set(
      db.doc(`user_memberships/${uid}`),
      {
        groupIds: FieldValue.arrayUnion(groupId),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/join/session-token] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
