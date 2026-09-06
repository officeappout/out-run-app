/**
 * Link Stats — read side (client SDK, imported by the per-link admin
 * analytics page). Write side lives in `link-stats-write.ts` (Admin SDK,
 * server-only, imported by `link-click-handler.ts`) — kept separate so
 * this file, and everything that imports it, never bundles `firebase-admin`.
 *
 * Why a rollup, not just the raw click records: `marketing_links/{id}/clicks`
 * has a 30-day TTL (see `link-click-handler.ts`) — fine for per-click detail
 * (future install/user matching), wrong for "compare this season to last
 * year" trend questions. `marketing_links/{id}/daily_stats/{YYYY-MM-DD}`
 * has NO TTL and is cheap to write (one extra merge-update per click,
 * alongside the click record already being written, batched together —
 * see `link-click-handler.ts`) — so all the aggregate breakdowns below
 * (device/hour/day-of-week/country/city/daily trend) read from these
 * permanent rollups and are never limited to 30 days. Only CSV export of
 * individual click rows is TTL-bounded, because only the raw click
 * records carry that level of detail.
 *
 * Timezone: hour-of-day and day-of-week are bucketed in Israel local time
 * (Asia/Jerusalem, DST-aware via Intl, see `link-stats-write.ts`), not
 * UTC/server time — "most scans are in the evening" is a claim about when
 * people are actually out at the park, which only means something in
 * local time.
 */

import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DAILY_STATS_SUBCOLLECTION } from '@/features/admin/services/link-stats-write';

export const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// ─── Read side: fetch daily rollups ─────────────────────────────────────────

export interface DailyStatsDoc {
  date: string;
  total: number;
  byDevice: Partial<Record<'ios' | 'android' | 'desktop', number>>;
  byHour: Partial<Record<string, number>>;
  byDayOfWeek: Partial<Record<string, number>>;
  byCountry: Partial<Record<string, number>>;
  byCity: Partial<Record<string, number>>;
}

function rowToDailyStats(id: string, data: Record<string, unknown>): DailyStatsDoc {
  return {
    date: typeof data.date === 'string' ? data.date : id,
    total: typeof data.total === 'number' ? data.total : 0,
    byDevice: (data.byDevice as DailyStatsDoc['byDevice']) ?? {},
    byHour: (data.byHour as DailyStatsDoc['byHour']) ?? {},
    byDayOfWeek: (data.byDayOfWeek as DailyStatsDoc['byDayOfWeek']) ?? {},
    byCountry: (data.byCountry as DailyStatsDoc['byCountry']) ?? {},
    byCity: (data.byCity as DailyStatsDoc['byCity']) ?? {},
  };
}

/**
 * Reads every daily rollup doc in [fromDateKey, toDateKey] (inclusive,
 * 'YYYY-MM-DD' strings — Israel-local dates, matching
 * `link-stats-write.ts`'s `getIsraelDateKey`). One read per day in range —
 * fine at this product's volume; if the range ever needs to span years
 * routinely, a monthly rollup tier would be the next step (not built now
 * — no current need).
 */
export async function getDailyStatsRange(
  linkId: string,
  fromDateKey: string,
  toDateKey: string,
): Promise<DailyStatsDoc[]> {
  const q = query(
    collection(db, 'marketing_links', linkId, DAILY_STATS_SUBCOLLECTION),
    where('date', '>=', fromDateKey),
    where('date', '<=', toDateKey),
    orderBy('date', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => rowToDailyStats(d.id, d.data() as Record<string, unknown>));
}

// ─── Aggregation (pure — the actual report shape the UI renders) ──────────

export interface AggregatedLinkStats {
  totalScans: number;
  byDevice: { device: string; count: number; pct: number }[];
  byHour: { hour: number; count: number; pct: number }[]; // always 24 entries, 0-23
  byDayOfWeek: { dayIndex: number; dayLabel: string; count: number; pct: number }[]; // always 7, Sun-Sat
  byCountry: { country: string; count: number; pct: number }[]; // sorted desc
  byCity: { city: string; count: number; pct: number }[]; // sorted desc
  dailyTrend: { date: string; count: number }[]; // sorted asc by date
}

function pct(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 1000) / 10;
}

