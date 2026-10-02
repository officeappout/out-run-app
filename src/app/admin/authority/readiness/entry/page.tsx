'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import ReadinessEntryTable from '@/features/admin/components/readiness-roster/ReadinessEntryTable';
import type { RosterSoldierEntry, RosterUnitEntry } from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessThresholdsConfig } from '@/features/readiness/core/services/readiness-write.service';
import { Loader2, ClipboardList, ArrowRight } from 'lucide-react';

type ComponentsMode = 'both' | 'run_only' | 'strength_only';

/**
 * Results-entry screen (03.10.2026 locked spec, Stage 3 round 2).
 *
 * "תאריך הבוחן" is displayed as today's date and is NOT editable —
 * computeRecordResult (readiness-write.service.ts, off-limits this
 * round) hardcodes `recordedAt: new Date()` with no client-supplied-date
 * field at all. If retroactive entry (recording a test that happened on
 * an earlier date) is actually needed, that requires a deliberate,
 * scoped change to the protected write-service file — flagged, not
 * silently assumed either way.
 */
export default function ReadinessEntryPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);

  const [soldiers, setSoldiers] = useState<RosterSoldierEntry[]>([]);
  const [units, setUnits] = useState<RosterUnitEntry[]>([]);
  const [config, setConfig] = useState<ReadinessThresholdsConfig | null>(null);

  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [componentsMode, setComponentsMode] = useState<ComponentsMode>('both');

  const load = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');

    const [rosterRes, thresholdsRes] = await Promise.all([
      fetch('/api/units/readiness/roster', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/units/readiness/thresholds', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const rosterBody = await rosterRes.json().catch(() => ({}));
    const thresholdsBody = await thresholdsRes.json().catch(() => ({}));
    if (!rosterRes.ok) throw new Error(typeof rosterBody.error === 'string' ? rosterBody.error : `שגיאה בטעינה (${rosterRes.status})`);
    if (!thresholdsRes.ok) throw new Error(typeof thresholdsBody.error === 'string' ? thresholdsBody.error : `שגיאה בטעינת הסף (${thresholdsRes.status})`);

    setSoldiers(rosterBody.soldiers ?? []);
    setUnits(rosterBody.units ?? []);
    setConfig(thresholdsBody.config ?? null);
    setSelectedUnitId((prev) => prev || (rosterBody.units?.[0]?.id ?? ''));
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        await load();
        setLoadError(null);
      } catch (err: any) {
        console.error('[ReadinessEntry] load error:', err);
        setLoadError(err?.message ?? 'שגיאה בטעינת נתוני היחידה.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [retrySeq, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const unitSoldiers = soldiers.filter((s) => s.unitId === selectedUnitId);
  const todayLabel = new Date().toLocaleDateString('he-IL');

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-5xl mx-auto">
      <AdminBreadcrumb items={[
        { label: 'ארגונים', href: '/admin/organizations' },
        { label: 'מד כשירות', href: '/admin/authority/readiness' },
        { label: 'רישום תוצאות בוחן' },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-lime-50 rounded-2xl flex items-center justify-center">
            <ClipboardList size={24} className="text-lime-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">רישום תוצאות בוחן</h1>
            <p className="text-sm text-gray-500">בוחן מסודר בלבד — תוצאות אפליקציה ודיווח עצמי אינם נרשמים כאן</p>
          </div>
        </div>
        <Link
          href="/admin/authority/readiness"
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
        >
          <ArrowRight size={14} /> חזרה לרשימת החיילים
        </Link>
      </div>

      {loadError && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 font-semibold">{loadError}</p>
          <button
            onClick={() => { setLoading(true); setRetrySeq((s) => s + 1); }}
            className="text-xs font-bold text-red-700 bg-white border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors flex-shrink-0"
          >
            נסה שוב
          </button>
        </div>
      )}

      {!loadError && (!config || config.tests.length === 0) && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-lg font-bold text-gray-900">ספי הכשירות טרם הוגדרו</p>
          <p className="text-sm text-gray-500 mt-2">לא ניתן לרשום תוצאות ללא סף פעיל. פנה למנהל המערכת.</p>
        </div>
      )}

      {!loadError && config && config.tests.length > 0 && (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              {units.length > 1 ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-gray-600">יחידה:</label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-200 bg-white"
                    dir="rtl"
                  >
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              ) : (
                <p className="text-sm text-gray-700"><span className="font-bold">יחידה:</span> {units[0]?.name ?? '—'}</p>
              )}
              <p className="text-sm text-gray-700"><span className="font-bold">תאריך הבוחן:</span> {todayLabel}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-600">מרכיבים נמדדים:</span>
              {([
                { value: 'both', label: 'ריצה + כוח' },
                { value: 'run_only', label: 'ריצה בלבד' },
                { value: 'strength_only', label: 'כוח בלבד' },
              ] as { value: ComponentsMode; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setComponentsMode(opt.value)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    componentsMode === opt.value ? 'bg-lime-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
              <span className="font-bold text-gray-600">הסף הפעיל:</span>
              {config.tests.map((t) => (
                <span key={t.id}>
                  {t.label}: {t.unit === 'seconds'
                    ? `${Math.floor(t.threshold.male / 60)}:${String(t.threshold.male % 60).padStart(2, '0')} (גברים) / ${Math.floor(t.threshold.female / 60)}:${String(t.threshold.female % 60).padStart(2, '0')} (נשים)`
                    : `${t.threshold.male} (גברים) / ${t.threshold.female} (נשים)`}
                </span>
              ))}
            </div>
          </div>

          {unitSoldiers.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
              אין חיילים ברשימה עבור היחידה שנבחרה.
            </div>
          ) : (
            <ReadinessEntryTable
              soldiers={unitSoldiers}
              config={config}
              componentsMode={componentsMode}
              onSaved={() => load().catch((err) => console.error('[ReadinessEntry] refresh error:', err))}
            />
          )}
        </>
      )}
    </div>
  );
}
