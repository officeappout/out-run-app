'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { CheckCircle2, FlaskConical, Loader2, Play, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react';
import {
  CATEGORY_LABEL_HE,
  ISSUE_CATEGORIES,
  ROOT_CAUSES,
  ROOT_CAUSE_LABEL_HE,
  type IssueCategory,
  type RootCause,
} from '@/lib/ai/review/review-types';
import { filterRows, type FlaggedRow, type RowFilter } from '@/lib/ai/review/review-list';
import type { DayPoint } from '@/lib/ai/review/stats';

interface Summary {
  reviews: number;
  turns: number;
  issues: number;
  flaggedTurns: number;
  avgScore: number | null;
  costUsd: number;
  graderErrors: number;
  topCategories: Array<{ key: IssueCategory; count: number }>;
  topRootCauses: Array<{ key: RootCause; count: number }>;
}

interface ListResponse {
  days: number;
  summary: Summary;
  trend: DayPoint[];
  rows: FlaggedRow[];
}

const SEVERITY_LABEL: Record<number, string> = { 1: 'קל', 2: 'ברור', 3: 'חמור' };
const SEVERITY_CLASS: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-amber-100 text-amber-800',
  3: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<FlaggedRow['status'], string> = { open: 'פתוח', fixed: 'תוקן', converted: 'הוסב לבדיקה' };

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  });
}

