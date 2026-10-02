'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Link from 'next/link';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import OverallReadinessCard from '@/features/admin/components/readiness-dashboard/OverallReadinessCard';
import ComponentReadinessCard from '@/features/admin/components/readiness-dashboard/ComponentReadinessCard';
import UnitReadinessTable from '@/features/admin/components/readiness-dashboard/UnitReadinessTable';
import type {
  DashboardOverallBreakdown,
  DashboardComponentBreakdown,
  DashboardUnitRow,
} from '@/features/readiness/core/services/readiness-dashboard.service';
import { Loader2, LayoutDashboard, Users } from 'lucide-react';

/**
 * Brigade readiness dashboard (Stage 4, 03.10.2026 locked spec,
 * 00-MASTER-PLAN.md §13.74). Read-only — no write path exists anywhere
 * on this screen. Built as an ADDITIONAL route alongside the existing
 * roster (`/admin/authority/readiness`) and entry
 * (`/admin/authority/readiness/entry`) screens rather than replacing
 * either, even though David described it as "the screen the officer
 * opens first" — flagged explicitly in the round report so the routing
 * can be revisited if an actual landing-page swap was intended.
 *
 * The five locked rules this screen must never drift from:
 * 1. "טרם נבדק" is a primary datum (headline + number + percent), not a
 *    leftover implied by subtraction.
 * 2. Every percentage ships with its own tested-denominator, in words.
 * 3. A unit with zero tested soldiers reads "טרם נבדקה" — never 0%.
 * 4. Every unit's own last-update date is always visible.
 * 5. Only source === 'organized_test' results count here — stated
 *    explicitly in the footer below, not just enforced silently server-side.
 */
export default function ReadinessDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);

  const [overall, setOverall] = useState<DashboardOverallBreakdown | null>(null);
  const [components, setComponents] = useState<DashboardComponentBreakdown[]>([]);
  const [units, setUnits] = useState<DashboardUnitRow[]>([]);

  const load = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('משתמש לא מחובר. רענן את הדף ונסה שוב.');

    const res = await fetch('/api/units/readiness/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינה (${res.status})`);

    setOverall(body.overall ?? null);
    setComponents(body.components ?? []);
    setUnits(body.units ?? []);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        await load();
        setLoadError(null);
      } catch (err: any) {
        console.error('[ReadinessDashboard] load error:', err);
        setLoadError(err?.message ?? 'שגיאה בטעינת לוח הכשירות.');
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

  return (
    <div dir="rtl" className="space-y-6 pb-12 max-w-5xl mx-auto">
      <AdminBreadcrumb items={[
        { label: 'ארגונים', href: '/admin/organizations' },
        { label: 'מד כשירות', href: '/admin/authority/readiness' },
        { label: 'לוח כשירות' },
      ]} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-lime-50 rounded-2xl flex items-center justify-center">
            <LayoutDashboard size={24} className="text-lime-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">לוח כשירות החטיבה</h1>
            <p className="text-sm text-gray-500">סטטוס כשירות מצטבר לפי יחידה ומרכיב</p>
          </div>
        </div>
        <Link
          href="/admin/authority/readiness"
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold px-4 py-2.5 rounded-xl transition-all"
        >
          <Users size={14} /> רשימת חיילים
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

      {!loadError && overall && (
        <>
          <OverallReadinessCard overall={overall} />

          {components.length > 0 && (
            <div className={`grid gap-4 ${components.length === 1 ? 'grid-cols-1' : components.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {components.map((c) => <ComponentReadinessCard key={c.testId} component={c} />)}
            </div>
          )}

          <UnitReadinessTable units={units} components={components} />

          <p className="text-xs text-gray-400 text-center">
            רק בוחן מסודר נספר בלוח זה. תוצאות ממדידות אפליקציה ומדיווח עצמי אינן נכללות.
          </p>
        </>
      )}

      {!loadError && !overall && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-lg font-bold text-gray-900">אין נתוני כשירות להצגה</p>
        </div>
      )}
    </div>
  );
}
