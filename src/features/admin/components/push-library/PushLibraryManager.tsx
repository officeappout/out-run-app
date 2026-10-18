'use client';

/**
 * ספריית פושים — every push the app sends, grouped by pushType: what it is
 * for and WHEN the code sends it (read-only, from the catalog), its library
 * variants (on/off, edit, archive — never delete) and the code defaults that
 * ship when no live variant fits.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { Archive, ArchiveRestore, Bell, Copy, Pencil, Plus, RefreshCw, Search, AlertTriangle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  PUSH_AGE_BANDS,
  PUSH_CATALOG,
  PUSH_DEEP_LINK_ROUTES,
  PUSH_LEVERS,
  PUSH_PERSONAS,
  PUSH_PRIMARY_GOALS,
  previewPushCopy,
  type PushCatalogEntry,
} from '@/features/notifications/push-library/push-library.core';
import {
  archivePushRow,
  loadPushLibrary,
  setPushRowActive,
  unarchivePushRow,
  PushCopyValidationError,
  type PushLibraryRow,
} from '@/features/admin/services/push-library.service';
import { PushCopyEditor, type PushEditorTarget } from './PushCopyEditor';

const LEVER_LABEL = Object.fromEntries(PUSH_LEVERS.map((l) => [l.id, l.label]));
const ROUTE_LABEL = Object.fromEntries(PUSH_DEEP_LINK_ROUTES.map((r) => [r.id, r.label]));
const AUDIENCE_LABEL = Object.fromEntries(
  [...PUSH_PERSONAS, ...PUSH_AGE_BANDS, ...PUSH_PRIMARY_GOALS].map((o) => [o.id, o.label]),
);

function conditionSummary(entry: PushCatalogEntry, conditions: Record<string, string[]> | null | undefined): string[] {
  if (!conditions) return [];
  return Object.entries(conditions).flatMap(([key, values]) => {
    const cond = entry.conditions?.find((c) => c.key === key);
    if (!cond || !values.length) return [];
    return [`${cond.label}: ${values.map((v) => cond.options.find((o) => o.value === v)?.label ?? v).join(', ')}`];
  });
}

function audienceSummary(a: PushLibraryRow['audience']): string[] {
  if (!a) return [];
  return [...(a.persona ?? []), ...(a.ageBand ?? []), ...(a.primaryGoal ?? [])].map((v) => AUDIENCE_LABEL[v] ?? v);
}

/** Live variants per condition group — the spec asks for 2 to 4 rotating variants. */
function variantCountWarnings(entry: PushCatalogEntry, rows: PushLibraryRow[]): string[] {
  const live = rows.filter((r) => r.active && !r.archived && !r.needsRewrite);
  if (live.length === 0) return [];
  const groups = new Map<string, number>();
  for (const r of live) {
    const key = conditionSummary(entry, r.conditions).join(' · ') || 'כללי';
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return Array.from(groups.entries())
    .filter(([, n]) => n < 2 || n > 4)
    .map(([key, n]) => `${key}: ${n} וריאנטים פעילים (מומלץ 2 עד 4)`);
}

function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'cyan' | 'amber' | 'violet' }) {
  const cls = {
    slate: 'bg-slate-800 text-gray-300 border-slate-700',
    cyan: 'bg-cyan-500/10 text-cyan-200 border-cyan-500/30',
    amber: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
    violet: 'bg-violet-500/10 text-violet-200 border-violet-500/30',
  }[tone];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${cls}`}>{children}</span>;
}

function RowCard({
  entry,
  row,
  busy,
  onToggle,
  onEdit,
  onArchive,
  onRestore,
}: {
  entry: PushCatalogEntry;
  row: PushLibraryRow;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const preview = previewPushCopy({ pushType: row.pushType, title: row.title, body: row.body, deepLink: row.deepLink });
  const chips = [...conditionSummary(entry, row.conditions), ...audienceSummary(row.audience)];
  return (
    <div className={`rounded-xl border p-3 flex gap-3 ${row.archived ? 'border-slate-800 opacity-60' : 'border-slate-700 bg-slate-900/60'}`}>
      <div className="pt-0.5">
        {!row.archived && (
          <button
            type="button"
            role="switch"
            aria-checked={row.active}
            aria-label={row.active ? 'כיבוי הווריאנט' : 'הפעלת הווריאנט'}
            disabled={busy}
            onClick={onToggle}
            className={`w-10 h-6 rounded-full relative transition-colors ${row.active ? 'bg-emerald-500' : 'bg-slate-700'} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${row.active ? 'right-0.5' : 'right-[18px]'}`} />
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="text-sm font-semibold text-white break-words">{preview.title}</div>
        <div className="text-sm text-gray-300 break-words">{preview.body}</div>
        <div className="flex flex-wrap gap-1.5">
          {row.legacy && <Chip tone="violet">ספרייה ישנה</Chip>}
          {row.needsRewrite && <Chip tone="amber">לשכתוב{row.rewriteReasons.length ? `: ${row.rewriteReasons.join(', ')}` : ''}</Chip>}
          {row.archived && <Chip>בארכיון{row.archivedReason ? `: ${row.archivedReason}` : ''}</Chip>}
          {chips.map((c) => (
            <Chip key={c} tone="cyan">{c}</Chip>
          ))}
          {row.timeWindow && <Chip>{`${row.timeWindow.start} עד ${row.timeWindow.end}`}</Chip>}
          {row.fallbackOnly && <Chip>גיבוי בלבד</Chip>}
          <Chip>{ROUTE_LABEL[row.deepLink ?? entry.deepLinks[0]] ?? row.deepLink}</Chip>
          <span className="text-[11px] text-gray-500 font-mono self-center" dir="ltr">
            {row.id} · v{row.version}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {!row.archived && (
          <button type="button" onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-800" aria-label="עריכה" title="עריכה">
            <Pencil size={15} />
          </button>
        )}
        {row.archived ? (
          <button type="button" disabled={busy} onClick={onRestore} className="p-1.5 rounded-lg hover:bg-slate-800" aria-label="החזרה מהארכיון" title="החזרה מהארכיון">
            <ArchiveRestore size={15} />
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={onArchive} className="p-1.5 rounded-lg hover:bg-slate-800" aria-label="העברה לארכיון" title="העברה לארכיון">
            <Archive size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function PushTypeCard({
  entry,
  rows,
  showArchived,
  busyId,
  onEdit,
  onToggle,
  onArchive,
  onRestore,
}: {
  entry: PushCatalogEntry;
  rows: PushLibraryRow[];
  showArchived: boolean;
  busyId: string | null;
  onEdit: (t: PushEditorTarget) => void;
  onToggle: (row: PushLibraryRow) => void;
  onArchive: (row: PushLibraryRow) => void;
  onRestore: (row: PushLibraryRow) => void;
}) {
  const visible = rows.filter((r) => showArchived || !r.archived);
  const liveCount = rows.filter((r) => r.active && !r.archived && !r.needsRewrite).length;
  const warnings = variantCountWarnings(entry, rows);
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-4" id={entry.pushType}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
            {entry.label}
            <Chip tone="cyan">{LEVER_LABEL[entry.lever]}</Chip>
            <span className="text-[11px] font-mono text-gray-500" dir="ltr">{entry.pushType}</span>
          </h2>
          <p className="text-sm text-gray-300">{entry.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onEdit({ entry, row: null })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-sm font-bold hover:bg-cyan-400"
        >
          <Plus size={15} /> וריאנט חדש
        </button>
      </header>

      <dl className="grid sm:grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-gray-500">מתי נשלח</dt>
        <dd className="text-gray-300">{entry.whenSent}</dd>
        <dt className="text-gray-500">שולח</dt>
        <dd className="text-gray-300 font-mono" dir="ltr">{`${entry.sender} · ${entry.channel}`}</dd>
        <dt className="text-gray-500">משתנים</dt>
        <dd className="text-gray-300 font-mono">{entry.vars.join(' ')}</dd>
        <dt className="text-gray-500">יעדים אפשריים</dt>
        <dd className="text-gray-300">{entry.deepLinks.map((d) => ROUTE_LABEL[d] ?? d).join(' · ')}</dd>
      </dl>

      {entry.pending && (
        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">{entry.pending}</p>
      )}

      <div className="space-y-2">
        <div className="text-xs text-gray-400">
          וריאנטים בספרייה: {liveCount} פעילים מתוך {rows.filter((r) => !r.archived).length}
          {liveCount === 0 && ' · כרגע נשלחים הטקסטים שבקוד (למטה)'}
        </div>
        {warnings.map((w) => (
          <p key={w} className="flex items-center gap-1.5 text-xs text-amber-300">
            <AlertTriangle size={13} /> {w}
          </p>
        ))}
        {visible.map((row) => (
          <RowCard
            key={row.id}
            entry={entry}
            row={row}
            busy={busyId === row.id}
            onToggle={() => onToggle(row)}
            onEdit={() => onEdit({ entry, row })}
            onArchive={() => onArchive(row)}
            onRestore={() => onRestore(row)}
          />
        ))}
      </div>

      <details className="rounded-xl border border-slate-800 p-3">
        <summary className="text-sm cursor-pointer text-gray-300">
          טקסטים שבקוד ({entry.defaults.length}) · נשלחים כשאין וריאנט פעיל שמתאים
        </summary>
        <ul className="mt-3 space-y-2">
          {entry.defaults.map((d, i) => {
            const p = previewPushCopy({ pushType: entry.pushType, title: d.title, body: d.body, deepLink: entry.deepLinks[0] });
            const chips = [
              ...conditionSummary(entry, d.conditions),
              ...audienceSummary(d.audience ?? null),
              ...(d.fallbackOnly ? ['רק כשאין ערך למשתנה'] : []),
            ];
            return (
              <li key={i} className="flex gap-3 items-start text-sm">
                <div className="flex-1 min-w-0">
                  <div className="text-white break-words">{p.title}</div>
                  <div className="text-gray-400 break-words">{p.body}</div>
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {chips.map((c) => (
                        <Chip key={c}>{c}</Chip>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onEdit({
                      entry,
                      row: null,
                      seed: {
                        title: d.title,
                        body: d.body,
                        audience: d.audience,
                        conditions: d.conditions,
                        deepLink: entry.deepLinks[0],
                        fallbackOnly: d.fallbackOnly,
                      },
                    })
                  }
                  className="flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 shrink-0"
                >
                  <Copy size={13} /> העתקה לווריאנט
                </button>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

export function PushLibraryManager() {
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<PushLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PushEditorTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await loadPushLibrary());
    } catch (err) {
      console.error('[push-library] load failed', err);
      setError('טעינת הספרייה נכשלה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const rowsByType = useMemo(() => {
    const m = new Map<string, PushLibraryRow[]>();
    for (const r of rows) {
      if (!m.has(r.pushType)) m.set(r.pushType, []);
      m.get(r.pushType)!.push(r);
    }
    return m;
  }, [rows]);

  const q = search.trim().toLowerCase();
  const entries = PUSH_CATALOG.filter((e) => {
    if (!q) return true;
    const hay = [e.label, e.pushType, e.sender, e.description, ...(rowsByType.get(e.pushType) ?? []).flatMap((r) => [r.title, r.body])]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });

  const act = async (row: PushLibraryRow, fn: () => Promise<void>) => {
    setBusyId(row.id);
    setNotice('');
    try {
      await fn();
      await reload();
    } catch (err) {
      setNotice(err instanceof PushCopyValidationError ? `אי אפשר להפעיל: ${err.message}` : 'הפעולה נכשלה');
      console.error('[push-library] action failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const totals = {
    live: rows.filter((r) => r.active && !r.archived && !r.needsRewrite).length,
    rewrite: rows.filter((r) => r.needsRewrite && !r.archived).length,
    archived: rows.filter((r) => r.archived).length,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 bg-slate-950 rounded-[22px] text-gray-100" dir="rtl" data-dark-surface="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">ספריית פושים</h1>
          <p className="text-sm text-gray-400 mt-1">
            הקוד מחליט מתי שולחים. כאן מחליטים מה כתוב. שינוי נכנס לתוקף תוך 10 דקות, בלי פריסה.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/notifications" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-sm hover:bg-slate-800">
            <Bell size={15} /> מרכז התראות
          </Link>
          <button type="button" onClick={reload} className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800" aria-label="רענון">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1 min-w-[220px] flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
          <Search size={15} className="text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי פוש, שולח או טקסט"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          להציג ארכיון ({totals.archived})
        </label>
        <span className="text-xs text-gray-400">
          {totals.live} וריאנטים פעילים · {totals.rewrite} לשכתוב
        </span>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {entries.map((e) => (
          <a key={e.pushType} href={`#${e.pushType}`} className="px-2.5 py-1 rounded-full text-xs border border-slate-700 text-gray-300 hover:border-cyan-500">
            {e.label}
          </a>
        ))}
      </nav>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-amber-300">{notice}</p>}

      <div className="space-y-5">
        {entries.map((entry) => (
          <PushTypeCard
            key={entry.pushType}
            entry={entry}
            rows={rowsByType.get(entry.pushType) ?? []}
            showArchived={showArchived}
            busyId={busyId}
            onEdit={setEditing}
            onToggle={(row) => act(row, () => setPushRowActive(row, !row.active, uid))}
            onArchive={(row) => {
              const reason = window.prompt('למה להעביר לארכיון? (נשמר לתיעוד)', '');
              if (reason === null) return;
              act(row, () => archivePushRow(row, reason.trim(), uid));
            }}
            onRestore={(row) => act(row, () => unarchivePushRow(row, uid))}
          />
        ))}
      </div>

      {editing && (
        <PushCopyEditor
          {...editing}
          uid={uid}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