function ScoreTrend({ points }: { points: DayPoint[] }) {
  const scored = points.filter((p) => p.avgScore !== null);
  if (scored.length < 2) return <p className="text-xs text-slate-400">אין עדיין מספיק ימים למגמה.</p>;
  const w = 280;
  const h = 64;
  const x = (i: number) => (i / (scored.length - 1)) * (w - 8) + 4;
  const y = (s: number) => h - 4 - ((s - 1) / 4) * (h - 8);
  const d = scored.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.avgScore!).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" role="img" aria-label="מגמת ציון">
      <line x1="0" x2={w} y1={y(3)} y2={y(3)} stroke="#e2e8f0" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="#0ea5e9" strokeWidth="2" />
      {scored.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.avgScore!)} r="2.5" fill="#0ea5e9">
          <title>{`${p.day}: ${p.avgScore} (${p.reviews} שיחות)`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Bars<K extends string>({ items, label }: { items: Array<{ key: K; count: number }>; label: (k: K) => string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <p className="text-xs text-slate-400">אין ממצאים.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.key} className="text-xs">
          <div className="flex justify-between text-slate-600">
            <span>{label(i.key)}</span>
            <span className="tabular-nums">{i.count}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded">
            <div className="h-1.5 bg-sky-500 rounded" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RowCard({ row, busy, onAction }: { row: FlaggedRow; busy: boolean; onAction: (action: 'mark_fixed' | 'reopen' | 'convert') => void }) {
  const [open, setOpen] = useState(false);
  const i = row.issue;
  return (
    <li className="border border-slate-200 rounded-xl bg-white">
      <button onClick={() => setOpen((v) => !v)} className="w-full text-right p-3 flex flex-wrap items-center gap-2">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_CLASS[i.severity]}`}>{SEVERITY_LABEL[i.severity]}</span>
        <span className="text-sm font-bold text-slate-900">{CATEGORY_LABEL_HE[i.category]}</span>
        <span className="text-xs text-slate-500">· {ROOT_CAUSE_LABEL_HE[i.likelyRootCause]}</span>
        <span className="text-xs text-slate-400">· {i.source === 'precheck' ? 'בדיקה אוטומטית' : 'סוקר AI'}</span>
        <span className="text-xs text-slate-400">· {row.day} · {row.firstName || 'ללא שם'}</span>
        <span className="ms-auto text-xs text-slate-500">{STATUS_LABEL[row.status]}</span>
        <p className="basis-full text-sm text-slate-700 truncate">״{row.userText}״</p>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-3 space-y-3 text-sm">
          <div>
            <p className="text-xs font-bold text-slate-500">המשתמש ביקש</p>
            <p className="whitespace-pre-wrap text-slate-900">{row.userText || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">קלי ענה</p>
            <p className="whitespace-pre-wrap text-slate-900">{row.assistantText || '—'}</p>
          </div>
          {row.cards.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500">כרטיסים</p>
              <ul className="text-xs text-slate-700 space-y-0.5">
                {row.cards.map((c) => (
                  <li key={c.workoutId}>
                    {c.title} · {c.minutes} דק׳ · {c.exerciseCount} תרגילים · {c.location}
                    {c.reasonCodes.length ? ` · ${c.reasonCodes.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-slate-500">קריאות לכלים</p>
            {row.toolCalls === null ? (
              <p className="text-xs text-slate-400">אין לוג שמור לתור הזה.</p>
            ) : row.toolCalls.length === 0 ? (
              <p className="text-xs text-slate-400">לא נקראו כלים.</p>
            ) : (
              <pre dir="ltr" className="text-[11px] bg-slate-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {row.toolCalls.map((c) => `${c.name} ${JSON.stringify(c.input)}\n  → ${JSON.stringify(c.resultSummary)}`).join('\n')}
              </pre>
            )}
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-2 space-y-1">
            <p className="text-xs"><b>ציטוט:</b> <span dir="auto">{i.evidence}</span></p>
            <p className="text-xs"><b>מה היה צריך:</b> <span dir="auto">{i.expected}</span></p>
            <p className="text-xs"><b>הצעת תיקון:</b> <span dir="auto">{i.suggestedFix}</span></p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy || row.status === 'converted'}
              onClick={() => onAction('convert')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg disabled:opacity-50"
            >
              <FlaskConical size={14} />
              {row.caseId ? `נשמר כבדיקה (${row.caseId})` : 'הפוך לבדיקת רגרסיה'}
            </button>
            {row.status !== 'fixed' ? (
              <button
                disabled={busy}
                onClick={() => onAction('mark_fixed')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                סמן כתוקן
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => onAction('reopen')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
              >
                <RotateCcw size={14} />
                פתח מחדש
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * /admin/ai-coach/reviews — "שיחות קלי": the daily AI review of the קלי AI chat.
 * Super admin only: this gate is UX; the real boundary is requireSuperAdminApi on
 * /api/admin/ai-coach/reviews/**. Humans approve every fix — the reviewer only proposes.
 */
export default function AiCoachReviewsPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [days, setDays] = useState(14);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<RowFilter>({ category: 'all', minSeverity: 1, rootCause: 'all', status: 'not_fixed', source: 'all' });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setChecking(false);
        return;
      }
      try {
        const role = await checkUserRole(user.uid);
        setAllowed(role.isSuperAdmin);
      } catch {
        setAllowed(false);
      }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/ai-coach/reviews?days=${days}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      setData((await res.json()) as ListResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (allowed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, days]);

  const runNow = async () => {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch('/api/admin/ai-coach/reviews/run', { method: 'POST', body: JSON.stringify({ maxThreads: 25 }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setNotice(
        `נסקרו ${body.reviewed} שיחות · דולגו ${body.skippedOptOut} (ויתרו) · ${body.failed} נכשלו · עלות $${Number(body.costUsd ?? 0).toFixed(3)}${body.stoppedBy ? ` · נעצר: ${body.stoppedBy}` : ''}${body.remaining ? ' · נשארו שיחות, אפשר להריץ שוב' : ''}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההרצה נכשלה');
    } finally {
      setRunning(false);
    }
  };

  const act = async (row: FlaggedRow, action: 'mark_fixed' | 'reopen' | 'convert') => {
    setBusyKey(row.key);
    setError(null);
    try {
      const res = await authedFetch('/api/admin/ai-coach/reviews/actions', {
        method: 'POST',
        body: JSON.stringify({ action, reviewDocId: row.reviewDocId, issueId: row.issue.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (action === 'convert') setNotice(`נשמרה בדיקת רגרסיה ${body.caseId}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפעולה נכשלה');
    } finally {
      setBusyKey(null);
    }
  };

  const rows = useMemo(() => (data ? filterRows(data.rows, filter) : []), [data, filter]);

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

  const s = data?.summary;
  const select = 'text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white';

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="me-auto">
          <h1 className="text-xl font-black text-slate-900">שיחות קלי</h1>
          <p className="text-sm text-slate-500">סקירה יומית של צ׳אט קלי AI: טעויות, הסבר וסיבה, והצעת תיקון. תיקון נכנס רק אחרי אישור אנושי.</p>
        </div>
        <select className={select} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="טווח ימים">
          <option value={7}>7 ימים</option>
          <option value={14}>14 ימים</option>
          <option value={30}>30 ימים</option>
          <option value={90}>90 ימים</option>
        </select>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          רענן
        </button>
        <button onClick={runNow} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          הרץ סקירה עכשיו
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">{notice}</p>}

      {s && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['שיחות שנסקרו', String(s.reviews)],
              ['ציון ממוצע', s.avgScore === null ? '—' : `${s.avgScore} / 5`],
              ['ממצאים', `${s.issues} (${s.flaggedTurns} תורות)`],
              ['עלות הסקירה', `$${s.costUsd.toFixed(3)}`],
            ].map(([label, value]) => (
              <div key={label} className="border border-slate-200 rounded-xl p-3 bg-white">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-lg font-black text-slate-900 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="border border-slate-200 rounded-xl p-3 bg-white">
              <p className="text-xs font-bold text-slate-500 mb-2">מגמת ציון יומי</p>
              <ScoreTrend points={data!.trend} />
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-white">
              <p className="text-xs font-bold text-slate-500 mb-2">סוגי טעויות מובילים</p>
              <Bars items={s.topCategories} label={(k) => CATEGORY_LABEL_HE[k]} />
            </div>
            <div className="border border-slate-200 rounded-xl p-3 bg-white">
              <p className="text-xs font-bold text-slate-500 mb-2">סיבות שורש מובילות</p>
              <Bars items={s.topRootCauses} label={(k) => ROOT_CAUSE_LABEL_HE[k]} />
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <select className={select} value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value as RowFilter['category'] })} aria-label="סוג">
          <option value="all">כל הסוגים</option>
          {ISSUE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL_HE[c]}</option>
          ))}
        </select>
        <select className={select} value={filter.minSeverity} onChange={(e) => setFilter({ ...filter, minSeverity: Number(e.target.value) as 1 | 2 | 3 })} aria-label="חומרה">
          <option value={1}>כל החומרות</option>
          <option value={2}>ברור ומעלה</option>
          <option value={3}>חמור בלבד</option>
        </select>
        <select className={select} value={filter.rootCause} onChange={(e) => setFilter({ ...filter, rootCause: e.target.value as RowFilter['rootCause'] })} aria-label="סיבת שורש">
          <option value="all">כל הסיבות</option>
          {ROOT_CAUSES.map((c) => (
            <option key={c} value={c}>{ROOT_CAUSE_LABEL_HE[c]}</option>
          ))}
        </select>
        <select className={select} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as RowFilter['status'] })} aria-label="סטטוס">
          <option value="not_fixed">לא תוקן</option>
          <option value="open">פתוח</option>
          <option value="converted">הוסב לבדיקה</option>
          <option value="fixed">תוקן</option>
          <option value="all">הכל</option>
        </select>
        <span className="text-xs text-slate-500">{rows.length} ממצאים</span>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">אין ממצאים בסינון הזה.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <RowCard key={row.key} row={row} busy={busyKey === row.key} onAction={(a) => act(row, a)} />
          ))}
        </ul>
      )}
    </div>
  );
}
