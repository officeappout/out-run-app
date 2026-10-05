'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import AdminBreadcrumb from '@/features/admin/components/AdminBreadcrumb';
import type { VerticalBrigadeRow } from '@/features/readiness/core/services/readiness-vertical-overview.service';
import { Loader2 } from 'lucide-react';

/** Same key /admin/dashboard/page.tsx's own super_admin authority-switcher already uses — deliberately NOT exported/imported, just the same literal string, so a row-click here puts that page into the exact state it already knows how to resolve for a vertical admin. */
const AUTHORITY_STORAGE_KEY = 'admin_selected_authority_id';

/**
 * "Chief fitness officer" cross-brigade list (06.10.2026). Read-only —
 * every number here comes straight from computeReadinessVerticalOverview,
 * which itself reuses computeBrigadeDashboard's own real numbers, not a
 * second calculation. A row's own tenant having zero data is rendered
 * explicitly ("טרם הוזנו נתונים"), never hidden and never a fabricated
 * percent.
 */
export default function ReadinessVerticalOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<VerticalBrigadeRow[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/units/readiness/vertical-overview', { headers: { Authorization: `Bearer ${token}` } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : `שגיאה בטעינה (${res.status})`);
        setRows(body.rows ?? []);
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.message ?? 'שגיאה בטעינת הרשימה.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const breadcrumbItems = [
    { label: 'כשירות', href: '/admin/dashboard' },
    { label: 'כל החטיבות' },
  ];

  const openBrigade = (tenantId: string) => {
    try {
      localStorage.setItem(AUTHORITY_STORAGE_KEY, tenantId);
    } catch {
      // Private-browsing/storage-blocked — navigation still proceeds;
      // /admin/dashboard simply has nothing saved to resolve from, same
      // as a first-ever visit.
    }
    router.push('/admin/dashboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div dir="rtl" className="max-w-3xl mx-auto px-4 pt-6">
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <p className="text-sm text-red-700 font-semibold">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4 pb-12 max-w-3xl mx-auto">
      <AdminBreadcrumb items={breadcrumbItems} />
      <h1 className="text-2xl font-black text-gray-900">כשירות — כל החטיבות</h1>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-400">אין חטיבות בתחום שלך.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
          {rows.map((row) => (
            <button
              key={row.tenantId}
              onClick={() => openBrigade(row.tenantId)}
              className="w-full flex items-center justify-between px-5 py-4 text-right hover:bg-slate-50 transition-colors"
            >
              <span className="font-bold text-gray-900">{row.tenantName}</span>
              {row.hasData ? (
                <span className="text-sm text-gray-500">
                  {row.passCount} כשירים מתוך {row.totalCount}
                  {row.passPercent !== null && <span className="font-semibold text-gray-700"> · {row.passPercent}%</span>}
                </span>
              ) : (
                <span className="text-sm text-gray-400">טרם הוזנו נתונים</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
