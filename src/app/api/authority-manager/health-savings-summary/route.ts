/**
 * GET /api/authority-manager/health-savings-summary
 *
 * Server-side fallback for getWHO150Tracker + getHealthSavings +
 * getSavingsOverTime (src/features/admin/services/health-economics.service.ts)
 * — the first of 2 fast-follow routes to PR #206 (same root cause: these 3
 * functions all resolve their user scope via getAuthorityUsers, which reads
 * `users` directly from the browser and is denied by firestore.rules for a
 * real authority manager; both `workouts`, the second collection all three
 * read, has the exact same gap). See dashboard-summary/route.ts's header
 * for the full general shape of the problem this closes.
 *
 * Grouped into one route (not three) because all three derive from the same
 * underlying data — bulk workout-minutes per user per time window — and are
 * always requested together inside AnalyticsDashboard.loadAll()'s single
 * Promise.all. getWHO150Tracker and getHealthSavings additionally share the
 * EXACT SAME current-week query (confirmed in the client source — both call
 * getBulkWorkoutMinutes with the same getWeekRange(now) window), so this
 * route computes that once and reuses it for both.
 *
 * Hard requirements (identical to dashboard-summary/city-aggregates/etc.):
 *   - Real Firebase ID token required. No token → 401.
 *   - authorityId resolved SERVER-SIDE from managerIds (shared
 *     resolveAuthorityManagerScope helper). Never trusts a client-supplied
 *     authorityId.
 *   - uid not present in any authority's managerIds → 403.
 *   - Response is aggregate numbers only — no resident name, email, uid, or
 *     any other per-person field ever leaves this route.
 *   - Demo/mock (core.isMockData) and test/dev (core.isTestData) residents
 *     excluded from the resolved scope, same as getAuthorityUsers.
 *
 * Deliberately DOES roll up child neighborhoods — getAuthorityUsers already
 * does (via getAuthorityWithChildrenIds), so this is a straight port, not a
 * deviation from any convention (unlike dashboard-summary's documented
 * no-rollup choice for a different set of metrics).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WHO_WEEKLY_TARGET_MINUTES = 150;
const AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON = 500;
const MONTH_NAMES_HE = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(year, month + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Admin-SDK port of getAuthorityUsers (children rollup + mock/test exclusion). */
async function resolveAuthorityUserIds(db: Firestore, authorityId: string): Promise<string[]> {
  const childrenSnap = await db.collection('authorities').where('parentAuthorityId', '==', authorityId).get();
  const authorityIds = [
    authorityId,
    ...childrenSnap.docs
      .filter((d) => !d.id.includes('__SCHEMA_INIT__') && d.data()?.name !== '__SCHEMA_INIT__')
      .map((d) => d.id),
  ];

  const userIds: string[] = [];
  await Promise.all(chunk(authorityIds, 30).map(async (batch) => {
    const snap = await db.collection('users').where('core.authorityId', 'in', batch).get();
    snap.docs.forEach((d) => {
      if (!isTestOrMockUser(d.data()?.core)) userIds.push(d.id);
    });
  }));
  return userIds;
}

/** Admin-SDK port of getBulkWorkoutMinutes. */
async function getBulkWorkoutMinutes(db: Firestore, userIds: string[], start: Date, end: Date): Promise<Map<string, number>> {
  const userMinutes = new Map<string, number>();
  if (userIds.length === 0) return userMinutes;

  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  await Promise.all(chunk(userIds, 30).map(async (batch) => {
    const snap = await db
      .collection('workouts')
      .where('userId', 'in', batch)
      .where('date', '>=', startTs)
      .where('date', '<=', endTs)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      const userId = data?.userId as string | undefined;
      if (userId) {
        userMinutes.set(userId, (userMinutes.get(userId) ?? 0) + (data?.duration ?? 0) / 60);
      }
    });
  }));
  return userMinutes;
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

    const db: Firestore = getAdminDb();
    const scope = await resolveAuthorityManagerScope(db, uid);
    if (!scope) {
      return NextResponse.json({ error: 'Not an authority manager' }, { status: 403 });
    }
    const { authorityId } = scope;

    const url = new URL(request.url);
    const months = Math.max(1, Math.min(36, Number(url.searchParams.get('months')) || 12));

    const now = new Date();
    const weekRange = getWeekRange(now);

    const userIds = await resolveAuthorityUserIds(db, authorityId);

    if (userIds.length === 0) {
      return NextResponse.json({
        who150Tracker: {
          totalUsers: 0, usersReachingGoal: 0, percentageReachingGoal: 0,
          averageMinutesPerUser: 0, currentWeek: weekRange,
        },
        healthSavings: {
          totalUsers: 0, activeUsers: 0, estimatedMonthlySavings: 0, estimatedYearlySavings: 0,
          savingsPerActiveUser: AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON,
          currentMonth: { year: now.getFullYear(), month: now.getMonth() },
        },
        savingsOverTime: [],
      });
    }

    // Current-week bulk minutes — shared by WHO-150 tracker AND health savings.
    const currentWeekMinutes = await getBulkWorkoutMinutes(db, userIds, weekRange.start, weekRange.end);

    let totalMinutes = 0;
    let usersReachingGoal = 0;
    for (const userId of userIds) {
      const mins = currentWeekMinutes.get(userId) ?? 0;
      totalMinutes += mins;
      if (mins >= WHO_WEEKLY_TARGET_MINUTES) usersReachingGoal++;
    }
    const who150Tracker = {
      totalUsers: userIds.length,
      usersReachingGoal,
      percentageReachingGoal: Math.round((usersReachingGoal / userIds.length) * 1000) / 10,
      averageMinutesPerUser: Math.round((totalMinutes / userIds.length) * 10) / 10,
      currentWeek: weekRange,
    };

    const activeUsers = Array.from(currentWeekMinutes.values()).filter((m) => m >= WHO_WEEKLY_TARGET_MINUTES).length;
    const estimatedMonthlySavings = activeUsers * AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON;
    const healthSavings = {
      totalUsers: userIds.length,
      activeUsers,
      estimatedMonthlySavings: Math.round(estimatedMonthlySavings),
      estimatedYearlySavings: Math.round(estimatedMonthlySavings * 12),
      savingsPerActiveUser: AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON,
      currentMonth: { year: now.getFullYear(), month: now.getMonth() },
    };

    // Savings over time — `months` independent parallel month-windows.
    const savingsOverTime = await Promise.all(
      Array.from({ length: months }, async (_unused, i) => {
        const targetDate = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
        const monthRange = getMonthRange(targetDate.getFullYear(), targetDate.getMonth());
        const minutesMap = await getBulkWorkoutMinutes(db, userIds, monthRange.start, monthRange.end);
        const monthActiveUsers = Array.from(minutesMap.values()).filter((m) => m >= WHO_WEEKLY_TARGET_MINUTES).length;
        const savings = monthActiveUsers * AVERAGE_HEALTH_SAVINGS_PER_ACTIVE_PERSON;
        const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = `${MONTH_NAMES_HE[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
        return { month: monthKey, monthLabel, savings: Math.round(savings), activeUsers: monthActiveUsers };
      })
    );

    return NextResponse.json({ who150Tracker, healthSavings, savingsOverTime });
  } catch (err: any) {
    console.error('[/api/authority-manager/health-savings-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
