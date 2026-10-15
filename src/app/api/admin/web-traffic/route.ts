/**
 * GET /api/admin/web-traffic?from=YYYY-MM-DD&to=YYYY-MM-DD — the marketing
 * site's traffic for the /admin/web-traffic screen, summed from the daily
 * rollups in `web_daily_stats` (written by /api/telemetry/web). Also returns
 * the previous period of the same length, for the deltas.
 *
 * Gated to the marketing section (`requireSection(req, 'marketing')`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireSection } from '@/lib/api-auth';
import { fromKey, type WebDailyStats } from '@/features/web-traffic/web-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAPS = [
  'byPath',
  'bySource',
  'byMedium',
  'byCampaign',
  'byLanding',
  'byDevice',
  'byCountry',
  'byLocale',
  'ctaByTarget',
  'ctaByPath',
  'scrollByDepth',
  'byHour',
] as const;
type MapKey = (typeof MAPS)[number];

const shiftDay = (day: string, days: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);

async function readRange(from: string, to: string): Promise<WebDailyStats[]> {
  const snap = await getAdminDb()
    .collection('web_daily_stats')
    .where(FieldPath.documentId(), '>=', from)
    .where(FieldPath.documentId(), '<=', to)
    .get();
  return snap.docs.map((d) => ({ ...(d.data() as WebDailyStats), date: d.id }));
}

function sum(days: WebDailyStats[]) {
  const totals = { sessions: 0, pageviews: 0, cta: 0, downloads: 0 };
  const maps = Object.fromEntries(MAPS.map((m) => [m, {} as Record<string, number>])) as Record<MapKey, Record<string, number>>;
  for (const d of days) {
    totals.sessions += d.sessions ?? 0;
    totals.pageviews += d.pageviews ?? 0;
    totals.cta += d.ctaTotal ?? 0;
    const t = d.ctaByTarget ?? {};
    totals.downloads += (t.appstore ?? 0) + (t.play ?? 0) + (t.onelink ?? 0);
    for (const m of MAPS) {
      for (const [k, v] of Object.entries(d[m] ?? {})) maps[m][k] = (maps[m][k] ?? 0) + (v ?? 0);
    }
  }
  return { totals, maps };
}

const top = (m: Record<string, number>, n = 10) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, value]) => ({ key, label: fromKey(key), value }));

export async function GET(request: NextRequest) {
  const denied = await requireSection(request, 'marketing');
  if (denied) return denied;

  const url = new URL(request.url);
  const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get('from') ?? shiftDay(to, -29);
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to || daysBetween(from, to) > 366) {
    return NextResponse.json({ error: 'טווח תאריכים לא תקין.' }, { status: 400 });
  }

  try {
    const span = daysBetween(from, to) + 1;
    const prevTo = shiftDay(from, -1);
    const prevFrom = shiftDay(prevTo, -(span - 1));
    const [days, prevDays] = await Promise.all([readRange(from, to), readRange(prevFrom, prevTo)]);
    const cur = sum(days);
    const prev = sum(prevDays);

    // a point for every day in range (zeros where nothing came in)
    const byDate = new Map(days.map((d) => [d.date, d]));
    const series = Array.from({ length: span }, (_, i) => {
      const date = shiftDay(from, i);
      const d = byDate.get(date);
      return { date, sessions: d?.sessions ?? 0, pageviews: d?.pageviews ?? 0, cta: d?.ctaTotal ?? 0 };
    });

    return NextResponse.json({
      range: { from, to, prevFrom, prevTo },
      totals: cur.totals,
      previous: prev.totals,
      series,
      top: {
        sources: top(cur.maps.bySource),
        mediums: top(cur.maps.byMedium),
        campaigns: top(cur.maps.byCampaign),
        landing: top(cur.maps.byLanding),
        pages: top(cur.maps.byPath, 12),
        ctaTargets: top(cur.maps.ctaByTarget),
        ctaPages: top(cur.maps.ctaByPath),
        devices: top(cur.maps.byDevice),
        countries: top(cur.maps.byCountry),
        locales: top(cur.maps.byLocale),
      },
      scroll: cur.maps.scrollByDepth,
      hours: cur.maps.byHour,
    });
  } catch (err: any) {
    console.error('[/api/admin/web-traffic] error:', err?.message ?? err);
    return NextResponse.json({ error: 'שגיאה בטעינת הנתונים.' }, { status: 500 });
  }
}
