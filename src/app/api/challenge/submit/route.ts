/**
 * POST /api/challenge/submit
 *
 * Records a challenge result (elapsed seconds) into the group's
 * challenge_submissions/{uid} sub-collection.
 *
 * - Keeps ALL attempts (append to `attempts` array).
 * - Updates `bestValue` only when the new result improves the previous best.
 * - Idempotent per uid: re-submitting updates the same document.
 *
 * Auth: Firebase ID token Bearer
 * Body: { groupId: string; value: number }   (value = elapsed seconds, integer)
 * Returns: { ok: true; bestValue: number; isNewBest: boolean }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = await request.json() as { groupId?: string; value?: number };
    const { groupId, value } = body;

    if (!groupId || typeof groupId !== 'string') {
      return NextResponse.json({ error: 'groupId required' }, { status: 400 });
    }
    if (typeof value !== 'number' || value < 1 || value > 3600) {
      return NextResponse.json({ error: 'value must be 1–3600 seconds' }, { status: 400 });
    }

    const db = getAdminDb();

    // ── Read user profile for denormalisation ─────────────────────────────────
    const userSnap = await db.doc(`users/${uid}`).get();
    const userData = userSnap.data();
    const name: string    = userData?.core?.name    ?? 'משתתף';
    const age: number     = userData?.core?.age     ?? 0;
    const ageGroup: string = userData?.core?.ageGroup ?? 'adult';
    const gender: string  = userData?.core?.gender  ?? 'other';

    // ── Read existing submission (for bestValue logic) ────────────────────────
    const subRef = db.doc(`community_groups/${groupId}/challenge_submissions/${uid}`);
    const existing = await subRef.get();
    const prevBest: number = existing.exists ? (existing.data()?.bestValue ?? 0) : 0;
    const isNewBest = value > prevBest;
    const newBest = isNewBest ? value : prevBest;

    // ── Write ─────────────────────────────────────────────────────────────────
    await subRef.set(
      {
        uid,
        name,
        age,
        ageGroup,
        gender,
        bestValue: newBest,
        // Append this attempt to the history array (axiom §5 — use Timestamp.now() inside arrays)
        attempts: FieldValue.arrayUnion({
          value,
          submittedAt: Timestamp.now(),
        }),
        submittedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, bestValue: newBest, isNewBest });
  } catch (err) {
    console.error('[challenge/submit] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
