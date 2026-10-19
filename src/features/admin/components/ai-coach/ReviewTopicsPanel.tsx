'use client';

/**
 * "נושאים מובילים" — what users ask Kelly about (Kelly phase 2, flag ai_coach_phase2): top
 * question topics of the last 7 or 30 days with anonymized example questions. Reads
 * /api/admin/ai-coach/reviews/topics (super admin).
 */
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import type { TopicSummaryRow } from '@/lib/ai/review/topics';

interface TopicsResponse {
  days: number;
  total: number;
  rows: TopicSummaryRow[];
}

export default function ReviewTopicsPanel() {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<TopicsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/admin/ai-coach/reviews/topics?days=${days}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error(`שגיאה ${res.status}`);
        const body = (await res.json()) as TopicsResponse;
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'הטעינה נכשלה');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const max = Math.max(1, ...(data?.rows ?? []).map((r) => r.count));
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-bold text-slate-500 me-auto">נושאים מובילים בשאלות</p>
        {([7, 30] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${days === d ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            {d} ימים
          </button>
        ))}
      </div>
      {loading && !data ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : !data || data.rows.length === 0 ? (
        <p className="text-xs text-slate-400">אין עדיין שאלות מתויגות בטווח הזה. התיוג מתחיל בסקירה הבאה אחרי הדלקת המתג.</p>
      ) : (
        <ul className="space-y-2.5">
          {data.rows.map((r) => (
            <li key={r.topic} className="text-xs">
              <div className="flex justify-between text-slate-700 font-bold">
                <span>{r.label}</span>
                <span className="tabular-nums">
                  {r.count} ({Math.round((r.count / Math.max(1, data.total)) * 100)}%)
                </span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded mt-0.5">
                <div className="h-1.5 bg-sky-500 rounded" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
              {r.examples.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-slate-500">
                  {r.examples.map((e) => (
                    <li key={e} className="truncate">“{e}”</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
