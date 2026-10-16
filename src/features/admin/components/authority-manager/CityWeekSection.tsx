'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminAuthedFetch } from '@/lib/adminAuthedFetch';
import { ErrorState, KpiCard, KpiGrid, Panel, Skeleton, StatusPill } from '@/features/admin/components/ui';
import type { CityWeekResponse } from '@/features/admin/services/city-week';

/**
 * "השבוע ב<עיר>" — the first thing on the city dashboard: is the city
 * training (active residents and workouts vs last week), which parks are
 * busy / quiet, and what's broken for how long. Data:
 * GET /api/authority-manager/city-week. Built from the admin UI kit.
 */

const fmt = (n: number) => n.toLocaleString('he-IL');

function vsLastWeek(now: number, before: number): string {
  if (before === 0) return now > 0 ? 'שבוע שעבר: 0' : 'גם בשבוע שעבר: 0';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% משבוע שעבר (${fmt(before)})`;
}

export default function CityWeekSection({ authorityId }: { authorityId: string }) {
  const [data, setData] = useState<CityWeekResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await adminAuthedFetch<CityWeekResponse>(`/api/authority-manager/city-week?authorityId=${encodeURIComponent(authorityId)}`);
    if (r.ok) { setData(r.data); setError(null); }
    else { setData(null); setError(r.message || 'לא הצלחנו לטעון את נתוני השבוע.'); }
    setLoading(false);
  }, [authorityId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton height={110} count={2} />;
  if (error || !data) return <ErrorState message={error ?? 'לא הצלחנו לטעון את נתוני השבוע.'} onRetry={load} />;

  const { parks, reports } = data;

  return (
    <div className="space-y-4">
      <KpiGrid>
        <KpiCard label="תושבים שהתאמנו השבוע" value={fmt(data.activeThisWeek)} sub={vsLastWeek(data.activeThisWeek, data.activeLastWeek)} />
        <KpiCard label="אימונים השבוע" value={fmt(data.workoutsThisWeek)} sub={vsLastWeek(data.workoutsThisWeek, data.workoutsLastWeek)} />
        <KpiCard
          label="פארקים בלי פעילות"
          value={`${fmt(parks.quietCount)} / ${fmt(parks.total)}`}
          sub="בלי אימון ב־30 הימים האחרונים"
        />
        <KpiCard
          label="תקלות פתוחות"
          value={fmt(reports.open)}
          sub={reports.olderThanWeek > 0 ? `${fmt(reports.olderThanWeek)} פתוחות יותר משבוע · הוותיקה: ${fmt(reports.oldestDays ?? 0)} ימים` : reports.open > 0 ? 'כולן מהשבוע האחרון' : 'אין תקלות פתוחות'}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="הפארקים הפעילים ביותר · 30 ימים">
          {parks.busiest.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">עוד לא נרשמו אימונים בפארקים של העיר.</p>
          ) : (
            <ol className="divide-y divide-gray-100">
              {parks.busiest.map((p, i) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold text-gray-900"><span className="text-gray-400 tabular-nums ml-2">{i + 1}</span>{p.name}</span>
                  <span className="tabular-nums text-gray-700">{fmt(p.visits30d)} אימונים</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="דורש תשומת לב">
          <ul className="divide-y divide-gray-100 text-sm">
            <li className="flex items-center justify-between py-2.5">
              <Link href="/admin/authority/reports" className="font-semibold text-gray-900 hover:text-cyan-700">תקלות שפתוחות יותר משבוע</Link>
              <StatusPill tone={reports.olderThanWeek > 0 ? 'bad' : 'good'}>{fmt(reports.olderThanWeek)}</StatusPill>
            </li>
            <li className="py-2.5">
              <div className="flex items-center justify-between">
                <Link href="/admin/authority/locations" className="font-semibold text-gray-900 hover:text-cyan-700">פארקים בלי פעילות בחודש האחרון</Link>
                <StatusPill tone={parks.quietCount > 0 ? 'warn' : 'good'}>{fmt(parks.quietCount)}</StatusPill>
              </div>
              {parks.quiet.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {parks.quiet.map((p) => p.name).join(' · ')}
                  {parks.quietCount > parks.quiet.length && ` ועוד ${fmt(parks.quietCount - parks.quiet.length)}`}
                </p>
              )}
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
