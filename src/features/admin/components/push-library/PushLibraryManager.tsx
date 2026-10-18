'use client';

/**
 * ספריית פושים — every push the app sends, grouped by pushType: what it is
 * for and WHEN the code sends it (read-only, from the catalog), its library
 * variants (on/off, edit, archive — never delete) and the code defaults that
 * ship when no live variant fits.
 *
 * Light admin style (white cards, slate borders, brand cyan accents), like
 * /admin/system-settings. Male/female pairs show side by side; a row that
 * breaks the send-time rules is flagged (it is skipped when sending).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { Archive, ArchiveRestore, Bell, Copy, Pencil, Plus, RefreshCw, Search, AlertTriangle, Ban } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  PUSH_AGE_BANDS,
  PUSH_CATALOG,
  PUSH_DEEP_LINK_ROUTES,
  PUSH_LEVERS,
  PUSH_PERSONAS,
  PUSH_PRIMARY_GOALS,
  PUSH_GENDER_LABEL,
  findUnpairedRows,
  genderAxisOf,
  genderSideOf,
  missingCounterpartMessage,
  previewPushCopy,
  sendBlockers,
  sendProblemLabel,
  type PushCatalogEntry,
  type PushDefaultCopy,
  type PushGender,
} from '@/features/notifications/push-library/push-library.core';
import {
  archivePushRow,
  loadPushLibrary,
  setPushRowActive,
  unarchivePushRow,
  PushCopyValidationError,
  type PushLibraryRow,
} from '@/features/admin/services/push-library.service';
import { PushCopyEditor, type PushEditorSeed, type PushEditorTarget } from './PushCopyEditor';

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
  const live = rows.filter((r) => r.active && !r.archived && !r.needsRewrite && sendBlockers(r).length === 0);
  if (live.length === 0) return [];
  // A male/female pair is one variant (each person sees one side of it).
  const groups = new Map<string, Set<string>>();
  for (const r of live) {
    const key = conditionSummary(entry, r.conditions).join(' · ') || 'כללי';
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(r.pairId ?? r.id);
  }
  return Array.from(groups.entries())
    .map(([key, ids]) => [key, ids.size] as const)
    .filter(([, n]) => n < 2 || n > 4)
    .map(([key, n]) => `${key}: ${n} וריאנטים פעילים (מומלץ 2 עד 4)`);
}

type ChipTone = 'slate' | 'cyan' | 'amber' | 'violet' | 'red' | 'indigo';

function Chip({ children, tone = 'slate' }: { children: React.ReactNode; tone?: ChipTone }) {
  const cls = {
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  }[tone];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>{children}</span>;
}

/** 'נמען: נקבה' / 'מי שיזם את האימון: זכר' — or null for a neutral row. */
function genderChipLabel(entry: PushCatalogEntry, row: { gender?: unknown; subjectGender?: unknown }): string | null {
  const side = genderSideOf(row);
  if (!side) return null;
  const who = genderAxisOf(row) === 'subject' ? entry.subject?.label ?? 'האדם הנוסף' : 'נמען';
  return `${who}: ${PUSH_GENDER_LABEL[side]}`;
}

/** Pair twins next to each other (male first), everything else in its original order. */
function sortPairsTogether(rows: PushLibraryRow[]): PushLibraryRow[] {
  const out: PushLibraryRow[] = [];
  const done = new Set<string>();
  for (const r of rows) {
    if (done.has(r.id)) continue;
    const group = r.pairId ? rows.filter((o) => o.pairId === r.pairId) : [r];
    group.sort((a, b) => (genderSideOf(a) === 'male' ? -1 : genderSideOf(b) === 'male' ? 1 : 0));
    for (const g of group) {
      out.push(g);
      done.add(g.id);
    }
  }
  return out;
}

