'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/costs — "עלויות": what the platform costs per month, per vendor, in ILS. Super admin
 * only (the page checks the role for the UX; the real boundary is requireSuperAdminApi on
 * /api/admin/costs/**). Data: admin_costs/{month} snapshots + admin_cost_items (server-only).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import type { DashboardPayload } from '@/lib/costs/dashboard';
import { lastMonths } from '@/lib/costs/month';
import { costsFetch, monthLabel, readError } from '@/features/admin/components/costs/costs-client';
import SummaryStrip from '@/features/admin/components/costs/SummaryStrip';
import SpikeBanner from '@/features/admin/components/costs/SpikeBanner';
import VendorTable from '@/features/admin/components/costs/VendorTable';
import RenewalsPanel from '@/features/admin/components/costs/RenewalsPanel';
import FxPanel from '@/features/admin/components/costs/FxPanel';
import ConnectorsPanel from '@/features/admin/components/costs/ConnectorsPanel';
import ItemsPanel from '@/features/admin/components/costs/ItemsPanel';

export default function AdminCostsPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        setAllowed((await checkUserRole(user.uid)).isSuperAdmin);
      } catch {
        setAllowed(false);
      }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await costsFetch(`/api/admin/costs${month ? `?month=${month}` : ''}`);
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as DashboardPayload;
      setData(body);
      if (!month) setMonth(body.month);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הטעינה נכשלה');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const refreshNow = async () => {
    if (!data) return;
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await costsFetch('/api/admin/costs/refresh', { method: 'POST', body: JSON.stringify({ month: data.month }) });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { reports: Array<{ results: Array<{ status: string }> }> };
      const results = body.reports.flatMap((r) => r.results);
      const failed = results.filter((r) => r.status === 'error').length;
      setNotice(`רוענן · ${results.filter((r) => r.status === 'ok').length} מחברים עם נתונים${failed ? ` · ${failed} נכשלו` : ''}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הרענון נכשל');
    } finally {
      setRefreshing(false);
    }
  };

  const monthOptions = useMemo(() => (data ? lastMonths(data.today.slice(0, 7), 12).reverse() : []), [data]);
  const lastFetched = useMemo(() => {
    const ms = Math.max(0, ...(data?.connectors.map((c) => c.snapshot?.fetchedAtMs ?? 0) ?? [0]));
    return ms > 0 ? new Date(ms).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : null;
  }, [data]);

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <ShieldAlert className="w-8 h-8" />
        <p className="text-sm">המסך הזה זמין לסופר-אדמין בלבד.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-5" dir="rtl">
      <header className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <h1 className="text-xl font-black text-slate-900">עלויות</h1>
          <p className="text-sm text-slate-500">
            כמה עולה להפעיל את OUT בחודש, לפי ספק, בשקלים.{lastFetched ? ` עודכן לאחרונה ${lastFetched}.` : ''}
          </p>
        </div>
        <select
          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          value={month ?? ''}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="חודש"
          disabled={!data}
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={refreshNow}
          disabled={refreshing || !data}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:border-slate-400 rounded-lg disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} aria-hidden />
          רענן עכשיו
        </button>
      </header>

      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      {notice && <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{notice}</p>}

      {!data ? (
        loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        )
      ) : (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <SpikeBanner spikes={data.spikes} isCurrentMonth={data.isCurrentMonth} />
          <SummaryStrip data={data} />
          <div className="grid lg:grid-cols-3 gap-5 items-start">
            <div className="lg:col-span-2">
              <VendorTable data={data} />
            </div>
            <aside className="space-y-5">
              <RenewalsPanel renewals={data.renewals} />
              <FxPanel key={`${data.month}:${data.fx.USD}:${data.fx.EUR}`} month={data.month} fx={data.fx} onSaved={load} />
              <ConnectorsPanel connectors={data.connectors} />
            </aside>
          </div>
          <ItemsPanel items={data.items} today={data.today} onChanged={load} />
        </div>
      )}
    </div>
  );
}
