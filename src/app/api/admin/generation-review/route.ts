/**
 * GET /api/admin/generation-review?days=14 — the "בקרת אימונים ומסלולים" panel: daily stats per
 * rule and per generator for the last N days + the flagged sessions in that window (newest
 * first, ≤ 300). Super admin only, read-only. No uid / name is returned — the log id is the
 * handle the actions route needs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getIsraelDateKey } from '@/lib/israelTime';
import { GENERATION_REVIEWS, GENERATION_REVIEW_STATS } from '@/lib/generation-review/types';
import { sumDeltas, type GenStatsDelta } from '@/lib/generation-review/review/stats';
import { toFlaggedRow } from '@/lib/generation-review/review/list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 14, 1), 60);
    const now = Date.now();
    const db = getAdminDb();
    const dayKeys = Array.from({ length: days }, (_, i) => getIsraelDateKey(new Date(now - i * DAY_MS)));
    const statSnaps = await db.getAll(...dayKeys.map((d) => db.collection(GENERATION_REVIEW_STATS).doc(d)));
    const dayDocs = statSnaps.filter((s) => s.exists).map((s) => ({ day: s.id, ...(s.data() as Partial<GenStatsDelta>) }));
    const rSnap = await db
      .collection(GENERATION_REVIEWS)
      .where('createdAt', '>=', Timestamp.fromMillis(now - days * DAY_MS))
      .orderBy('createdAt', 'desc')
      .limit(300)
      .get();
    return NextResponse.json({
      days,
      summary: sumDeltas(dayDocs),
      trend: dayDocs
        .map((d) => ({ day: d.day, sessions: d.sessions ?? 0, flagged: d.flagged ?? 0, reports: d.reports ?? 0 }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      rows: rSnap.docs.map((d) => toFlaggedRow(d.id, d.data())),
    });
  } catch (err) {
    console.error('[generation-review/list] failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
