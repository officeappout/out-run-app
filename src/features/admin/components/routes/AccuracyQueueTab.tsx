/**
 * AccuracyQueueTab.tsx — Stage 3 of the accuracy agent (route_decisions v1
 * plan, .claude/plans/vectorized-twirling-tiger.md). All-cities, worst-first
 * triage over every route's already-persisted qualitySignals, computed
 * server-side (GET /api/admin/routes/accuracy-queue, superAdmin-only).
 *
 * Introduces ZERO new way to mutate a route:
 *  - Approve/Drop call moderation.service.ts's approveEntity/rejectEntity —
 *    the EXACT same functions the routes tab's row actions already call.
 *    Both hooks already log to route_decisions (Stage 2) unchanged.
 *  - Edit opens the existing canonical editor
 *    (/admin/authority/routes/[id]/edit) in a new tab; that page's save
 *    flow already logs an 'edit' decision (Stage 2).
 *
 * Real scope constraint discovered while building this (not assumed):
 * InventoryService.approveRoute/getRouteById and the canonical editor page
 * are ALL hardcoded to the official_routes collection — there is no
 * existing approve/reject/edit path for curated_routes in this panel today
 * (the routes tab's own pending query is official_routes-only too; curated
 * routes have never gone through this review flow). The accuracy queue
 * still computes and shows curated_routes rows (real signal, worth seeing)
 * but their action buttons are disabled with an explanatory note rather
 * than silently calling a write path that doesn't support them.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldAlert, ShieldCheck, Wrench, RefreshCw, ExternalLink } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { approveEntity, rejectEntity } from '@/features/admin/services/moderation.service';
import type { AccuracyVerdict } from '@/lib/route-decisions/decide-accuracy';

interface QueueRow {
  id: string;
  collection: 'official_routes' | 'curated_routes';
  name: string;
  city: string;
  authorityId: string | null;
  decision: { verdict: AccuracyVerdict; confidence: number; reason: string };
  compositionSummary: { genuinePct: number; sidewalkPct: number; ordinaryPct: number; otherPct: number };
  lightingSummary?: { status: 'computed' | 'unknown'; litCoveragePct: number | null; isLit: boolean | null };
}

const VERDICT_STYLE: Record<AccuracyVerdict, { label: string; badge: string; icon: typeof ShieldAlert }> = {
  drop: { label: 'הצעה: מחיקה', badge: 'bg-red-50 text-red-700 border-red-200', icon: ShieldAlert },
  edit: { label: 'הצעה: עריכה', badge: 'bg-amber-50 text-amber-700 border-amber-200', icon: Wrench },
  approve: { label: 'תקין', badge: 'bg-green-50 text-green-700 border-green-200', icon: ShieldCheck },
};

interface Props {
  isSuperAdmin: boolean;
  currentUserId: string | null;
  adminName: string;
}

export default function AccuracyQueueTab({ isSuperAdmin, currentUserId, adminName }: Props) {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<'all' | AccuracyVerdict>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) { setError('לא מחובר'); return; }
      const res = await fetch('/api/admin/routes/accuracy-queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError(`שגיאת שרת (${res.status})`); return; }
      const data = await res.json();
      setRows(data.rows || []);
    } catch (e) {
      console.error(e);
      setError('שגיאה בטעינת התור');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cities = useMemo(() => Array.from(new Set((rows || []).map(r => r.city))).sort(), [rows]);
  const filtered = useMemo(() => (rows || []).filter(r =>
    (verdictFilter === 'all' || r.decision.verdict === verdictFilter) &&
    (cityFilter === 'all' || r.city === cityFilter),
  ), [rows, verdictFilter, cityFilter]);

  const removeRow = (id: string) => setRows(prev => (prev ? prev.filter(r => r.id !== id) : prev));

  const handleApprove = async (row: QueueRow) => {
    setProcessingId(row.id);
    try {
      await approveEntity('route', row.id, { adminId: currentUserId || '', adminName });
      removeRow(row.id);
    } catch (e) {
      console.error(e);
      alert('שגיאה באישור המסלול');
    } finally { setProcessingId(null); }
  };

  const handleDrop = async (row: QueueRow) => {
    const reason = window.prompt('סיבת המחיקה (אופציונלי, יירשם ב-audit):');
    if (reason === null) return; // cancelled
    setProcessingId(row.id);
    try {
      await rejectEntity('route', row.id, reason, { adminId: currentUserId || '', adminName });
      removeRow(row.id);
    } catch (e) {
      console.error(e);
      alert('שגיאה במחיקת המסלול');
    } finally { setProcessingId(null); }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 py-16 flex flex-col items-center gap-3 text-center">
        <Loader2 className="w-8 h-8 text-cyan-600 animate-spin" />
        <span className="text-sm text-gray-400">מחשב תור דיוק על כל המסלולים...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 py-16 flex flex-col items-center gap-3 text-center">
        <ShieldAlert className="w-8 h-8 text-red-500" />
        <span className="text-sm text-gray-600">{error}</span>
        <button onClick={load} className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2 rounded-xl font-bold hover:bg-gray-50 text-sm">
          <RefreshCw size={14} /> נסה שוב
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {rows?.length || 0} מסלולים נבדקו · {filtered.length} מוצגים
        </p>
        <button onClick={load} className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-xl font-bold hover:bg-gray-50 text-xs">
          <RefreshCw size={13} /> רענן
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'drop', 'edit', 'approve'] as const).map(v => (
          <button
            key={v}
            onClick={() => setVerdictFilter(v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              verdictFilter === v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:text-gray-700'
            }`}
          >
            {v === 'all' ? 'הכל' : VERDICT_STYLE[v].label}
          </button>
        ))}
        {cities.length > 1 && (
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold border border-gray-200 bg-white text-gray-600"
          >
            <option value="all">כל הערים</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <ShieldCheck size={36} className="text-green-400" />
            <p className="text-sm text-gray-400">אין מסלולים בסינון הנוכחי</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(row => {
              const style = VERDICT_STYLE[row.decision.verdict];
              const isCurated = row.collection === 'curated_routes';
              return (
                <div key={row.id} className="px-6 py-4 flex flex-col gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${style.badge}`}>
                      <style.icon size={12} /> {style.label} · ביטחון {row.decision.confidence}%
                    </span>
                    <p className="font-bold text-gray-900 text-sm">{row.name}</p>
                    <span className="text-xs text-gray-400">{row.city}</span>
                    {isCurated && (
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                        מסלול נבחר (curated) — ללא עריכה/אישור בפאנל
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{row.decision.reason}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-400">
                      הרכב: {row.compositionSummary.genuinePct}% ייעודי · {row.compositionSummary.sidewalkPct}% מדרכה · {row.compositionSummary.ordinaryPct}% רגיל
                      {row.lightingSummary?.status === 'computed' && ` · תאורה ${row.lightingSummary.litCoveragePct}%`}
                    </span>
                  </div>
                  {isSuperAdmin && !isCurated && (
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => handleApprove(row)}
                        disabled={processingId === row.id}
                        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                      >
                        {processingId === row.id ? <Loader2 className="animate-spin" size={12} /> : <ShieldCheck size={12} />} אשר
                      </button>
                      <button
                        onClick={() => handleDrop(row)}
                        disabled={processingId === row.id}
                        className="flex items-center gap-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-60"
                      >
                        <ShieldAlert size={12} /> מחק
                      </button>
                      <Link
                        href={`/admin/authority/routes/${row.id}/edit`}
                        target="_blank"
                        className="flex items-center gap-1.5 bg-white border border-cyan-200 text-cyan-700 hover:bg-cyan-50 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
                      >
                        <ExternalLink size={12} /> פתח בעורך
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
