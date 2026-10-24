'use client';

/**
 * HubBulkAllDialog — "approve pending routes nationwide" (owner request
 * 22.10.2026). Step 1 preview: per-authority counts + total under simple
 * filters (score range — default 70+ —, low confidence excluded unless opted in
 * (owner 24.10.2026), authority kind, min length, known-research vs other,
 * authority checkboxes); the server re-applies the review filter at write time. Step 2 confirm: type the exact total ("אשר N" or N). Step 3
 * run: sequential per authority with progress and a per-authority summary.
 * Page modal: backdrop z-[80] / panel z-[81] (.cursorrules page-modals row).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ModeratorInfo } from '@/features/admin/services/moderation.service';
import {
  approvePendingRoutesBatch,
  loadPendingRoutesNationwide,
  type PendingRoutesPreviewResponse,
} from '@/features/admin/services/city-mapping-hub-moderation.service';
import {
  applyBulkFilters, authorityOptions, buildBulkPreview, confirmPhrase, geometryExclusions, isConfirmValid, runBulkApprove,
  type OriginFilter, type RunSummary,
} from '@/lib/city-mapping-hub/bulk-approve.logic';
import {
  AUTHORITY_KIND_LABELS, NATIONWIDE_APPROVE_DEFAULT_FILTER, SCORE_PRESETS, describeReviewFilter, parseScoreBound, presetIdOf,
  type AuthorityKindFilter, type RouteReviewFilter,
} from '@/lib/city-mapping-hub/review-filters';

const num = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

export default function HubBulkAllDialog({ admin, onClose, onDone }: { admin: ModeratorInfo; onClose: () => void; onDone: () => void }) {
  const [data, setData] = useState<PendingRoutesPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Default (owner 24.10.2026): score ≥ 70 and never a low-confidence route — a nationwide approve must
  // not silently publish the city low floor's 55-69 fills; the admin can widen the range on purpose.
  const [scoreMin, setScoreMin] = useState(String(NATIONWIDE_APPROVE_DEFAULT_FILTER.scoreMin ?? ''));
  const [scoreMax, setScoreMax] = useState('');
  const [includeLow, setIncludeLow] = useState(false);
  const [kind, setKind] = useState<AuthorityKindFilter>('all');
  const [minKm, setMinKm] = useState('0');
  const [origin, setOrigin] = useState<OriginFilter>('all');
  const [unselected, setUnselected] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    let live = true;
    loadPendingRoutesNationwide().then((d) => { if (live) setData(d); }).catch((e) => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  const names = useMemo(() => new Map(Object.entries(data?.authorityNames ?? {})), [data]);
  const options = useMemo(() => authorityOptions(data?.candidates ?? [], names), [data, names]);
  const selectedIds = useMemo(() => new Set(options.filter((o) => !unselected.has(o.authorityId)).map((o) => o.authorityId)), [options, unselected]);
  const review = useMemo<RouteReviewFilter>(() => ({
    authorityKind: kind, scoreMin: parseScoreBound(scoreMin), scoreMax: parseScoreBound(scoreMax), lowConfidence: includeLow ? 'any' : 'exclude',
  }), [kind, scoreMin, scoreMax, includeLow]);
  const preview = useMemo(
    () => buildBulkPreview(applyBulkFilters(data?.candidates ?? [], { minScore: 0, minKm: num(minKm), origin, authorityIds: selectedIds, review }), names),
    [data, minKm, origin, selectedIds, names, review],
  );
  const lowInSelection = useMemo(
    () => (data?.candidates ?? []).filter((c) => selectedIds.has(c.authorityId) && c.lowConfidenceReason).length,
    [data, selectedIds],
  );
  const excluded = useMemo(() => geometryExclusions(data?.candidates ?? [], selectedIds), [data, selectedIds]);
  const countFor = (id: string) => preview.perAuthority.find((a) => a.authorityId === id)?.count ?? 0;
  const toggle = (id: string) => setUnselected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const valid = isConfirmValid(typed, preview.total);

  const run = useCallback(async () => {
    if (ran.current || !valid) return;
    ran.current = true;
    setRunning(true);
    setProgress({ done: 0, total: preview.perAuthority.length });
    try {
      const s = await runBulkApprove(preview, (id, ids) => approvePendingRoutesBatch(id, ids, admin, fetch, review),
        (done, total) => setProgress({ done, total }));
      setSummary(s);
    } finally {
      setRunning(false);
      onDone();
    }
  }, [valid, preview, admin, onDone, review]);

  const field = 'w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm';
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-900/40" onClick={() => { if (!running) onClose(); }} aria-hidden />
      <div role="alertdialog" aria-modal="true" aria-labelledby="hub-bulkall-title" data-testid="hub-bulkall" dir="rtl"
        className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90vh] w-[min(640px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white p-5 shadow-2xl">
        <h3 id="hub-bulkall-title" className="text-base font-black">אישור מסלולים ממתינים בכל הארץ</h3>
        {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-sm font-semibold text-red-700">{error}</p>}
        {!data && !error && <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> טוען מסלולים ממתינים…</p>}

        {data && !summary && (
          <div className="mt-3 flex min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3 text-sm font-semibold">
              <label className="flex flex-col gap-1">טווח ציון
                <select className={field} value={presetIdOf(review.scoreMin, review.scoreMax)} disabled={running} data-testid="hub-bulkall-score-preset"
                  onChange={(e) => { const p = SCORE_PRESETS.find((x) => x.id === e.target.value); if (p) { setScoreMin(p.min == null ? '' : String(p.min)); setScoreMax(p.max == null ? '' : String(p.max)); } }}>
                  {SCORE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  <option value="custom">מותאם</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">ציון מ-<input className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm" inputMode="numeric" value={scoreMin} disabled={running} onChange={(e) => setScoreMin(e.target.value)} data-testid="hub-bulkall-score" /></label>
              <label className="flex flex-col gap-1">עד<input className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm" inputMode="numeric" value={scoreMax} disabled={running} onChange={(e) => setScoreMax(e.target.value)} data-testid="hub-bulkall-score-max" /></label>
              <label className="flex flex-col gap-1">סוג רשות
                <select className={field} value={kind} disabled={running} onChange={(e) => setKind(e.target.value as AuthorityKindFilter)} data-testid="hub-bulkall-kind">
                  {(['all', 'municipal', 'regional'] as const).map((k) => <option key={k} value={k}>{AUTHORITY_KIND_LABELS[k]}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1 self-end pb-1"><input type="checkbox" checked={includeLow} disabled={running} onChange={(e) => setIncludeLow(e.target.checked)} data-testid="hub-bulkall-include-low" /> כלול ביטחון נמוך</label>
              <label className="flex flex-col gap-1">אורך מינימלי (ק״מ)<input className={field} inputMode="decimal" value={minKm} disabled={running} onChange={(e) => setMinKm(e.target.value)} data-testid="hub-bulkall-km" /></label>
              <label className="flex flex-col gap-1">מקור
                <select className={field} value={origin} disabled={running} onChange={(e) => setOrigin(e.target.value as OriginFilter)}>
                  <option value="all">הכול</option><option value="known">מסלולים מוכרים (מחקר)</option><option value="other">שאר המסלולים</option>
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-500" data-testid="hub-bulkall-filter-summary">סינון: {describeReviewFilter(review)}{(review.scoreMin != null || review.scoreMax != null) ? ' · מסלול בלי ציון לא נכלל בטווח ציון.' : ''}</p>
            {!includeLow && lowInSelection > 0 && <p className="text-xs font-semibold text-amber-700">{lowInSelection} מסלולים בביטחון נמוך (למשל השלמת עיר בציון 55–69) לא נכללים — סמנו &quot;כלול ביטחון נמוך&quot; כדי לאשר גם אותם.</p>}
            {(excluded.gap > 0 || excluded.unmeasured > 0) && (
              <div role="note" data-testid="hub-bulkall-excluded" className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-sm font-semibold text-amber-800">
                {excluded.gap > 0 && <p>⚠ {excluded.gap} מסלולים עם קפיצה ישרה חשודה (500 מ׳ ומעלה) הוחרגו מהאישור.</p>}
                {excluded.unmeasured > 0 && <p>⚠ {excluded.unmeasured} מסלולים בלי נתיב שאפשר למדוד הוחרגו (לא ניתן לאמת גיאומטריה).</p>}
              </div>
            )}
            {data.unattributed > 0 && <p className="text-xs text-amber-700">{data.unattributed} ממתינים ללא רשות מזוהה לא נכללים.</p>}
            <div className="min-h-0 overflow-auto rounded-xl border border-slate-100" aria-label="רשויות">
              <div className="flex gap-3 border-b border-slate-100 px-3 py-1.5 text-xs font-bold">
                <button type="button" disabled={running} onClick={() => setUnselected(new Set())}>בחר הכול</button>
                <button type="button" disabled={running} onClick={() => setUnselected(new Set(options.map((o) => o.authorityId)))}>נקה הכול</button>
              </div>
              <ul className="max-h-[38vh] divide-y divide-slate-50">
                {options.map((o) => (
                  <li key={o.authorityId} className="flex items-center gap-2 px-3 py-1 text-sm">
                    <input type="checkbox" checked={selectedIds.has(o.authorityId)} disabled={running} onChange={() => toggle(o.authorityId)} aria-label={o.name} />
                    <span className="flex-1">{o.name}</span>
                    <span className="tabular-nums text-slate-500">{countFor(o.authorityId)} / {o.pending}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm">יאושרו בדיוק <b data-testid="hub-bulkall-total">{preview.total}</b> מסלולים ב-{preview.perAuthority.length} רשויות. הפעולה זהה לאישור במרכז האישורים (פרסום, שידור לסגמנטים, חישוב מחדש, יומן החלטות).</p>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              להמשך הקלידו <code className="rounded bg-slate-100 px-1">{confirmPhrase(preview.total)}</code>
              <input className="rounded-lg border border-slate-200 px-2 py-1" value={typed} disabled={running || preview.total === 0} onChange={(e) => setTyped(e.target.value)} data-testid="hub-bulkall-typed" />
            </label>
            {progress && <p role="status" className="text-sm font-bold text-emerald-800" data-testid="hub-bulkall-progress">מאשר… {progress.done} / {progress.total} רשויות</p>}
          </div>
        )}

        {summary && (
          <div className="mt-3 flex min-h-0 flex-col gap-2" data-testid="hub-bulkall-summary">
            <p className="text-sm font-bold">אושרו {summary.approved} מתוך {summary.requested}{summary.skipped ? ` · דולגו ${summary.skipped} (כבר לא ממתינים)` : ''}.</p>
            {summary.failedAuthorities.length > 0 && (
              <div role="alert" className="rounded-lg bg-red-50 px-2 py-1 text-sm text-red-700">
                נכשלו {summary.failedAuthorities.length} רשויות (מה שאושר נשאר מאושר; אפשר להריץ שוב בבטחה):
                <ul className="list-disc ps-5">{summary.failedAuthorities.map((r) => <li key={r.authorityId}>{r.name}: {r.error}</li>)}</ul>
              </div>
            )}
            <ul className="max-h-[38vh] divide-y divide-slate-50 overflow-auto rounded-xl border border-slate-100 text-sm">
              {summary.authorities.map((r) => (
                <li key={r.authorityId} className="flex gap-2 px-3 py-1"><span className="flex-1">{r.name}</span>
                  <span className="tabular-nums">{r.error ? 'נכשל' : `${r.approved}/${r.requested}`}</span></li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {!summary && (
            <button type="button" disabled={running || !valid || !data} onClick={run} data-testid="hub-bulkall-ok"
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {running && <Loader2 className="h-4 w-4 animate-spin" />} אשר {preview.total}
            </button>
          )}
          <button type="button" disabled={running} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">{summary ? 'סגור' : 'ביטול'}</button>
        </div>
      </div>
    </>
  );
}
