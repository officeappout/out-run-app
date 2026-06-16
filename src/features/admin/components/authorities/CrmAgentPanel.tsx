'use client';

import { useState, useEffect } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import { Bot, ChevronDown, ChevronUp, Loader2, RefreshCw, AlertTriangle, TrendingUp, FileText, Mail, Trophy, Skull, Clock, Zap } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { CrmScanResult } from '@/app/api/admin/crm-agent/run/route';

const STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה', lead: 'ליד', meeting: 'פגישה', quote: 'הצ"מ',
  follow_up: 'מעקב', closing: 'סגירה', active: 'פעיל', upsell: 'אפסייל',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', lead: 'bg-blue-100 text-blue-700',
  meeting: 'bg-purple-100 text-purple-700', quote: 'bg-indigo-100 text-indigo-700',
  follow_up: 'bg-amber-100 text-amber-700', closing: 'bg-orange-100 text-orange-700',
  active: 'bg-green-100 text-green-700', upsell: 'bg-emerald-100 text-emerald-700',
};

export default function CrmAgentPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CrmScanResult | null>(null);
  const [lastRunSource, setLastRunSource] = useState<'live' | 'saved' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [confirmLive, setConfirmLive] = useState(false);

  // Load today's saved run from Firestore on mount
  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    getDoc(doc(db, 'crm_runs', todayKey)).then(snap => {
      if (snap.exists()) {
        setResult(snap.data() as CrmScanResult);
        setLastRunSource('saved');
        setOpen(true);
      }
    }).catch(() => { /* no run yet today — silent */ });
  }, []);

  async function runAgent(dryRun: boolean) {
    setLoading(true);
    setError(null);
    setResult(null);
    setConfirmLive(false);
    if (!open) setOpen(true);
    try {
      const res = await adminFetch('/api/admin/crm-agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
      setLastRunSource('live');
    } catch (err: any) {
      setError(err?.message ?? 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }

  const runDate = result?.date ? new Date(result.date).toLocaleString('he-IL') : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header row ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
        >
          <Bot size={20} className="text-cyan-500" />
          <span className="font-bold text-base">סוכן CRM יומי</span>
          {lastRunSource === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-normal">
              <Clock size={11} />
              נטען אוטומטית — {runDate}
            </span>
          )}
          {lastRunSource === null && (
            <span className="text-xs text-gray-400 font-normal">— בדיקה ידנית / dry-run</span>
          )}
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </button>

        <div className="flex items-center gap-2">
          {/* Dry-run */}
          <button
            onClick={() => runAgent(true)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-cyan-50 border border-cyan-200 text-cyan-700 rounded-xl text-sm font-bold hover:bg-cyan-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {loading ? 'סורק…' : 'בדיקה יבשה'}
          </button>

          {/* Live run — confirm before execute */}
          {!confirmLive ? (
            <button
              onClick={() => setConfirmLive(true)}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-300 text-orange-700 rounded-xl text-sm font-bold hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Zap size={15} />
              ריצה אמיתית
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-300 rounded-xl px-3 py-2">
              <span className="text-xs text-orange-700 font-medium">כותב ל-CRM + טיוטות. בטוח?</span>
              <button
                onClick={() => runAgent(false)}
                disabled={loading}
                className="text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold px-2 py-1 rounded-lg disabled:opacity-50 transition-colors"
              >
                אשר
              </button>
              <button
                onClick={() => setConfirmLive(false)}
                className="text-xs text-gray-500 hover:text-gray-700 px-1"
              >
                ביטול
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expandable body ─────────────────────────────────────────────── */}
      {open && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-5">

          {/* Error ──────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Empty state ─────────────────────────────────────────────── */}
          {!loading && !result && !error && (
            <p className="text-gray-400 text-sm text-center py-4">
              לחץ על "בדיקה יבשה" כדי לסרוק את 3 תיבות הדואר ולראות מה הסוכן היה עושה.
            </p>
          )}

          {/* Loading ─────────────────────────────────────────────────── */}
          {loading && (
            <div className="flex flex-col items-center gap-2 py-6 text-gray-400 text-sm">
              <Loader2 size={28} className="animate-spin text-cyan-400" />
              <span>סורק 3 תיבות דואר…</span>
            </div>
          )}

          {/* Result ──────────────────────────────────────────────────── */}
          {result && !loading && (
            <div className="space-y-5" dir="rtl">

              {/* Meta bar */}
              <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                <span>ריצה: {runDate}</span>
                <span className="text-gray-200">|</span>
                <span>{result.stats.threadsScanned} threads נסרקו</span>
                <span className="text-gray-200">|</span>
                <span>{result.stats.threadsMatched} הותאמו לרשות</span>
                <span className="text-gray-200">|</span>
                <span>{result.stats.apiCalls} קריאות API</span>
                {result.dryRun && (
                  <>
                    <span className="text-gray-200">|</span>
                    <span className="text-amber-600 font-medium">dry-run — לא נכתב כלום</span>
                  </>
                )}
                {!result.dryRun && lastRunSource === 'saved' && (
                  <>
                    <span className="text-gray-200">|</span>
                    <span className="text-green-600 font-medium">✓ ריצה אמיתית — Firestore עודכן</span>
                  </>
                )}
              </div>

              {/* topPriorities ───────────────────────────────────────── */}
              {result.topPriorities.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2">
                    <Trophy size={15} className="text-amber-500" />
                    על מי לדחוף היום
                  </h3>
                  <div className="rounded-xl border border-gray-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs">
                          <th className="text-right px-3 py-2 font-medium">#</th>
                          <th className="text-right px-3 py-2 font-medium">רשות</th>
                          <th className="text-right px-3 py-2 font-medium">סטטוס</th>
                          <th className="text-right px-3 py-2 font-medium">סיבה</th>
                          <th className="text-right px-3 py-2 font-medium">פעולה מוצעת</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {result.topPriorities.map(p => (
                          <tr key={p.authorityId} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5 text-gray-400 font-bold">{p.rank}</td>
                            <td className="px-3 py-2.5 font-semibold text-gray-800">{p.authorityName}</td>
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_COLORS[p.currentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                                {STATUS_LABELS[p.currentStatus] ?? p.currentStatus}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 text-xs">{p.reason}</td>
                            <td className="px-3 py-2.5 text-cyan-700 text-xs font-medium">{p.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Status changes ──────────────────────────────────────── */}
              {result.statusChanges.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2">
                    <TrendingUp size={15} className="text-green-500" />
                    שינויי סטטוס ({result.statusChanges.length})
                  </h3>
                  <div className="space-y-1.5">
                    {result.statusChanges.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-xl text-sm">
                        <span className="font-semibold text-gray-800">{c.authorityName}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_COLORS[c.from] ?? ''}`}>{STATUS_LABELS[c.from] ?? c.from}</span>
                        <span className="text-gray-400">→</span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_COLORS[c.to] ?? ''}`}>{STATUS_LABELS[c.to] ?? c.to}</span>
                        <span className="text-gray-400 text-xs mr-auto">{c.reason}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Documents added ─────────────────────────────────────── */}
              {result.documentsAdded.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2">
                    <FileText size={15} className="text-indigo-500" />
                    מסמכים שהיו מצורפים ({result.documentsAdded.length})
                  </h3>
                  <div className="space-y-1.5">
                    {result.documentsAdded.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-xl text-sm">
                        <span className="font-semibold text-gray-800">{d.authorityName}</span>
                        <span className="text-gray-500 text-xs truncate max-w-xs">{d.filename}</span>
                        <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">{d.docType}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Drafts pending ──────────────────────────────────────── */}
              {result.draftsPending.length > 0 && (
                <section>
                  <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-700 mb-2">
                    <Mail size={15} className="text-purple-500" />
                    טיוטות שהיו נוצרות ({result.draftsPending.length})
                  </h3>
                  <div className="space-y-1.5">
                    {result.draftsPending.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-xl text-sm">
                        <span className="font-semibold text-gray-800">{d.authorityName}</span>
                        <span className="text-gray-500 text-xs">{d.subject}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Empty state for today's activity ───────────────────── */}
              {result.statusChanges.length === 0 && result.documentsAdded.length === 0 && result.draftsPending.length === 0 && (
                <div className="px-3 py-3 bg-gray-50 rounded-xl text-sm text-gray-400 text-center">
                  אין פעילות CRM רלוונטית ב-24 השעות האחרונות
                </div>
              )}



              {/* Needs attention ─────────────────────────────────────── */}
              {result.needsAttention.length > 0 && (
                <div className="space-y-1.5">
                  {result.needsAttention.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                      <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                      <span className="font-medium text-amber-800">{a.authorityName}:</span>
                      <span className="text-amber-700">{a.issue}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Dormant bucket ─────────────────────────────────────── */}
              {result.dormant && result.dormant.length > 0 && (
                <section className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                    <Skull size={14} className="text-gray-400" />
                    <span className="text-sm font-semibold text-gray-500">
                      🪦 רדומים — להחיות או לארכב? ({result.dormant.length})
                    </span>
                    <span className="text-xs text-gray-400 mr-auto">
                      &gt; 180 ימים ללא פעילות — לא נכללים ב-topPriorities
                    </span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {result.dormant.slice(0, 8).map((d, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="font-medium text-gray-600 min-w-[120px]">{d.authorityName}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[d.currentStatus] ?? 'bg-gray-100 text-gray-500'}`}>
                          {STATUS_LABELS[d.currentStatus] ?? d.currentStatus}
                        </span>
                        <span className="text-gray-400 text-xs mr-auto">{d.daysSilent} ימים שתיקה</span>
                      </div>
                    ))}
                    {result.dormant.length > 8 && (
                      <div className="px-4 py-2 text-xs text-gray-400">
                        + עוד {result.dormant.length - 8} רשויות רדומות
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Run log ─────────────────────────────────────────────── */}
              <section>
                <button
                  onClick={() => setShowLog(s => !s)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  לוג ריצה מלא
                  {showLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {showLog && (
                  <pre className="mt-2 p-3 bg-gray-900 text-gray-100 text-xs rounded-xl overflow-x-auto leading-5 max-h-64 overflow-y-auto" dir="ltr">
                    {result.runLog.join('\n')}
                  </pre>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
