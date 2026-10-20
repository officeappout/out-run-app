/**
 * GET /api/authority-manager/city-week[?authorityId=] — "השבוע ב<עיר>" for the
 * city dashboard: active residents + workouts (this week vs last), busiest
 * and quiet parks (visits in 30 days), open maintenance reports and their age.
 *
 * Who: an authority manager gets their own city (resolveAuthorityManagerScope,
 * the query param is ignored); OUT platform staff (super/system admin) may
 * name any authority via ?authorityId=. Everyone else: 403.
 * Reads mirror /api/authority-manager/city-aggregates (city + child
 * neighborhoods; real residents only).
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { resolveAdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isExcludedResident } from '@/lib/testAccountFilter';
import { isStrictDemoTenant } from '@/lib/demo';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';
import { computeCityWeek, type CityParkVisit, type CityReport, type CityWorkout } from '@/features/admin/services/city-week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = new Set(['reported', 'in_review', 'in_progress']);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date })?.toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

async function cityAndChildren(db: Firestore, authorityId: string): Promise<string[]> {
  const snap = await db.collection('authorities').where('parentAuthorityId', '==', authorityId).get();
  return [authorityId, ...snap.docs.filter((d) => !d.id.includes('__SCHEMA_INIT__')).map((d) => d.id)];
}

export async function computeCityWeekForAuthority(db: Firestore, authorityId: string, now = new Date()) {
  const authSnap = await db.collection('authorities').doc(authorityId).get();
  if (!authSnap.exists) return { status: 404 as const, body: { error: 'הרשות לא נמצאה.' } };
  const authorityName = (authSnap.data()?.name as string) || authorityId;
  // Demo world: demo residents count only on a demo city's own week.
  const authorityIsDemo = isStrictDemoTenant(authSnap.data(), authorityId);
  const ids = await cityAndChildren(db, authorityId);
  const since14 = new Date(now.getTime() - 14 * DAY);
  const since30 = new Date(now.getTime() - 30 * DAY);

  // residents (real accounts)
  const residentUids: string[] = [];
  await Promise.all(chunk(ids, 30).map(async (b) => {
    const s = await db.collection('users').where('core.authorityId', 'in', b).get();
    s.docs.forEach((d) => { if (!isExcludedResident(d.data()?.core, { authorityIsDemo, uid: d.id })) residentUids.push(d.id); });
  }));

  // their real workouts in the last 14 days (filtered in memory: no composite index needed)
  const workouts: CityWorkout[] = [];
  await Promise.all(chunk(residentUids, 30).map(async (b) => {
    const s = await db.collection('workouts').where('userId', 'in', b).get();
    s.docs.forEach((w) => {
      const data = w.data();
      const at = toDateSafe(data.date);
      if (at && at >= since14 && isRealWorkoutCompletion(data)) workouts.push({ uid: data.userId, at });
    });
  }));

  // parks + park visits (sessions written at workout completion near a park)
  const parks: { id: string; name: string }[] = [];
  const visits: CityParkVisit[] = [];
  await Promise.all(chunk(ids, 30).map(async (b) => {
    const [p, s] = await Promise.all([
      db.collection('parks').where('authorityId', 'in', b).get(),
      db.collection('sessions').where('authorityId', 'in', b).get(),
    ]);
    p.docs.forEach((d) => { if (d.data()?.published !== false) parks.push({ id: d.id, name: (d.data()?.name as string) || d.id }); });
    s.docs.forEach((d) => {
      const data = d.data();
      const at = toDateSafe(data.date);
      if (at && at >= since30 && typeof data.parkId === 'string') visits.push({ parkId: data.parkId, at });
    });
  }));

  // maintenance reports
  const reports: CityReport[] = [];
  await Promise.all(chunk(ids, 30).map(async (b) => {
    const s = await db.collection('maintenance_reports').where('authorityId', 'in', b).get();
    s.docs.forEach((d) => {
      const data = d.data();
      const at = toDateSafe(data.reportedAt);
      if (at) reports.push({ id: d.id, reportedAt: at, open: OPEN_STATUSES.has(data.status ?? 'reported') });
    });
  }));

  return { status: 200 as const, body: computeCityWeek({ authorityId, authorityName, workouts, visits, parks, reports }, now) };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(idToken, true)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();
    const managerScope = await resolveAuthorityManagerScope(db, uid);
    let authorityId: string | null = managerScope?.authorityId ?? null;
    if (!authorityId) {
      // OUT staff viewing a city
      const platform = await resolveAdminAnalyticsScope(uid);
      const requested = request.nextUrl.searchParams.get('authorityId');
      if (platform.kind === 'platform' && requested) authorityId = requested;
    }
    if (!authorityId) return NextResponse.json({ error: 'אין לך הרשאה לנתוני הרשות הזו.' }, { status: 403 });

    const result = await computeCityWeekForAuthority(db, authorityId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[/api/authority-manager/city-week] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
