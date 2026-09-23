/**
 * GET /api/authority-manager/dashboard-summary
 *
 * Aggregate-only DAU/MAU/gender/age numbers for an authority manager's own
 * city. Same shape and reasoning as /api/authority-manager/city-summary
 * (see that route's header) — built to close a second instance of the same
 * gap: AnalyticsDashboard.tsx's client-side analytics.service.ts functions
 * (getDailyActiveUsers, getMonthlyActiveUsers, getGenderDistribution,
 * getAgeDistribution) read `users` and `workouts` directly from the
 * browser, both denied by firestore.rules for a real authority manager
 * (neither collection's read rule recognizes managerIds-based access —
 * only isRootAdmin()/isAdmin()). Because AnalyticsDashboard.loadAll() runs
 * every metric through one Promise.all, THIS ONE denial rejects the whole
 * batch — every KPI card, including ones with no relation to `users` or
 * `workouts` at all, renders at its zero-value initial state. Confirmed at
 * the emulator (00-MASTER-PLAN.md §13.11) before writing this route.
 *
 * Hard requirements (all enforced below, identical to city-summary):
 *   - Real Firebase ID token required. No token → 401.
 *   - authorityId is resolved SERVER-SIDE from managerIds. Never trusts a
 *     client-supplied authorityId — there isn't even a place to send one.
 *   - uid not present in any authority's managerIds → 403.
 *   - Response is aggregate numbers only — no resident name, email, uid,
 *     or any other per-person field ever leaves this route.
 *   - Demo/mock residents (core.isMockData) and test/dev accounts
 *     (core.isTestData — see src/lib/testAccountFilter.ts) are excluded
 *     from every count, same convention as city-summary.
 *
 * Deliberately NOT doing city-summary's mock-count-and-subtract dance —
 * this route already fetches full user docs (unavoidable: gender/age
 * distribution needs per-doc fields, not just a count), so mock docs are
 * filtered out of the in-memory array directly instead.
 *
 * Deliberately NOT rolling up child neighborhoods the way the CLIENT-side
 * analytics.service.ts does (getAuthorityWithChildrenIds) — city-summary,
 * the pattern this route follows, doesn't either. A level-1 manager's own
 * authority is what's resolved and used, full stop; documented as a scope
 * limitation, not silently different behavior.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { Timestamp } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

    const managedSnap = await db
      .collection('authorities')
      .where('managerIds', 'array-contains', uid)
      .limit(1)
      .get();

    if (managedSnap.empty) {
      return NextResponse.json({ error: 'Not an authority manager' }, { status: 403 });
    }

    const authorityId = managedSnap.docs[0].id;

    // One fetch of all real (non-mock) resident docs for this authority —
    // reused for gender/age distribution AND to build the uid list DAU/MAU
    // query the workouts collection with. Mirrors getUserDocsForAuthority's
    // single-fetch shape (analytics.service.ts) — just server-side.
    const usersSnap = await db
      .collection('users')
      .where('core.authorityId', '==', authorityId)
      .get();

    const genderDistribution = { male: 0, female: 0, other: 0, unknown: 0, total: 0 };
    const ageDistribution = { '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '56+': 0, unknown: 0, total: 0 };
    const residentUids: string[] = [];
    const currentYear = new Date().getFullYear();

    usersSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const core = data?.core ?? {};
      if (isTestOrMockUser(core)) return; // demo + test residents excluded, same as city-summary

      residentUids.push(docSnap.id);

      const gender = core.gender as string | undefined;
      if (gender === 'male') genderDistribution.male++;
      else if (gender === 'female') genderDistribution.female++;
      else if (gender) genderDistribution.other++;
      else genderDistribution.unknown++;
      genderDistribution.total++;

      const birthDate = core.birthDate;
      let birthYear: number | null = null;
      if (birthDate) {
        if (typeof birthDate === 'string') {
          const parsed = new Date(birthDate);
          if (!isNaN(parsed.getTime())) birthYear = parsed.getFullYear();
        } else if (typeof birthDate?.toDate === 'function') {
          birthYear = birthDate.toDate().getFullYear();
        } else if (birthDate instanceof Date) {
          birthYear = birthDate.getFullYear();
        }
      }
      if (birthYear == null) {
        ageDistribution.unknown++;
      } else {
        const age = currentYear - birthYear;
        if (age >= 18 && age <= 25) ageDistribution['18-25']++;
        else if (age >= 26 && age <= 35) ageDistribution['26-35']++;
        else if (age >= 36 && age <= 45) ageDistribution['36-45']++;
        else if (age >= 46 && age <= 55) ageDistribution['46-55']++;
        else if (age >= 56) ageDistribution['56+']++;
        else ageDistribution.unknown++; // age < 18
      }
      ageDistribution.total++;
    });

    // DAU/MAU — one pass over the current month's workouts covers both
    // (DAU's day is a subset of MAU's month), instead of two separate
    // chunked query rounds.
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    const dailyActive = new Set<string>();
    const monthlyActive = new Set<string>();

    if (residentUids.length > 0) {
      await Promise.all(chunk(residentUids, 30).map(async (batch) => {
        const snap = await db
          .collection('workouts')
          .where('userId', 'in', batch)
          .where('date', '>=', Timestamp.fromDate(startOfMonth))
          .where('date', '<=', Timestamp.fromDate(endOfMonth))
          .get();
        snap.docs.forEach((d) => {
          const wData = d.data();
          const workoutUid = wData.userId as string;
          monthlyActive.add(workoutUid);
          const workoutDate: Date = wData.date?.toDate?.() ?? new Date(wData.date);
          if (workoutDate >= startOfDay && workoutDate <= endOfDay) {
            dailyActive.add(workoutUid);
          }
        });
      }));
    }

    return NextResponse.json({
      authorityId,
      dau: dailyActive.size,
      mau: monthlyActive.size,
      genderDistribution,
      ageDistribution,
    });
  } catch (err: any) {
    console.error('[/api/authority-manager/dashboard-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
