/**
 * GET /api/authority-manager/who-compliance-summary
 *
 * Server-side fallback for getWHOComplianceBreakdown + getWHOComplianceOverTime
 * (src/features/admin/services/health-economics.service.ts) — the second of
 * 2 fast-follow routes to PR #206. Same root cause as
 * health-savings-summary/route.ts (see that file's header): both functions
 * resolve their user scope via getAuthorityUsers, denied by firestore.rules
 * for a real authority manager; the second collection they read,
 * `dailyActivity`, has the exact same gap.
 *
 * Separate route from health-savings-summary, not folded together, because
 * these two read a DIFFERENT collection (`dailyActivity`, not `workouts`)
 * and compute a materially different metric (the real 2-condition WHO
 * guideline — aerobic minutes AND >=2 strength days — vs. the simpler
 * single-threshold tracker the other route covers). Grouped with EACH OTHER
 * because getWHOComplianceOverTime is literally N repeated calls to the same
 * per-week computation getWHOComplianceBreakdown does once.
 *
 * Hard requirements (identical to every route in this family):
 *   - Real Firebase ID token required. No token → 401.
 *   - authorityId resolved SERVER-SIDE from managerIds. Never trusts a
 *     client-supplied authorityId.
 *   - uid not present in any authority's managerIds → 403.
 *   - Response is aggregate numbers only — no resident name, email, uid, or
 *     any other per-person field ever leaves this route.
 *   - Demo/mock and test/dev residents excluded, same as getAuthorityUsers.
 *
 * Deliberately DOES roll up child neighborhoods — same reasoning as
 * health-savings-summary/route.ts (getAuthorityUsers already does).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { type Firestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WHO_WEEKLY_TARGET_MINUTES = 150;
const STREAK_MINIMUM_MINUTES = 10;
const MAX_TREND_WEEKS = 26;

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

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Admin-SDK port of getAuthorityUsers. */
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

interface WeeklyActivityAgg {
  aerobicMinutes: number;
  strengthDays: number;
}

/** Admin-SDK port of getBulkWeeklyActivity. */
async function getBulkWeeklyActivity(db: Firestore, userIds: string[], start: Date, end: Date): Promise<Map<string, WeeklyActivityAgg>> {
  const result = new Map<string, WeeklyActivityAgg>();
  if (userIds.length === 0) return result;

  const startStr = toDateStr(start);
  const endStr = toDateStr(end);

  await Promise.all(chunk(userIds, 30).map(async (batch) => {
    const snap = await db
      .collection('dailyActivity')
      .where('userId', 'in', batch)
      .where('date', '>=', startStr)
      .where('date', '<=', endStr)
      .get();
    snap.docs.forEach((d) => {
      const data = d.data();
      const userId = data?.userId as string | undefined;
      if (!userId) return;
      const strengthMin: number = data?.categories?.strength?.minutes ?? 0;
      const cardioMin: number = data?.categories?.cardio?.minutes ?? 0;
      const entry = result.get(userId) ?? { aerobicMinutes: 0, strengthDays: 0 };
      entry.aerobicMinutes += strengthMin + cardioMin;
      if (strengthMin >= STREAK_MINIMUM_MINUTES) entry.strengthDays += 1;
      result.set(userId, entry);
    });
  }));
  return result;
}

/** Admin-SDK port of classifyCompliance. */
function classifyCompliance(userIds: string[], activityMap: Map<string, WeeklyActivityAgg>) {
  let usersCompliant = 0, usersMeetingAerobicOnly = 0, usersMeetingStrengthOnly = 0, totalAerobicMinutes = 0;

  for (const userId of userIds) {
    const entry = activityMap.get(userId) ?? { aerobicMinutes: 0, strengthDays: 0 };
    totalAerobicMinutes += entry.aerobicMinutes;
    const aerobicMet = entry.aerobicMinutes >= WHO_WEEKLY_TARGET_MINUTES;
    const strengthMet = entry.strengthDays >= 2;
    if (aerobicMet && strengthMet) usersCompliant++;
    else if (aerobicMet) usersMeetingAerobicOnly++;
    else if (strengthMet) usersMeetingStrengthOnly++;
  }

  return { usersCompliant, usersMeetingAerobicOnly, usersMeetingStrengthOnly, totalAerobicMinutes };
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
    const weeksRaw = Number(url.searchParams.get('weeks')) || 8;
    const weeks = Math.max(1, Math.min(weeksRaw, MAX_TREND_WEEKS));

    const now = new Date();
    const currentWeekRange = getWeekRange(now);

    const userIds = await resolveAuthorityUserIds(db, authorityId);

    const emptyBreakdown = {
      totalUsers: 0, usersCompliant: 0, percentageCompliant: 0,
      usersMeetingAerobicOnly: 0, usersMeetingStrengthOnly: 0,
      averageAerobicMinutes: 0, currentWeek: currentWeekRange,
    };

    if (userIds.length === 0) {
      return NextResponse.json({ breakdown: emptyBreakdown, trend: [] });
    }

    const currentActivityMap = await getBulkWeeklyActivity(db, userIds, currentWeekRange.start, currentWeekRange.end);
    const currentClassified = classifyCompliance(userIds, currentActivityMap);
    const breakdown = {
      totalUsers: userIds.length,
      usersCompliant: currentClassified.usersCompliant,
      percentageCompliant: Math.round((currentClassified.usersCompliant / userIds.length) * 1000) / 10,
      usersMeetingAerobicOnly: currentClassified.usersMeetingAerobicOnly,
      usersMeetingStrengthOnly: currentClassified.usersMeetingStrengthOnly,
      averageAerobicMinutes: Math.round((currentClassified.totalAerobicMinutes / userIds.length) * 10) / 10,
      currentWeek: currentWeekRange,
    };

    const trend = await Promise.all(
      Array.from({ length: weeks }, async (_unused, i) => {
        const weekStart = new Date(currentWeekRange.start);
        weekStart.setDate(weekStart.getDate() - (weeks - 1 - i) * 7);
        const weekRange = getWeekRange(weekStart);
        const activityMap = await getBulkWeeklyActivity(db, userIds, weekRange.start, weekRange.end);
        const { usersCompliant, totalAerobicMinutes } = classifyCompliance(userIds, activityMap);
        const weekLabel = `${String(weekRange.start.getDate()).padStart(2, '0')}/${String(weekRange.start.getMonth() + 1).padStart(2, '0')}`;
        return {
          weekLabel,
          weekStart: toDateStr(weekRange.start),
          percentageCompliant: Math.round((usersCompliant / userIds.length) * 1000) / 10,
          averageAerobicMinutes: Math.round((totalAerobicMinutes / userIds.length) * 10) / 10,
          totalUsers: userIds.length,
        };
      })
    );

    return NextResponse.json({ breakdown, trend });
  } catch (err: any) {
    console.error('[/api/authority-manager/who-compliance-summary] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
