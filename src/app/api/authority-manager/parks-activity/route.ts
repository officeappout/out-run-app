/**
 * GET /api/authority-manager/parks-activity[?authorityId=] — per park of the
 * city: workouts in the last 30 days, the latest visit, open maintenance
 * reports. Feeds the city's park list (which park is busy, quiet, broken).
 * Same access rule as /api/authority-manager/city-week.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { resolveAdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { computeParkActivity, type CityParkVisit } from '@/features/admin/services/city-week';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    let authorityId: string | null = (await resolveAuthorityManagerScope(db, uid, request.nextUrl.searchParams.get('authorityId')))?.authorityId ?? null;
    if (!authorityId) {
      const platform = await resolveAdminAnalyticsScope(uid);
      const requested = request.nextUrl.searchParams.get('authorityId');
      if (platform.kind === 'platform' && requested) authorityId = requested;
    }
    if (!authorityId) return NextResponse.json({ error: 'אין לך הרשאה לנתוני הרשות הזו.' }, { status: 403 });

    const ids = await cityAndChildren(db, authorityId);
    const visits: CityParkVisit[] = [];
    const openReports: { parkId: string }[] = [];
    await Promise.all(chunk(ids, 30).map(async (b) => {
      const [sessions, reports] = await Promise.all([
        db.collection('sessions').where('authorityId', 'in', b).get(),
        db.collection('maintenance_reports').where('authorityId', 'in', b).get(),
      ]);
      sessions.docs.forEach((d) => {
        const data = d.data();
        const at = toDateSafe(data.date);
        if (at && typeof data.parkId === 'string') visits.push({ parkId: data.parkId, at });
      });
      reports.docs.forEach((d) => {
        const data = d.data();
        if (OPEN_STATUSES.has(data.status ?? 'reported') && typeof data.parkId === 'string') openReports.push({ parkId: data.parkId });
      });
    }));

    return NextResponse.json({ authorityId, byPark: computeParkActivity(visits, openReports) });
  } catch (err) {
    console.error('[/api/authority-manager/parks-activity] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
