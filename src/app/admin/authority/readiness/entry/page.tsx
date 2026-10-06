'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import ReadinessEntryTable from '@/features/admin/components/readiness-roster/ReadinessEntryTable';
import type { RosterSoldierEntry, RosterUnitEntry } from '@/features/readiness/core/services/readiness-read.service';
import type { ReadinessThresholdsConfig } from '@/features/readiness/core/services/readiness-write.service';
import SearchableSelect from '@/features/admin/components/SearchableSelect';
import { useMilitaryTenantSelection } from '@/features/admin/hooks/useMilitaryTenantSelection';
import { Loader2, ClipboardList, ArrowRight, AlertTriangle, Building2 } from 'lucide-react';

type ComponentsMode = 'both' | 'run_only' | 'strength_only';

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Results-entry screen (03.10.2026 locked spec, Stage 3 round 2;
 * testDate added 03.10.2026 per David's explicit, approved touch to
 * readiness-write.service.ts).
 *
 * "תאריך הבוחן" is a real, editable date — separate from recordedAt
 * (the write-time timestamp, still server-only). The server is the
 * authoritative enforcement (not in the future, not more than 90 days
 * back, rejected with a clear message); the date input's min/max here
 * are a client-side convenience only, never trusted alone. An organized
 * test happens on paper in the field and is typed in days later —
 * "today" is just the sensible default, not an assumption the server
 * relies on.
 */
