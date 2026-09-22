/**
 * GET /api/authority-manager/city-summary
 *
 * Aggregate-only resident counts for an authority manager's own city.
 * Built to close the gap found in the 22.09.2026 authority-manager full-tour
 * audit: the client-side pages that used to `getDocs` the `users` collection
 * directly (scoped by core.authorityId) are denied by firestore.rules for a
 * real-shape authority manager (managerIds-based access was never wired into
 * the users/{userId} rule) — and even when that read *did* succeed, it would
 * have shipped individual resident documents (name, gender, birthDate, …) to
 * the browser, violating SPEC-PERMISSIONS-MODEL.md §5 ("aggregates only, no
 * names") and §5.1 ("data that reaches the browser is exposed, even if
 * hidden in the UI").
 *
 * Hard requirements (all enforced below):
 *   - Real Firebase ID token required (Authorization: Bearer <token>).
 *     No token → 401.
 *   - authorityId is resolved SERVER-SIDE from the authorities doc where
 *     the caller's uid appears in managerIds. A client-supplied authorityId
 *     is never read or trusted — there isn't even a place to send one.
 *   - uid not present in any authority's managerIds → 403.
 *   - Only Firestore COUNT aggregation queries are used — never a getDocs()
 *     over the users collection. The response contains numbers only: no
 *     names, emails, uids, or phone numbers of any resident.
 *
 * Deliberately NOT handling multiple authorities per manager: today's model
 * (SPEC-PERMISSIONS-MODEL.md §1) is one city per level-1 manager. If a uid
 * somehow matches more than one authority's managerIds, the first match
 * (query order, not significant) is used — same shape the client-side
 * getAuthoritiesByManager() callers already assume (`auths[0]`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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

    const db = getAdminDb();

    // authorityId is resolved from the server's own lookup — any authorityId
    // in the request (query string or body) is never read, on purpose.
    const managedSnap = await db
      .collection('authorities')
      .where('managerIds', 'array-contains', uid)
      .limit(1)
      .get();

    if (managedSnap.empty) {
      return NextResponse.json({ error: 'Not an authority manager' }, { status: 403 });
    }

    const authorityDoc = managedSnap.docs[0];
    const authorityId = authorityDoc.id;
    const authorityData = authorityDoc.data();
    const rawName = authorityData?.name;
    const authorityName = typeof rawName === 'string' ? rawName : (rawName?.he || rawName?.en || '');

    const usersRef = db.collection('users').where('core.authorityId', '==', authorityId);
    const approvedRef = usersRef.where('core.isApproved', '==', true);

    // Demo/mock users (src/features/admin/services/demo-seed-sderot.ts tags
    // them core.isMockData: true) must not count as real residents. The
    // naive fix — usersRef.where('core.isMockData', '!=', true) — is wrong:
    // Firestore's `!=` excludes any document where the field is ABSENT, not
    // just where it's false. Almost no real resident ever sets isMockData at
    // all, so that query would have excluded almost every real resident too,
    // leaving mostly demo users in the count — the opposite of the intent.
    // Fixed by counting demo users separately with a positive `== true`
    // filter (which only ever matches documents that actually set the flag)
    // and subtracting, rather than trying to query the exclusion directly.
    const [totalAllSnap, totalMockSnap, approvedAllSnap, approvedMockSnap] = await Promise.all([
      usersRef.count().get(),
      usersRef.where('core.isMockData', '==', true).count().get(),
      approvedRef.count().get(),
      approvedRef.where('core.isMockData', '==', true).count().get(),
    ]);

    return NextResponse.json({
      authorityId,
      authorityName,
      totalUsers: totalAllSnap.data().count - totalMockSnap.data().count,
      approvedUsers: approvedAllSnap.data().count - approvedMockSnap.data().count,
    });
  } catch (err: any) {
    console.error('[/api/authority-manager/city-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
