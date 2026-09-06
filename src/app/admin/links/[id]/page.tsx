'use client';

/**
 * /admin/links/[id] — per-link analytics.
 *
 * Deliberately tables + numbers, no charts (per explicit product
 * direction — "בלי גרפים מפוארים"). Device / hour-of-day / day-of-week /
 * country / city breakdowns and the daily trend all read from the
 * permanent `daily_stats` rollup (see `link-stats.ts` for why that's
 * unbounded while the CSV export below is not — the CSV comes from the
 * raw `clicks` collection, which has a 30-day TTL).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Download, Loader2 } from 'lucide-react';
import { getMarketingLink, type MarketingLink } from '@/features/admin/services/marketing-links.service';
import {
  aggregateDailyStats,
  buildClickRecordsCsv,
  getClickRecordsRange,
  getDailyStatsRange,
  type AggregatedLinkStats,
} from '@/features/admin/services/link-stats';
import { getIsraelDateKey } from '@/lib/israelTime';

const CLICK_RECORD_TTL_DAYS = 30; // mirrors link-click-handler.ts — surfaced here as a user-facing note, not re-derived from it (server-only file).

const DATE_PRESETS = [
  { days: 7, label: '7 ימים' },
  { days: 30, label: '30 ימים' },
  { days: 90, label: '90 ימים' },
  { days: 365, label: 'שנה' },
] as const;

function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fromInputDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export default function LinkAnalyticsPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [link, setLink] = useState<MarketingLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState<Date>(() => daysAgo(30));
  const [dateTo, setDateTo] = useState<Date>(() => new Date());
  const [stats, setStats] = useState<AggregatedLinkStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMarketingLink(id)
      .then((row) => { if (!cancelled) setLink(row); })
      .catch(() => { if (!cancelled) setError('שגיאה בטעינת הקישור'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const fromKey = getIsraelDateKey(dateFrom);
      const toKey = getIsraelDateKey(dateTo);
      const docs = await getDailyStatsRange(id, fromKey, toKey);
      setStats(aggregateDailyStats(docs));
    } catch (err) {
      console.error('[admin/links/[id]] stats load failed:', err);
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [id, dateFrom, dateTo]);

  useEffect(() => { void loadStats(); }, [loadStats]);

  const applyPreset = useCallback((days: number) => {
    setDateFrom(daysAgo(days));
    setDateTo(new Date());
  }, []);

  const handleExportCsv = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const rows = await getClickRecordsRange(id, dateFrom, dateTo);
      const csv = buildClickRecordsCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${link?.friendlyName || id}-clicks.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[admin/links/[id]] CSV export failed:', err);
      setExportError('ייצוא ה-CSV נכשל');
    } finally {
      setExporting(false);
    }
  }, [id, dateFrom, dateTo, link]);

  const maxHourCount = useMemo(
    () => Math.max(1, ...(stats?.byHour.map((h) => h.count) ?? [1])),
    [stats],
  );
  const maxDowCount = useMemo(
    () => Math.max(1, ...(stats?.byDayOfWeek.map((d) => d.count) ?? [1])),
    [stats],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  if (error || !link) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8">
        <p className="text-sm text-rose-600">{error ?? 'הקישור לא נמצא'}</p>
        <Link href="/admin/links" className="mt-2 inline-block text-sm text-indigo-600 underline">
          חזרה לרשימת הקישורים
        </Link>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6 sm:px-8">
      <header className="mb-6">
        <Link href="/admin/links" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowRight className="h-4 w-4" aria-hidden />
          חזרה לקישורים
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{link.friendlyName}</h1>
        <p className="mt-1 text-xs text-slate-500" dir="ltr">{link.oneLinkUrl}</p>
      </header>

      {/* Filter bar */}
      <section className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">מ-תאריך</label>
          <input
            type="date"
            value={toInputDate(dateFrom)}
            onChange={(e) => setDateFrom(fromInputDate(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">עד-תאריך</label>
          <input
            type="date"
            value={toInputDate(dateTo)}
            onChange={(e) => setDateTo(fromInputDate(e.target.value))}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => applyPreset(p.days)}
              className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {exporting ? 'מייצא…' : 'ייצוא CSV (רשומות קליק)'}
        </button>
      </section>

      {exportError && <p className="mb-4 text-xs text-rose-600">{exportError}</p>}

      <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        רשומות הקליק המפורטות (ל-CSV) נשמרות {CLICK_RECORD_TTL_DAYS} יום בלבד. הפילוחים למטה (מכשיר/שעה/יום/מדינה/מגמה) נשמרים <b>לצמיתות</b> ואינם מוגבלים.
      </p>

      {statsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
        </div>
      ) : !stats || stats.totalScans === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          אין נתונים בטווח שנבחר.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* KPI */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">סה״כ סריקות בטווח</span>
            <div className="mt-1 text-3xl font-bold text-slate-900">{stats.totalScans.toLocaleString('he-IL')}</div>
          </section>

          {/* Device breakdown */}
          <SimpleTable
            title="פילוח מכשיר"
            rows={stats.byDevice.map((d) => ({ label: DEVICE_LABELS_HE[d.device] ?? d.device, count: d.count, pct: d.pct }))}
          />

          {/* Country/city breakdown */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-slate-800">מדינה / עיר</h2>
            <div className="grid grid-cols-2 gap-4">
              <MiniList title="מדינה" rows={stats.byCountry.map((c) => ({ label: c.country, count: c.count }))} />
              <MiniList title="עיר" rows={stats.byCity.map((c) => ({ label: c.city, count: c.count }))} />
            </div>
          </section>

          {/* Hour of day */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <h2 className="mb-3 text-sm font-bold text-slate-800">פילוח לפי שעה ביום (שעון ישראל)</h2>
            <div className="space-y-1">
              {stats.byHour.map((h) => (
                <HistogramRow
                  key={h.hour}
                  label={`${String(h.hour).padStart(2, '0')}:00`}
                  count={h.count}
                  max={maxHourCount}
                />
              ))}
            </div>
          </section>

          {/* Day of week */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <h2 className="mb-3 text-sm font-bold text-slate-800">פילוח לפי יום בשבוע</h2>
            <div className="space-y-1">
              {stats.byDayOfWeek.map((d) => (
                <HistogramRow key={d.dayIndex} label={d.dayLabel} count={d.count} max={maxDowCount} />
              ))}
            </div>
          </section>

          {/* Daily trend */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <h2 className="mb-3 text-sm font-bold text-slate-800">מגמה יומית</h2>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-right text-sm">
                <thead className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="px-2 py-1">תאריך</th><th className="px-2 py-1">סריקות</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...stats.dailyTrend].reverse().map((row) => (
                    <tr key={row.date}>
                      <td className="px-2 py-1 text-slate-700">{row.date}</td>
                      <td className="px-2 py-1 font-semibold text-indigo-700">{row.count.toLocaleString('he-IL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const DEVICE_LABELS_HE: Record<string, string> = {
  ios: 'iOS', android: 'Android', desktop: 'מחשב',
};

function SimpleTable({ title, rows }: { title: string; rows: { label: string; count: number; pct: number }[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-bold text-slate-800">{title}</h2>
      <table className="w-full text-right text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="px-2 py-1.5 text-slate-700">{row.label}</td>
              <td className="px-2 py-1.5 font-semibold text-indigo-700">{row.count.toLocaleString('he-IL')}</td>
              <td className="px-2 py-1.5 text-xs text-slate-400">{row.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MiniList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-slate-500">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">אין נתונים</p>
      ) : (
        <ul className="space-y-0.5 text-sm">
          {rows.slice(0, 10).map((r) => (
            <li key={r.label} className="flex justify-between">
              <span className="text-slate-700">{r.label}</span>
              <span className="font-semibold text-indigo-700">{r.count.toLocaleString('he-IL')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistogramRow({ label, count, max }: { label: string; count: number; max: number }) {
  const widthPct = max === 0 ? 0 : Math.round((count / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 shrink-0 text-slate-500" dir="ltr">{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
        <div className="h-full rounded bg-indigo-500" style={{ width: `${widthPct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-left font-semibold text-slate-700">{count}</span>
    </div>
  );
}