export default function ReadinessEntryPage() {
  // 03.10.2026 (Stage 7, unit-detail screen) — "רישום תוצאות בוחן" from
  // a unit's own detail page should open here with that exact unit
  // already selected, not default to the first unit in the list.
  const searchParams = useSearchParams();
  const preselectedUnitId = searchParams?.get('unitId') ?? null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);
  /**
   * 03.10.2026 (David) — a save failure and a refresh-only failure are
   * two different states and must never be collapsed into one silent
   * outcome. This is deliberately separate from `loadError`: loadError
   * means nothing is showing at all; refreshWarning means a save just
   * SUCCEEDED on the server (the row already shows "✓ נשמר") but the
   * follow-up re-fetch that would update the rest of the table's
   * displayed status failed — the data is safe, the screen is just
   * stale. Without this distinction, a stale display after the incident
   * that prompted this fix looked indistinguishable from data loss.
   */
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);

  const [soldiers, setSoldiers] = useState<RosterSoldierEntry[]>([]);
  const [units, setUnits] = useState<RosterUnitEntry[]>([]);
  const [config, setConfig] = useState<ReadinessThresholdsConfig | null>(null);

  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [componentsMode, setComponentsMode] = useState<ComponentsMode>('both');
  const [testDate, setTestDate] = useState<string>(() => isoDaysAgo(0));

  // 06.10.2026 — root/chief-officer have no own brigade; every real
  // tenant_owner/unit_admin never sees selection.needsSelection===true,
  // so their own path below is byte-for-byte what it was before.
  const selection = useMilitaryTenantSelection();

  const load = useCallback(async (tenantId: string | null) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');

    const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
    const [rosterRes, thresholdsRes] = await Promise.all([
      fetch(`/api/units/readiness/roster${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/units/readiness/thresholds${qs}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const rosterBody = await rosterRes.json().catch(() => ({}));
    const thresholdsBody = await thresholdsRes.json().catch(() => ({}));
    if (!rosterRes.ok) throw new Error(typeof rosterBody.error === 'string' ? rosterBody.error : `שגיאה בטעינה (${rosterRes.status})`);
    if (!thresholdsRes.ok) throw new Error(typeof thresholdsBody.error === 'string' ? thresholdsBody.error : `שגיאה בטעינת הסף (${thresholdsRes.status})`);

    setSoldiers(rosterBody.soldiers ?? []);
    setUnits(rosterBody.units ?? []);
    setConfig(thresholdsBody.config ?? null);
    const availableUnits: RosterUnitEntry[] = rosterBody.units ?? [];
    const preselectedIsValid = preselectedUnitId && availableUnits.some((u) => u.id === preselectedUnitId);
    setSelectedUnitId((prev) => prev || (preselectedIsValid ? preselectedUnitId! : (availableUnits[0]?.id ?? '')));
  }, [preselectedUnitId]);

  // Ready to fetch once role resolution is done AND (this caller has its
  // own tenant OR has explicitly picked one).
  const ready = !selection.roleLoading && (!selection.needsSelection || !!selection.tenantId);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    load(selection.needsSelection ? selection.tenantId : null)
      .then(() => { if (!cancelled) setLoadError(null); })
      .catch((err: any) => {
        console.error('[ReadinessEntry] load error:', err);
        if (!cancelled) setLoadError(err?.message ?? 'שגיאה בטעינת נתוני היחידה.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, selection.needsSelection, selection.tenantId, retrySeq, load]);

  if (selection.roleLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // 06.10.2026 — root/chief-officer with no brigade picked yet: a Hebrew
  // empty state pointing at the overview list, never the raw "tenantId is
  // required" server error.
  if (selection.needsSelection && !selection.tenantId) {
    return (
      <div dir="rtl" className="max-w-5xl mx-auto px-4 pt-6 space-y-4">
        <AdminBreadcrumb items={[
          { label: 'ארגונים', href: '/admin/organizations' },
          { label: 'מד כשירות', href: '/admin/authority/readiness' },
          { label: 'רישום תוצאות בוחן' },
        ]} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center space-y-3">
          <Building2 size={40} className="mx-auto text-slate-300" />
          <p className="text-lg font-bold text-gray-900">בחר חטיבה להצגה</p>
          <p className="text-sm text-gray-500">כדי לרשום תוצאות בוחן, בחר חטיבה מתוך רשימת כל החטיבות.</p>
          <Link
            href="/admin/authority/readiness/vertical-overview"
            className="inline-flex items-center gap-2 bg-lime-700 hover:bg-lime-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
          >
            לרשימת כל החטיבות
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const unitSoldiers = soldiers.filter((s) => s.unitId === selectedUnitId);

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-5xl mx-auto">
      <AdminBreadcrumb items={[
        { label: 'ארגונים', href: '/admin/organizations' },
        { label: 'מד כשירות', href: '/admin/authority/readiness' },
        { label: 'רישום תוצאות בוחן' },
      ]} />

      {/* 06.10.2026 — root/chief-officer only; same SearchableSelect the
          units ("team") screen's own super-admin switcher already uses. */}
      {selection.needsSelection && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
          <Building2 size={20} className="text-lime-700 flex-shrink-0" />
          <div className="flex-1" style={{ position: 'relative', zIndex: 20 }}>
            <label className="text-xs font-bold text-slate-500 block mb-1">חטיבה</label>
            <SearchableSelect
              options={selection.options.map((o) => ({ id: o.id, label: o.name }))}
              value={selection.tenantId ?? ''}
              onChange={(newId) => { if (newId) { setSelectedUnitId(''); selection.selectTenant(newId); } }}
              placeholder="בחר חטיבה..."
            />
          </div>
        </div>
      )}

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

      {/* Deliberately a DIFFERENT color/message from loadError above —
          this means the opposite of "nothing loaded": the save already
          succeeded on the server, only the display refresh failed. */}
      {refreshWarning && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-3">
          <p className="text-sm text-amber-800 font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {refreshWarning}
          </p>
          <button
            onClick={() => { setRefreshWarning(null); setLoading(true); setRetrySeq((s) => s + 1); }}
            className="text-xs font-bold text-amber-800 bg-white border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors flex-shrink-0"
          >
            רענן כעת
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
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-600">תאריך הבוחן:</label>
                <input
                  type="date"
                  value={testDate}
                  min={isoDaysAgo(90)}
                  max={isoDaysAgo(0)}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-200 bg-white"
                />
              </div>
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
              testDate={testDate}
              onSaved={() => {
                setRefreshWarning(null);
                load(selection.needsSelection ? selection.tenantId : null).catch((err) => {
                  console.error('[ReadinessEntry] refresh error:', err);
                  setRefreshWarning('התוצאה נשמרה בהצלחה בשרת, אך תצוגת הרשימה לא התעדכנה. רענן את הדף כדי לראות את הסטטוס העדכני.');
                });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
