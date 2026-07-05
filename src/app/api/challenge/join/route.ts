/**
 * POST /api/challenge/join
 *
 * Challenge-specific join: saves a minimal user profile (name / ageGroup / gender)
 * then delegates group membership to joinEngine (axiom §17 triple-write).
 *
 * Distinct from /api/join/confirm because that route expects the profile to be
 * saved first via /api/user/complete-profile (which collects full DOB). For a
 * challenge booth we only need name + age (integer) + gender — ~20 seconds.
 *
 * Auth: Firebase ID token Bearer
 * Body: { inviteCode: string; name: string; age: number; gender: 'male'|'female'|'other' }
 * Returns: { ok: true; groupId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { joinEngine, JoinEngineError } from '@/lib/joinEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = await request.json() as {
      inviteCode?: string;
      name?: string;
      age?: number;
      gender?: string;
    };

    const { inviteCode, name, age, gender } = body;

    if (!inviteCode || typeof inviteCode !== 'string') {
      return NextResponse.json({ error: 'inviteCode required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'name required (min 2 chars)' }, { status: 400 });
    }
    if (!age || typeof age !== 'number' || age < 5 || age > 120) {
      return NextResponse.json({ error: 'age required (5–120)' }, { status: 400 });
    }
    if (!gender || !['male', 'female', 'other'].includes(gender)) {
      return NextResponse.json({ error: 'gender required' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const ageGroup: 'minor' | 'adult' = age < 18 ? 'minor' : 'adult';

    // ── Write minimal profile (before joinEngine reads core.name) ─────────────
    const db = getAdminDb();
    await db.doc(`users/${uid}`).set(
      {
        core: {
          name: trimmedName,
          ageGroup,
          gender,
          isAnonymous: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // ── joinEngine — triple-write membership (axiom §17) ──────────────────────
    let result;
    try {
      result = await joinEngine({
        target: { type: 'group', inviteCode },
        uid,
        displayName: trimmedName,
      });
    } catch (err) {
      if (err instanceof JoinEngineError) {
        if (err.code === 'target-not-found') {
          return NextResponse.json({ error: 'invalid-invite-code' }, { status: 404 });
        }
        return NextResponse.json({ error: err.code }, { status: 400 });
      }
      throw err;
    }

    // ── Non-fatal: increment member counters ──────────────────────────────────
    if (!result.alreadyMember) {
      try {
        await db.doc(`community_groups/${result.groupId}`).update({
          memberCount: FieldValue.increment(1),
          currentParticipants: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch {
        // Non-fatal — counter drift is acceptable
      }
    }

    return NextResponse.json({ ok: true, groupId: result.groupId });
  } catch (err) {
    console.error('[challenge/join] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