function sumMaps(docs: DailyStatsDoc[], key: 'byDevice' | 'byHour' | 'byDayOfWeek' | 'byCountry' | 'byCity'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) {
    for (const [k, v] of Object.entries(d[key])) {
      out[k] = (out[k] ?? 0) + (v ?? 0);
    }
  }
  return out;
}

/** Pure — takes the daily docs already fetched, returns the final report shape. No Firestore here. */
export function aggregateDailyStats(docs: DailyStatsDoc[]): AggregatedLinkStats {
  const totalScans = docs.reduce((sum, d) => sum + d.total, 0);

  const deviceTotals = sumMaps(docs, 'byDevice');
  const byDevice = (['ios', 'android', 'desktop'] as const).map((device) => ({
    device,
    count: deviceTotals[device] ?? 0,
    pct: pct(deviceTotals[device] ?? 0, totalScans),
  }));

  const hourTotals = sumMaps(docs, 'byHour');
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: hourTotals[String(hour)] ?? 0,
    pct: pct(hourTotals[String(hour)] ?? 0, totalScans),
  }));

  const dowTotals = sumMaps(docs, 'byDayOfWeek');
  const byDayOfWeek = Array.from({ length: 7 }, (_, dayIndex) => ({
    dayIndex,
    dayLabel: DAY_NAMES_HE[dayIndex],
    count: dowTotals[String(dayIndex)] ?? 0,
    pct: pct(dowTotals[String(dayIndex)] ?? 0, totalScans),
  }));

  const countryTotals = sumMaps(docs, 'byCountry');
  const byCountry = Object.entries(countryTotals)
    .map(([country, count]) => ({ country, count, pct: pct(count, totalScans) }))
    .sort((a, b) => b.count - a.count);

  const cityTotals = sumMaps(docs, 'byCity');
  const byCity = Object.entries(cityTotals)
    .map(([city, count]) => ({ city, count, pct: pct(count, totalScans) }))
    .sort((a, b) => b.count - a.count);

  const dailyTrend = docs
    .map((d) => ({ date: d.date, count: d.total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { totalScans, byDevice, byHour, byDayOfWeek, byCountry, byCity, dailyTrend };
}

// ─── CSV export (pure formatting; raw click records, TTL-bounded) ─────────

export interface ClickRecordRow {
  clickId: string;
  timestamp: Date | null;
  device: string;
  country: string | null;
  city: string | null;
  referrer: string | null;
  userAgent: string | null;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Pure — given rows already fetched, returns the CSV text. */
export function buildClickRecordsCsv(rows: ClickRecordRow[]): string {
  const header = ['click_id', 'timestamp', 'device', 'country', 'city', 'referrer', 'user_agent'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.clickId,
      row.timestamp ? row.timestamp.toISOString() : '',
      row.device,
      row.country ?? '',
      row.city ?? '',
      row.referrer ?? '',
      row.userAgent ?? '',
    ].map((v) => csvEscape(String(v))).join(','));
  }
  return lines.join('\n');
}

/** Reads raw click records in range — bounded by the 30-day TTL on the collection. */
export async function getClickRecordsRange(
  linkId: string,
  fromDate: Date,
  toDate: Date,
): Promise<ClickRecordRow[]> {
  const q = query(
    collection(db, 'marketing_links', linkId, 'clicks'),
    where('timestamp', '>=', Timestamp.fromDate(fromDate)),
    where('timestamp', '<=', Timestamp.fromDate(toDate)),
    orderBy('timestamp', 'asc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      clickId: typeof data.clickId === 'string' ? data.clickId : d.id,
      timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : null,
      device: typeof data.device === 'string' ? data.device : (typeof data.platform === 'string' ? data.platform : 'unknown'),
      country: typeof data.country === 'string' ? data.country : null,
      city: typeof data.city === 'string' ? data.city : null,
      referrer: typeof data.referrer === 'string' ? data.referrer : null,
      userAgent: typeof data.userAgent === 'string' ? data.userAgent : null,
    };
  });
}
