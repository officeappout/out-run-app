/**
 * /api/parks/recompute-rating — server-side recompute of parks/{id}.ratingAvg
 * + reviewCount from user_contributions (type:'review', linkedParkId===id).
 *
 * `firestore.rules`' `match /parks/{docId} { allow write: if isAdmin(); }`
 * blocks a direct client write to the park doc for a regular reviewer — and
 * per this repo's standing rule, that bar gets fixed on the write-path side,
 * never weakened in the rules themselves (axioms.md Verification-First §7).
 * So the recompute runs here, server-side via the Admin SDK (which bypasses
 * rules by design, the same way /api/social/group-membership legitimately
 * writes users/{uid}.social.groupIds on the caller's behalf).
 *
 * The computation itself is NOT trusted from the client — this route always
 * recomputes from the park's own review docs (computeParkRatingSummary,
 * shared with contribution.service.ts's client caller and the one-time
 * backfill script, so all three can never disagree on the formula). The
 * client only supplies which park to recompute; it cannot inject a number.
 *
 * POST { parkId }
 * Authentication: Firebase ID token in Authorization: Bearer <token> — any
 * authenticated caller (same bar as creating the review itself; reviews are
 * public content, recomputing a park's aggregate from existing public
 * reviews carries no extra trust requirement beyond "signed in").
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { computeParkRatingSummary, type RatingSource } from '@/features/parks/core/services/park-rating.utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }
    try {
      await getAdminAuth().verifyIdToken(idToken, true);
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const body = await request.json();
    const { parkId } = body as { parkId?: string };
    if (!parkId || typeof parkId !== 'string' || parkId.length === 0) {
      return NextResponse.json({ error: 'parkId required' }, { status: 400 });
    }

    const db = getAdminDb();
    const reviewsSnap = await db
      .collection('user_contributions')
      .where('type', '==', 'review')
      .where('linkedParkId', '==', parkId)
      .get();

    const reviews: RatingSource[] = reviewsSnap.docs.map((d) => ({ rating: d.data().rating }));
    const summary = computeParkRatingSummary(reviews);

    // set+merge, not update — a bare .update() would throw if the park doc
    // were deleted between the review submit and this call; merge is a safe
    // no-op-on-missing-doc write for a denormalized aggregate like this one.
    await db.doc(`parks/${parkId}`).set(
      {
        ratingAvg: summary.ratingAvg,
        reviewCount: summary.reviewCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ ok: true, ...summary });
  } catch (err: any) {
    console.error('[/api/parks/recompute-rating] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
