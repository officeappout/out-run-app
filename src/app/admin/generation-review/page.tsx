'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/generation-review — "בקרת אימונים ומסלולים": what the nightly generation review found in
 * the sessions the generators showed users (flag enable_generation_review). Super admin only:
 * this gate is UX; the real boundary is requireSuperAdminApi on /api/admin/generation-review/**.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import { Loader2, Play, RefreshCw, ShieldAlert } from 'lucide-react';
import { RULES, RULE_BY_ID, type RuleId } from '@/lib/generation-review/invariants';
import { GENERATION_TYPES, GENERATION_TYPE_LABEL_HE, type GenerationType } from '@/lib/generation-review/types';
import { filterRows, type FlaggedRow, type RowFilter } from '@/lib/generation-review/review/list';
import type { GenStatsDelta } from '@/lib/generation-review/review/stats';
import StatsBars from '@/features/admin/components/generation-review/StatsBars';
import FlaggedRowItem from '@/features/admin/components/generation-review/FlaggedRowItem';

interface ListResponse {
  days: number;
  summary: GenStatsDelta;
  trend: Array<{ day: string; sessions: number; flagged: number; reports: number }>;
  rows: FlaggedRow[];
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, { ...init, headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' } });
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const entries = (m: Record<string, number | undefined> = {}) =>
  Object.entries(m).filter(([, v]) => (v ?? 0) > 0).map(([key, count]) => ({ key, count: count as number })).sort((a, b) => b.count - a.count);

export default function GenerationReviewPage() {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [days, setDays] = useState(14);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<RowFilter>({ status: 'open' });

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    try {
      setAllowed(!!user && (await checkUserRole(user.uid)).isSuperAdmin);
    } catch {
      setAllowed(false);
    } finally {
      setChecking(false);
    }
  }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/admin/generation-review?days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `שגיאה ${res.status}`);
      setData(json);
    } catch (e) {
      setNotice(`הטעינה נכשלה: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await authedFetch('/api/admin/generation-review/run', { method: 'POST', body: '{}' });
      const json = await res.json();
      setNotice(res.ok ? `נבדקו ${json.reviewed} אימונים, ${json.flagged} עם ממצאים${json.remaining ? ' (נשארו עוד — להריץ שוב)' : ''}.` : `ההרצה נכשלה (${json?.error ?? res.status})`);
      if (res.ok) await load();
    } finally {
      setRunning(false);
    }
  };

  const act = async (row: FlaggedRow, action: 'mark_fixed' | 'reopen' | 'fixture') => {
    setBusy(row.logId);
    try {
      const res = await authedFetch('/api/admin/generation-review/actions', { method: 'POST', body: JSON.stringify({ action, logId: row.logId }) });
      const json = await res.json();
      if (!res.ok) {
        setNotice(`הפעולה נכשלה (${json?.error ?? res.status})`);
        return;
      }
      if (action === 'fixture' && json.fixture) {
        download(`${json.fixture.id}.json`, json.fixture);
        setNotice('הקובץ ירד. להוסיף אותו ל-src/lib/generation-review/__tests__/regressions/ ב-PR — הבדיקה תרוץ עליו אוטומטית.');
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(() => (data ? filterRows(data.rows, filter) : []), [data, filter]);

  if (checking) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (!allowed) {
    return (
      <div className="p-8 flex flex-col items-center gap-2 text-slate-500" dir="rtl">
        <ShieldAlert className="w-8 h-8" />
        <p>הדף הזה למנהלי־על בלבד.</p>
      </div>
    );
  }

  const s = data?.summary;
  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen text-slate-900" dir="rtl">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">בקרת אימונים ומסלולים</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-sm border border-slate-200 rounded-lg px-2 py-1 bg-white">
          {[1, 7, 14, 30, 60].map((d) => <option key={d} value={d}>{d === 1 ? 'היום' : `${d} ימים`}</option>)}
        </select>
        <button onClick={() => void load()} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> רענן
        </button>
        <button onClick={() => void runNow()} disabled={running} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-white bg-sky-600 rounded-lg disabled:opacity-50">
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} הרץ עכשיו
        </button>
      </header>
      {notice && <p className="text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-3">{notice}</p>}

      {s && (
        <section className="grid gap-4 md:grid-cols-4">
          {[
            ['אימונים שנבדקו', s.sessions],
            ['עם ממצאים', s.flagged],
            ['דיווחי משתמשים', s.reports],
            ['עלות AI', `$${(s.llmCostUsd ?? 0).toFixed(3)}`],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </section>
      )}

      {s && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-bold mb-2">לפי חוק</h2>
            <StatsBars
              items={entries(s.byRule)}
              label={(k) => RULE_BY_ID[k as RuleId]?.titleHe ?? k}
              active={filter.rule}
              onPick={(k) => setFilter((f) => ({ ...f, rule: f.rule === k ? undefined : k }))}
            />
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-bold mb-2">לפי מחולל (עם ממצאים / נבדקו)</h2>
            <StatsBars
              items={entries(s.byType).map((e) => ({ key: e.key, count: (s.flaggedByType as Record<string, number>)[e.key] ?? 0 }))}
              label={(k) => `${GENERATION_TYPE_LABEL_HE[k as GenerationType] ?? k} (${(s.byType as Record<string, number>)[k] ?? 0})`}
              active={filter.type}
              onPick={(k) => setFilter((f) => ({ ...f, type: f.type === k ? undefined : k }))}
            />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2 text-sm">
          <select value={filter.rule ?? ''} onChange={(e) => setFilter((f) => ({ ...f, rule: e.target.value || undefined }))} className="border border-slate-200 rounded-lg px-2 py-1 bg-white">
            <option value="">כל החוקים</option>
            {RULES.map((r) => <option key={r.id} value={r.id}>{r.titleHe}</option>)}
          </select>
          <select value={filter.type ?? ''} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value || undefined }))} className="border border-slate-200 rounded-lg px-2 py-1 bg-white">
            <option value="">כל המחוללים</option>
            {GENERATION_TYPES.map((t) => <option key={t} value={t}>{GENERATION_TYPE_LABEL_HE[t]}</option>)}
          </select>
          <select value={filter.day ?? ''} onChange={(e) => setFilter((f) => ({ ...f, day: e.target.value || undefined }))} className="border border-slate-200 rounded-lg px-2 py-1 bg-white">
            <option value="">כל הימים</option>
            {(data?.trend ?? []).map((t) => <option key={t.day} value={t.day}>{t.day}</option>)}
          </select>
          <select value={filter.status ?? 'open'} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as RowFilter['status'] }))} className="border border-slate-200 rounded-lg px-2 py-1 bg-white">
            <option value="open">פתוחים</option>
            <option value="fixed">תוקנו</option>
            <option value="fixture">הפכו לבדיקה</option>
            <option value="all">הכל</option>
          </select>
          <label className="flex items-center gap-1 text-slate-600">
            <input type="checkbox" checked={!!filter.reportedOnly} onChange={(e) => setFilter((f) => ({ ...f, reportedOnly: e.target.checked }))} /> רק עם דיווח
          </label>
          <span className="text-slate-400 self-center">{rows.length} תוצאות</span>
        </div>
        <ul className="space-y-2">
          {rows.map((r) => <FlaggedRowItem key={r.logId} row={r} busy={busy === r.logId} onAction={(a) => void act(r, a)} />)}
          {data && rows.length === 0 && <li className="text-sm text-slate-400">אין אימונים מסומנים בסינון הזה.</li>}
        </ul>
      </section>
    </div>
  );
}
