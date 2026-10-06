'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AdminBreadcrumb, { type BreadcrumbItem } from '@/features/admin/components/AdminBreadcrumb';
import OverallReadinessCard from '@/features/admin/components/readiness-dashboard/OverallReadinessCard';
import ComponentReadinessCard from '@/features/admin/components/readiness-dashboard/ComponentReadinessCard';
import NearThresholdCard from '@/features/admin/components/readiness-dashboard/NearThresholdCard';
import UnitDetailChildCard from '@/features/admin/components/readiness-unit-detail/UnitDetailChildCard';
import UnitDetailSoldiersTable from '@/features/admin/components/readiness-unit-detail/UnitDetailSoldiersTable';
import type { UnitDetailBody } from '@/features/readiness/core/services/readiness-unit-detail.service';
import type { ReadinessCurrentStatus } from '@/features/readiness/core/services/readiness-write.service';
import { useMilitaryTenantSelection } from '@/features/admin/hooks/useMilitaryTenantSelection';
import { Loader2, ClipboardList } from 'lucide-react';

/**
 * Unit-detail screen (Stage 7, 03.10.2026, 00-MASTER-PLAN.md §13.80) —
 * what opens when clicking a unit row on the dashboard table, or a
 * sub-unit card on this same screen one level down. Read-only. The
 * EXACT locked rule, verbatim: "כל רמה סופרת רק את החיילים ששייכים לה
 * ישירות... זה מכוון ולא באג" — the four main cards below are already
 * own-soldiers-only data (computeBrigadeDashboard's own per-row
 * aggregation never rolls up descendants); the cumulative line is the
 * one explicitly-marked exception, never the default framing.
 *
 * This does NOT yet replace "מד כשירות ← רשימת חיילים" — that removal
 * is a separate, later round (David's explicit instruction).
 */
export default function ReadinessUnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const unitId = typeof params?.unitId === 'string' ? params.unitId : Array.isArray(params?.unitId) ? params!.unitId[0] : '';

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<UnitDetailBody | null>(null);
  const [soldiersFilter, setSoldiersFilter] = useState<'all' | ReadinessCurrentStatus | 'near_threshold'>('all');

  // 06.10.2026 — root/chief-officer only: by the time this page is
  // reached (from the dashboard's own switcher, or a drill-down from an
  // already-visited unit-detail page), `admin_selected_authority_id` is
  // already set — the SAME localStorage key every other readiness
  // screen in this round reads via this hook. A real tenant_owner/
  // unit_admin never sees needsSelection===true; their own fetch below
  // is byte-for-byte unchanged.
  const selection = useMilitaryTenantSelection();

  const load = useCallback(async (tenantId: string | null) => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');
    const qs = new URLSearchParams({ unitId });
    if (tenantId) qs.set('tenantId', tenantId);
    const res = await fetch(`/api/units/readiness/unit-detail?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינה (${res.status})`);
    setData(body);
  }, [unitId]);

  const ready = unitId !== '' && !selection.roleLoading && (!selection.needsSelection || !!selection.tenantId);

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
      .catch((err: any) => { if (!cancelled) setLoadError(err?.message ?? 'שגיאה בטעינת היחידה.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ready, selection.needsSelection, selection.tenantId, load]);

  if (selection.roleLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // 06.10.2026 — root/chief-officer who somehow reached this URL directly
  // with no brigade picked yet (bookmarked link, etc.) — a Hebrew empty
  // state, never the raw "tenantId is required" server error.
  if (selection.needsSelection && !selection.tenantId) {
    return (
      <div dir="rtl" className="max-w-5xl mx-auto px-4 pt-6 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center space-y-3">
          <p className="text-lg font-bold text-gray-900">בחר חטיבה להצגה</p>
          <p className="text-sm text-gray-500">כדי לצפות ביחידה, בחר חטיבה מתוך רשימת כל החטיבות.</p>
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

  if (loadError || !data) {
    return (
      <div dir="rtl" className="max-w-5xl mx-auto px-4 pt-6">
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm text-red-700 font-semibold">{loadError ?? 'שגיאה בטעינת היחידה.'}</p>
        </div>
      </div>
    );
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'כשירות', href: '/admin/dashboard' },
    ...data.breadcrumbChain.map((seg) => ({
      label: seg.name,
      href: seg.unitId ? `/admin/authority/readiness/unit/${seg.unitId}` : '/admin/dashboard',
    })),
    { label: data.unitName },
  ];

  const lastUpdatedText = data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('he-IL') : '—';

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <AdminBreadcrumb items={breadcrumbItems} />
        <button
          onClick={() => router.push(`/admin/authority/readiness/entry?unitId=${encodeURIComponent(data.unitId)}`)}
          className="flex items-center gap-2 bg-lime-700 hover:bg-lime-800 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
        >
          <ClipboardList size={16} /> רישום תוצאות בוחן
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-black text-gray-900">{data.unitName}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {data.ownSoldierCount} חיילים ביחידה עצמה
          {data.childUnitCount > 0 && ` · ${data.childUnitCount} ${data.childUnitCount === 1 ? 'יחידה תחתיה' : 'יחידות תחתיו'}`}
          {' · עודכן '}{lastUpdatedText}
        </p>
      </div>

      <div className={`grid gap-4 ${
        data.own.components.length === 0 ? 'grid-cols-1'
        : data.own.components.length === 1 ? 'grid-cols-2'
        : data.own.components.length === 2 ? 'grid-cols-3'
        : 'grid-cols-2 lg:grid-cols-4'
      }`}>
        <OverallReadinessCard overall={data.own.overall} warningScopeLabel="מהיחידה" cumulativeNote={data.cumulativeNote ?? undefined} />
        {data.own.components.map((c) => <ComponentReadinessCard key={c.testId} component={c} />)}
      </div>

      {data.childUnitCount > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-black text-gray-900">יחידות תחתיו</h3>
            {data.childrenSectionNote && (
              <p className="text-[11px] text-slate-400">{data.childrenSectionNote}</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.children.map((c) => <UnitDetailChildCard key={c.unitId} child={c} />)}
          </div>
        </div>
      )}

      <NearThresholdCard
        count={data.nearThresholdCount}
        active={soldiersFilter === 'near_threshold'}
        onClick={() => setSoldiersFilter((f) => (f === 'near_threshold' ? 'all' : 'near_threshold'))}
      />

      <UnitDetailSoldiersTable
        soldiers={data.soldiers}
        components={data.own.components}
        filter={soldiersFilter}
        onFilterChange={setSoldiersFilter}
      />

      <p className="text-xs text-gray-400 text-center">
        בוחן מסודר בלבד — תוצאות ממדידות אפליקציה ומדיווח עצמי אינן נכללות.
      </p>
    </div>
  );
}
