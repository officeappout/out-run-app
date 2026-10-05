'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import TrendsMainChart from '@/features/admin/components/readiness-trends/TrendsMainChart';
import ComponentAverageChart from '@/features/admin/components/readiness-trends/ComponentAverageChart';
import type { TrendsBody, ComponentFilter, PopulationFilter } from '@/features/readiness/core/services/readiness-trends.service';
import type { DashboardUnitRow } from '@/features/readiness/core/services/readiness-dashboard.service';
import { READINESS_COLORS } from '@/features/admin/components/readiness-dashboard/colors';
import { Loader2 } from 'lucide-react';

const COMPONENT_OPTIONS: { key: ComponentFilter; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'run', label: 'ריצה' },
  { key: 'strength', label: 'כוח' },
];
const POPULATION_OPTIONS: { key: PopulationFilter; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'passed_previous_round', label: 'עברו בסבב הקודם' },
  { key: 'did_not_pass_previous_round', label: 'לא עברו' },
];

/**
 * Trends screen (05.10.2026, §13.90) — the official test (green, held
 * between test dates) alongside the app-derived indication (blue,
 * dashed, never determinative) over time. Read-only; every empty state
 * below is intentional, not a loading glitch — see
 * readiness-trends.service.ts's own header for the full rule set this
 * page renders honestly, including "a blue line will NOT appear with
 * today's real production data, and that is correct."
 */
export default function ReadinessTrendsPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<TrendsBody | null>(null);
  const [units, setUnits] = useState<DashboardUnitRow[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [componentFilter, setComponentFilter] = useState<ComponentFilter>('all');
  const [populationFilter, setPopulationFilter] = useState<PopulationFilter>('all');

  const load = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');

    if (units.length === 0) {
      const dashboardRes = await fetch('/api/units/readiness/dashboard', { headers: { Authorization: `Bearer ${token}` } });
      const dashboardBody = await dashboardRes.json().catch(() => ({}));
      if (dashboardRes.ok) setUnits(dashboardBody.units ?? []);
    }

    const params = new URLSearchParams({ componentFilter, populationFilter });
    if (selectedUnitId) params.set('unitId', selectedUnitId);
    const res = await fetch(`/api/units/readiness/trends?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינה (${res.status})`);
    setData(body);
  }, [componentFilter, populationFilter, selectedUnitId, units.length]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        await load();
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.message ?? 'שגיאה בטעינת המגמות.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentFilter, populationFilter, selectedUnitId]);

  const breadcrumbItems = [
    { label: 'כשירות', href: '/admin/dashboard' },
    { label: 'מגמות' },
  ];

  const unitOptions = useMemo(
    () => units.slice().sort((a, b) => a.unitName.localeCompare(b.unitName, 'he')),
    [units],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div dir="rtl" className="max-w-5xl mx-auto px-4 pt-6">
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm text-red-700 font-semibold">{loadError ?? 'שגיאה בטעינת המגמות.'}</p>
        </div>
      </div>
    );
  }

  const bothEmpty = data.green.length === 0;
  const RUN_COLOR = '#2563EB';
  const PULL_COLOR = READINESS_COLORS.pass;

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-5xl mx-auto">
      <AdminBreadcrumb items={breadcrumbItems} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">מגמות כשירות</h1>
          {data.title && <p className="text-sm text-gray-500 mt-1">{data.title}</p>}
        </div>
        <select
          value={selectedUnitId}
          onChange={(e) => setSelectedUnitId(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white"
        >
          <option value="">כל החטיבה</option>
          {unitOptions.map((u) => (
            <option key={u.unitId} value={u.unitId}>{u.breadcrumb ? `${u.breadcrumb} · ${u.unitName}` : u.unitName}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="inline-flex rounded-xl overflow-hidden border border-gray-200">
          {COMPONENT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setComponentFilter(opt.key)}
              className={`text-xs font-bold px-3 py-1.5 transition-colors ${componentFilter === opt.key ? 'bg-lime-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-xl overflow-hidden border border-gray-200">
          {POPULATION_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPopulationFilter(opt.key)}
              className={`text-xs font-bold px-3 py-1.5 transition-colors ${populationFilter === opt.key ? 'bg-lime-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {bothEmpty ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-sm font-bold text-gray-900">דרושים מבדק שני ומשתמשים מקושרים.</p>
          <p className="text-xs text-gray-400 mt-1">אין עדיין נתונים להצגה בתחום זה.</p>
        </div>
      ) : (
        <>
          <TrendsMainChart green={data.green} blue={data.blue} />
          {data.latestCoverageNote && (
            <p className="text-[11px] text-slate-500 -mt-3">{data.latestCoverageNote}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(() => {
              const run = data.thresholds.find((t) => t.testId === 'run_3000m');
              const pull = data.thresholds.find((t) => t.testId === 'pullups');
              const dip = data.thresholds.find((t) => t.testId === 'dips');
              return (
                <>
                  {run && <ComponentAverageChart title="ממוצע ריצה" points={data.componentAverages.run_3000m} thresholdMale={run.male} thresholdFemale={run.female} color={RUN_COLOR} />}
                  {pull && <ComponentAverageChart title="ממוצע עליות מתח" points={data.componentAverages.pullups} thresholdMale={pull.male} thresholdFemale={pull.female} color={PULL_COLOR} />}
                  {dip && <ComponentAverageChart title="ממוצע מקבילים" points={data.componentAverages.dips} thresholdMale={dip.male} thresholdFemale={dip.female} color={PULL_COLOR} />}
                </>
              );
            })()}
          </div>
        </>
      )}

      <p className="text-xs text-gray-400 text-center">
        הקו הכחול הוא אינדיקציה בלבד מתוך אימוני אפליקציה — אינו קובע כשירות רשמית.
      </p>
    </div>
  );
}
