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
 *   - authorityId is resolved SERVER-SIDE via the shared
 *     resolveAuthorityManagerScope chokepoint (src/lib/authorityManagerScope.ts)
 *     — the same one all 6 sibling authority-manager routes use. Until
 *     11.10.2026 this route inlined its own byte-for-byte copy of that exact
 *     query, predating the helper's extraction; harmless in practice (same
 *     logic, same result) but a real structural risk flagged in a
 *     report-only adversarial audit — a future fix to the chokepoint
 *     (excluding a deactivated authority, changing multi-manager
 *     resolution, etc.) would silently NOT apply here. Migrated to close
 *     that gap, not because the old code was ever wrong.
 *   - A client-supplied authorityId is never read or trusted — there isn't
 *     even a place to send one.
 *   - uid not present in any authority's managerIds → 403.
 *   - Only Firestore COUNT aggregation queries are used — never a getDocs()
 *     over the users collection. The response contains numbers only: no
 *     names, emails, uids, or phone numbers of any resident.
 *
 * Deliberately NOT handling multiple authorities per manager: today's model
 * (SPEC-PERMISSIONS-MODEL.md §1) is one city per level-1 manager. If a uid
 * somehow matches more than one authority's managerIds, the first match
 * (resolveAuthorityManagerScope's own `.limit(1)`, query order — not
 * significant) is used — same shape the client-side
 * getAuthoritiesByManager() callers already assume (`auths[0]`), and the
 * exact behavior this route had before migrating.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { countExcludingTestAndMock } from '@/lib/testAccountFilterAdmin';
import { isStrictDemoTenant } from '@/lib/demo';
import type { Firestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * db is injected (never calls getAdminDb() itself) so this is directly
 * testable against a real Firestore emulator — same DI shape as
 * computeCreateUnit/computePromoteWaitlist elsewhere in this codebase.
 */
export async function computeCitySummary(
  db: Firestore,
  uid: string,
  /** The authority on screen (honoured only for its own managers — authorityManagerScope.ts). */
  requestedAuthorityId?: string | null,
): Promise<
  | { status: 200; body: { authorityId: string; authorityName: string; totalUsers: number; approvedUsers: number } }
  | { status: 403; body: { error: string } }
> {
  const scope = await resolveAuthorityManagerScope(db, uid, requestedAuthorityId);
  if (!scope) {
    return { status: 403, body: { error: 'Not an authority manager' } };
  }
  const { authorityId } = scope;

  // One extra read vs. the old inline query (which got the doc data for
  // free from the same managerIds lookup) — the chokepoint only returns
  // {authorityId}, not the doc. Accepted trade-off: consistency with the
  // shared scope-resolution path across all 7 authority-manager routes is
  // worth one cheap doc get().
  const authorityDoc = await db.collection('authorities').doc(authorityId).get();
  const authorityData = authorityDoc.data();
  const rawName = authorityData?.name;
  const authorityName = typeof rawName === 'string' ? rawName : (rawName?.he || rawName?.en || '');

  const usersRef = db.collection('users').where('core.authorityId', '==', authorityId);
  const approvedRef = usersRef.where('core.isApproved', '==', true);

  // Demo/mock users (src/features/admin/services/demo-seed-sderot.ts tags
  // them core.isMockData: true) and test/dev accounts (core.isTestData,
  // see scripts/mark-test-accounts.ts) must not count as real residents —
  // see src/lib/testAccountFilterAdmin.ts for why this subtracts rather
  // than querying the exclusion directly (Firestore's `!=` would wrongly
  // exclude every doc where the field is simply absent).
  // Demo world: on a demo city the demo residents ARE the population.
  const authorityIsDemo = isStrictDemoTenant(authorityData, authorityId);
  const [totalUsers, approvedUsers] = await Promise.all([
    countExcludingTestAndMock(usersRef, { authorityIsDemo }),
    countExcludingTestAndMock(approvedRef, { authorityIsDemo }),
  ]);

  return {
    status: 200,
    body: { authorityId, authorityName, totalUsers, approvedUsers },
  };
}

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
    const result = await computeCitySummary(db, uid, request.nextUrl.searchParams.get('authorityId'));
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/authority-manager/city-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