/** "Copy to a variant" from a code default (with its twin, as a pair). */
function seedFromDefault(entry: PushCatalogEntry, d: PushDefaultCopy, twin: PushDefaultCopy | undefined): PushEditorSeed {
  const axis = genderAxisOf(d);
  const empty = { title: '', body: '' };
  const sides = { male: empty, female: empty };
  for (const x of [d, twin]) {
    const side = x ? genderSideOf(x) : null;
    if (x && side) sides[side] = { title: x.title, body: x.body };
  }
  return {
    axis,
    neutral: axis === 'none' ? { title: d.title, body: d.body } : empty,
    ...sides,
    audience: d.audience,
    conditions: d.conditions,
    deepLink: entry.deepLinks[0],
    fallbackOnly: d.fallbackOnly,
  };
}

function RowCard({
  entry,
  row,
  missingTwin,
  busy,
  onToggle,
  onEdit,
  onArchive,
  onRestore,
}: {
  entry: PushCatalogEntry;
  row: PushLibraryRow;
  /** Gendered row whose other-gender twin is missing (the gender that's missing). */
  missingTwin: PushGender | undefined;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const preview = previewPushCopy({
    pushType: row.pushType,
    title: row.title,
    body: row.body,
    deepLink: row.deepLink,
    gender: row.gender,
    subjectGender: row.subjectGender,
  });
  const chips = [...conditionSummary(entry, row.conditions), ...audienceSummary(row.audience)];
  const genderLabel = genderChipLabel(entry, row);
  // Rows that break the send-time rules are skipped by every sender (the next
  // variant or the code default goes instead). Only flagged while they'd
  // otherwise be live, i.e. on, not archived, not already marked for rewrite.
  const blockers = row.archived || row.needsRewrite ? [] : sendBlockers(row);
  const blocked = blockers.length > 0;
  return (
    <div
      className={`rounded-xl border p-3 flex gap-3 ${
        row.archived ? 'border-slate-200 bg-slate-50 opacity-70' : blocked ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="pt-0.5">
        {!row.archived && (
          <button
            type="button"
            role="switch"
            aria-checked={row.active}
            aria-label={row.active ? 'כיבוי הווריאנט' : 'הפעלת הווריאנט'}
            disabled={busy}
            onClick={onToggle}
            className={`w-10 h-6 rounded-full relative transition-colors ${row.active ? 'bg-emerald-500' : 'bg-slate-300'} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${row.active ? 'right-0.5' : 'right-[18px]'}`} />
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="text-sm font-semibold text-slate-900 break-words">{preview.title}</div>
        <div className="text-sm text-slate-600 break-words">{preview.body}</div>
        {blocked && (
          <p className="flex items-start gap-1.5 text-xs font-semibold text-red-700">
            <Ban size={13} className="mt-0.5 shrink-0" />
            <span>
              לא עובר בדיקה · לא נשלח, נשלח נוסח ברירת המחדל
              <span className="font-normal text-red-600"> ({blockers.map(sendProblemLabel).join(', ')})</span>
            </span>
          </p>
        )}
        {missingTwin && !blocked && row.active && (
          <p className="flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {missingCounterpartMessage(genderAxisOf(row), missingTwin, entry)}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {genderLabel && <Chip tone="indigo">{genderLabel}</Chip>}
          {row.legacy && <Chip tone="violet">ספרייה ישנה</Chip>}
          {row.needsRewrite && <Chip tone="amber">לשכתוב{row.rewriteReasons.length ? `: ${row.rewriteReasons.join(', ')}` : ''}</Chip>}
          {row.archived && <Chip>בארכיון{row.archivedReason ? `: ${row.archivedReason}` : ''}</Chip>}
          {chips.map((c) => (
            <Chip key={c} tone="cyan">{c}</Chip>
          ))}
          {row.timeWindow && <Chip>{`${row.timeWindow.start} עד ${row.timeWindow.end}`}</Chip>}
          {row.fallbackOnly && <Chip>גיבוי בלבד</Chip>}
          <Chip>{ROUTE_LABEL[row.deepLink ?? entry.deepLinks[0]] ?? row.deepLink}</Chip>
          <span className="text-[11px] text-slate-400 font-mono self-center" dir="ltr">
            {row.id} · v{row.version}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {!row.archived && (
          <button type="button" onClick={onEdit} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="עריכה" title="עריכה">
            <Pencil size={15} />
          </button>
        )}
        {row.archived ? (
          <button type="button" disabled={busy} onClick={onRestore} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="החזרה מהארכיון" title="החזרה מהארכיון">
            <ArchiveRestore size={15} />
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={onArchive} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="העברה לארכיון" title="העברה לארכיון">
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
  const visible = sortPairsTogether(rows.filter((r) => showArchived || !r.archived));
  const liveCount = rows.filter((r) => r.active && !r.archived && !r.needsRewrite && sendBlockers(r).length === 0).length;
  const blockedCount = rows.filter((r) => r.active && !r.archived && !r.needsRewrite && sendBlockers(r).length > 0).length;
  const warnings = variantCountWarnings(entry, rows);
  const unpaired = findUnpairedRows(rows);
  const twinOf = (row: PushLibraryRow) =>
    row.pairId ? rows.filter((r) => r.pairId === row.pairId && r.id !== row.id && !r.archived) : [];
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4" id={entry.pushType}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
            {entry.label}
            <Chip tone="cyan">{LEVER_LABEL[entry.lever]}</Chip>
            <span className="text-[11px] font-mono text-slate-400" dir="ltr">{entry.pushType}</span>
          </h2>
          <p className="text-sm text-slate-600">{entry.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onEdit({ entry, row: null })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 text-white text-sm font-bold hover:bg-cyan-600"
        >
          <Plus size={15} /> וריאנט חדש
        </button>
      </header>

      <dl className="grid sm:grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs rounded-xl bg-slate-50 border border-slate-100 p-3">
        <dt className="text-slate-500">מתי נשלח</dt>
        <dd className="text-slate-700">{entry.whenSent}</dd>
        <dt className="text-slate-500">שולח</dt>
        <dd className="text-slate-700 font-mono" dir="ltr">{`${entry.sender} · ${entry.channel}`}</dd>
        <dt className="text-slate-500">משתנים</dt>
        <dd className="text-slate-700 font-mono">{entry.vars.join(' ')}</dd>
        <dt className="text-slate-500">מגדר</dt>
        <dd className="text-slate-700">
          {entry.subject
            ? `לפי הנמען, או לפי ${entry.subject.label} (${entry.subject.var})`
            : 'לפי הנמען'}
        </dd>
        <dt className="text-slate-500">יעדים אפשריים</dt>
        <dd className="text-slate-700">{entry.deepLinks.map((d) => ROUTE_LABEL[d] ?? d).join(' · ')}</dd>
      </dl>

      {entry.pending && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">{entry.pending}</p>
      )}

      <div className="space-y-2">
        <div className="text-xs text-slate-500">
          וריאנטים בספרייה: {liveCount} פעילים מתוך {rows.filter((r) => !r.archived).length}
          {blockedCount > 0 && ` · ${blockedCount} דלוקים אבל לא עוברים בדיקה`}
          {liveCount === 0 && ' · כרגע נשלחים הטקסטים שבקוד (למטה)'}
        </div>
        {warnings.map((w) => (
          <p key={w} className="flex items-center gap-1.5 text-xs text-amber-700">
            <AlertTriangle size={13} /> {w}
          </p>
        ))}
        {visible.map((row) => (
          <RowCard
            key={row.id}
            entry={entry}
            row={row}
            missingTwin={unpaired.get(row.id)}
            busy={busyId === row.id}
            onToggle={() => onToggle(row)}
            onEdit={() => onEdit({ entry, row, twins: twinOf(row) })}
            onArchive={() => onArchive(row)}
            onRestore={() => onRestore(row)}
          />
        ))}
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <summary className="text-sm cursor-pointer text-slate-700">
          טקסטים שבקוד ({entry.defaults.length}) · נשלחים כשאין וריאנט פעיל שמתאים
        </summary>
        <ul className="mt-3 space-y-2">
          {entry.defaults.map((d, i) => {
            const p = previewPushCopy({
              pushType: entry.pushType,
              title: d.title,
              body: d.body,
              deepLink: entry.deepLinks[0],
              gender: d.gender,
              subjectGender: d.subjectGender,
            });
            const genderLabel = genderChipLabel(entry, d);
            const chips = [
              ...conditionSummary(entry, d.conditions),
              ...audienceSummary(d.audience ?? null),
              ...(d.fallbackOnly ? ['רק כשאין ערך למשתנה'] : []),
            ];
            // A gendered default is copied together with its twin (the editor opens the pair).
            const twin = d.pair ? entry.defaults.find((o) => o !== d && o.pair === d.pair) : undefined;
            return (
              <li key={i} className="flex gap-3 items-start text-sm rounded-lg bg-white border border-slate-100 p-2">
                <div className="flex-1 min-w-0">
                  <div className="text-slate-900 font-medium break-words">{p.title}</div>
                  <div className="text-slate-600 break-words">{p.body}</div>
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {chips.map((c) => (
                        <Chip key={c}>{c}</Chip>
                      ))}
                    </div>
                  )}
                  {genderLabel && (
                    <div className="mt-1">
                      <Chip tone="indigo">{genderLabel}</Chip>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onEdit({ entry, row: null, seed: seedFromDefault(entry, d, twin) })
                  }
                  className="flex items-center gap-1 text-xs font-semibold text-cyan-700 hover:text-cyan-900 shrink-0"
                >
                  <Copy size={13} /> {twin ? 'העתקת הזוג לווריאנט' : 'העתקה לווריאנט'}
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

  /** A pair is switched on/off together. */
  const withTwins = (row: PushLibraryRow) =>
    row.pairId ? rows.filter((r) => r.pairId === row.pairId && !r.archived) : [row];

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
    live: rows.filter((r) => r.active && !r.archived && !r.needsRewrite && sendBlockers(r).length === 0).length,
    blocked: rows.filter((r) => r.active && !r.archived && !r.needsRewrite && sendBlockers(r).length > 0).length,
    rewrite: rows.filter((r) => r.needsRewrite && !r.archived).length,
    archived: rows.filter((r) => r.archived).length,
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 text-slate-900" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">ספריית פושים</h1>
          <p className="text-sm text-slate-500 mt-1">
            הקוד מחליט מתי שולחים. כאן מחליטים מה כתוב. שינוי נכנס לתוקף תוך 10 דקות, בלי פריסה.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/notifications"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50"
          >
            <Bell size={15} /> מרכז התראות
          </Link>
          <button
            type="button"
            onClick={reload}
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="רענון"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex-1 min-w-[220px] flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-cyan-500">
          <Search size={15} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי פוש, שולח או טקסט"
            className="flex-1 bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="accent-cyan-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          להציג ארכיון ({totals.archived})
        </label>
        <span className="text-xs text-slate-500">
          {totals.live} וריאנטים פעילים · {totals.rewrite} לשכתוב
          {totals.blocked > 0 && <span className="text-red-600 font-semibold"> · {totals.blocked} לא עוברים בדיקה</span>}
        </span>
      </div>

      <nav className="flex flex-wrap gap-1.5">
        {entries.map((e) => (
          <a
            key={e.pushType}
            href={`#${e.pushType}`}
            className="px-2.5 py-1 rounded-full text-xs border border-slate-200 bg-white text-slate-600 hover:border-cyan-500 hover:text-cyan-700"
          >
            {e.label}
          </a>
        ))}
      </nav>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{notice}</p>}

      <div className="space-y-5">
        {entries.map((entry) => (
          <PushTypeCard
            key={entry.pushType}
            entry={entry}
            rows={rowsByType.get(entry.pushType) ?? []}
            showArchived={showArchived}
            busyId={busyId}
            onEdit={setEditing}
            onToggle={(row) =>
              act(row, async () => {
                for (const r of withTwins(row)) if (r.active === row.active) await setPushRowActive(r, !row.active, uid);
              })
            }
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
