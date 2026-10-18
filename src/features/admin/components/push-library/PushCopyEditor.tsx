'use client';

/**
 * Editor for one push-library variant: live validation (the same rules the
 * senders enforce), live preview with sample values, deep-link dropdown from
 * the route list, audience / condition pickers, optional time window, and a
 * "send a test to me" that delivers the previewed copy to the signed-in
 * admin's own devices (/api/admin/notifications/test).
 */

import React, { useMemo, useRef, useState } from 'react';
import { X, Save, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  PUSH_AGE_BANDS,
  PUSH_BODY_MAX,
  PUSH_DEEP_LINK_ROUTES,
  PUSH_LEVERS,
  PUSH_PERSONAS,
  PUSH_PRIMARY_GOALS,
  PUSH_TITLE_MAX,
  PUSH_VARIABLES,
  previewPushCopy,
  validatePushCopyDraft,
  type PushAudienceFilter,
  type PushCatalogEntry,
  type PushCopyDraft,
} from '@/features/notifications/push-library/push-library.core';
import { savePushCopy, PushCopyValidationError, type PushLibraryRow } from '@/features/admin/services/push-library.service';

export interface PushEditorTarget {
  entry: PushCatalogEntry;
  /** Existing row (edit) — or null for a new variant. */
  row: PushLibraryRow | null;
  /** Starting copy for a new variant (e.g. "copy this default"). */
  seed?: Partial<PushCopyDraft> & { fallbackOnly?: boolean };
}

interface Props extends PushEditorTarget {
  uid: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function toggle(list: string[] | undefined, value: string): string[] {
  const cur = list ?? [];
  return cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
}

function ChipPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  value: string[] | undefined;
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">
        {label} <span className="text-gray-500">(בלי בחירה = כולם)</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value?.includes(o.id) ?? false;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(toggle(value, o.id))}
              className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                on ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200' : 'border-slate-700 text-gray-300 hover:border-slate-500'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PushCopyEditor({ entry, row, seed, uid, onClose, onSaved }: Props) {
  const [lever, setLever] = useState<string>(row?.lever ?? entry.lever);
  const [title, setTitle] = useState(row?.title ?? seed?.title ?? '');
  const [body, setBody] = useState(row?.body ?? seed?.body ?? '');
  const [deepLink, setDeepLink] = useState<string>(row?.deepLink ?? seed?.deepLink ?? entry.deepLinks[0]);
  const [audience, setAudience] = useState<PushAudienceFilter>(row?.audience ?? seed?.audience ?? {});
  const [conditions, setConditions] = useState<Record<string, string[]>>(row?.conditions ?? seed?.conditions ?? {});
  const [useWindow, setUseWindow] = useState(!!row?.timeWindow);
  const [fallbackOnly, setFallbackOnly] = useState<boolean>(row?.fallbackOnly ?? seed?.fallbackOnly ?? false);
  const [windowStart, setWindowStart] = useState(row?.timeWindow?.start ?? '08:00');
  const [windowEnd, setWindowEnd] = useState(row?.timeWindow?.end ?? '21:30');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [testState, setTestState] = useState<{ kind: 'idle' | 'sending' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' });
  const lastFocused = useRef<'title' | 'body'>('body');
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const draft: PushCopyDraft = useMemo(
    () => ({
      pushType: entry.pushType,
      lever,
      title,
      body,
      deepLink,
      audience,
      conditions,
      timeWindow: useWindow ? { start: windowStart, end: windowEnd } : null,
    }),
    [entry.pushType, lever, title, body, deepLink, audience, conditions, useWindow, windowStart, windowEnd],
  );
  const issues = useMemo(() => validatePushCopyDraft(draft), [draft]);
  const preview = useMemo(() => previewPushCopy(draft), [draft]);
  const fieldIssues = (f: string) => issues.filter((i) => i.field === f);
  const allowedVars = PUSH_VARIABLES.filter((v) => entry.vars.includes(v.key));

  const insertVar = (key: string) => {
    const target = lastFocused.current;
    const el = target === 'title' ? titleRef.current : bodyRef.current;
    const cur = target === 'title' ? title : body;
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = `${cur.slice(0, start)}${key}${cur.slice(end)}`;
    if (target === 'title') setTitle(next);
    else setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + key.length, start + key.length);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await savePushCopy(row?.id ?? null, { ...draft, lever }, {
        previousVersion: row?.version,
        uid,
        // Editing keeps an off row off; a new variant (or a rewritten one) starts on.
        active: row && !row.needsRewrite && !row.archived ? row.active : true,
        fallbackOnly,
      });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof PushCopyValidationError ? err.message : 'שגיאה בשמירה. נסו שוב.');
      console.error('[push-library] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    if (!uid) return;
    setTestState({ kind: 'sending' });
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({
          channel: entry.channel,
          uid,
          title: preview.title,
          body: preview.body,
          deepLink: preview.deepLink ?? '/home',
        }),
      });
      const json = (await res.json()) as { delivered?: number; error?: string; reason?: string };
      if (!res.ok || json.error) setTestState({ kind: 'err', msg: json.error ?? `HTTP ${res.status}` });
      else if (!json.delivered) setTestState({ kind: 'err', msg: json.reason ?? 'לא נמסר. אין מכשיר רשום' });
      else setTestState({ kind: 'ok' });
    } catch {
      setTestState({ kind: 'err', msg: 'שגיאת רשת' });
    }
  };

  const routeOptions = PUSH_DEEP_LINK_ROUTES.filter((r) => entry.deepLinks.includes(r.id));

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4" dir="rtl">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-5 text-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              {row ? 'עריכת וריאנט' : 'וריאנט חדש'} · {entry.label}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 font-mono" dir="ltr">
              {entry.pushType}
              {row ? ` · ${row.id} · v${row.version}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800" aria-label="סגירה">
            <X size={18} />
          </button>
        </div>

        {row?.legacy && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            שורה מהספרייה הישנה (בלי כותרת משלה). שמירה הופכת אותה לשורה רגילה של הספרייה.
          </p>
        )}
        {row?.needsRewrite && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            מסומנת לשכתוב{row.rewriteReasons.length ? `: ${row.rewriteReasons.join(', ')}` : ''}. אחרי שמירה תקינה היא עולה לאוויר.
          </p>
        )}

        <div className="grid md:grid-cols-[1fr_260px] gap-5">
          <div className="space-y-4">
            <label className="block">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>כותרת</span>
                <span className={preview.title.length > PUSH_TITLE_MAX ? 'text-red-400' : ''}>
                  {preview.title.length}/{PUSH_TITLE_MAX}
                </span>
              </div>
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={() => (lastFocused.current = 'title')}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
              {fieldIssues('title').map((i) => (
                <p key={i.message} className="text-xs text-red-400 mt-1">{i.message}</p>
              ))}
            </label>

            <label className="block">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>טקסט</span>
                <span className={preview.body.length > PUSH_BODY_MAX ? 'text-red-400' : ''}>
                  {preview.body.length}/{PUSH_BODY_MAX}
                </span>
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                rows={3}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => (lastFocused.current = 'body')}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 resize-y"
              />
              {fieldIssues('body').map((i) => (
                <p key={i.message} className="text-xs text-red-400 mt-1">{i.message}</p>
              ))}
            </label>

            <div>
              <div className="text-xs text-gray-400 mb-1">משתנים שהפוש הזה ממלא (לחיצה מוסיפה)</div>
              <div className="flex flex-wrap gap-1.5">
                {allowedVars.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key)}
                    title={`${v.label} · לדוגמה: ${v.sample}`}
                    className="px-2 py-0.5 rounded-md text-xs bg-slate-800 border border-slate-700 hover:border-cyan-500 font-mono"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs text-gray-400 mb-1">לאן הפוש מוביל</div>
                <select
                  value={deepLink}
                  onChange={(e) => setDeepLink(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                >
                  {routeOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {fieldIssues('deepLink').map((i) => (
                  <p key={i.message} className="text-xs text-red-400 mt-1">{i.message}</p>
                ))}
              </label>
              <label className="block">
                <div className="text-xs text-gray-400 mb-1">מנוף</div>
                <select
                  value={lever}
                  onChange={(e) => setLever(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm"
                >
                  {PUSH_LEVERS.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {entry.conditions?.map((c) => (
              <ChipPicker
                key={c.key}
                label={c.label}
                options={c.options.map((o) => ({ id: o.value, label: o.label }))}
                value={conditions[c.key]}
                onChange={(v) => setConditions({ ...conditions, [c.key]: v })}
              />
            ))}
            {fieldIssues('conditions').map((i) => (
              <p key={i.message} className="text-xs text-red-400">{i.message}</p>
            ))}

            <details className="rounded-lg border border-slate-800 p-3" open={!!(audience.persona?.length || audience.ageBand?.length || audience.primaryGoal?.length)}>
              <summary className="text-sm cursor-pointer text-gray-300">קהל (לא חובה)</summary>
              <div className="space-y-3 mt-3">
                <ChipPicker label="פרסונה" options={PUSH_PERSONAS} value={audience.persona} onChange={(v) => setAudience({ ...audience, persona: v })} />
                <ChipPicker label="גיל" options={PUSH_AGE_BANDS} value={audience.ageBand} onChange={(v) => setAudience({ ...audience, ageBand: v })} />
                <ChipPicker label="מטרה" options={PUSH_PRIMARY_GOALS} value={audience.primaryGoal} onChange={(v) => setAudience({ ...audience, primaryGoal: v })} />
                <p className="text-xs text-gray-500">כשיש כמה שורות מתאימות, הממוקדת יותר נבחרת.</p>
              </div>
            </details>

            <div className="rounded-lg border border-slate-800 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={useWindow} onChange={(e) => setUseWindow(e.target.checked)} />
                רק בחלון זמן (שעון ישראל)
              </label>
              {useWindow && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">מ-</span>
                  <input value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1" dir="ltr" />
                  <span className="text-gray-400">עד</span>
                  <input value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1" dir="ltr" />
                </div>
              )}
              <p className="text-xs text-gray-500">החלון רק מסנן איזה טקסט נבחר. מתי הפוש נשלח קובע הקוד.</p>
              <label className="flex items-center gap-2 text-sm text-gray-300 pt-1">
                <input type="checkbox" checked={fallbackOnly} onChange={(e) => setFallbackOnly(e.target.checked)} />
                גיבוי בלבד: רק כשאין וריאנט אחר שאפשר למלא (למשל בלי שם)
              </label>
              {fieldIssues('timeWindow').map((i) => (
                <p key={i.message} className="text-xs text-red-400">{i.message}</p>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs text-gray-400">תצוגה מקדימה (ערכים לדוגמה)</div>
            <div className="rounded-2xl bg-slate-100 text-slate-900 p-3 shadow-lg">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                <span className="font-semibold text-slate-700">OUT</span>
                <span>· עכשיו</span>
              </div>
              <div className="text-sm font-semibold leading-snug break-words">{preview.title || 'כותרת'}</div>
              <div className="text-sm leading-snug break-words">{preview.body || 'טקסט'}</div>
            </div>
            <div className="text-xs text-gray-400">
              לחיצה פותחת: <span className="font-mono text-gray-300" dir="ltr">{preview.deepLink ?? '—'}</span>
            </div>
            {issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 size={14} /> עומד בכללי הכתיבה
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle size={14} /> {issues.length} בעיות לתיקון
              </p>
            )}
            <button
              type="button"
              onClick={handleTestSend}
              disabled={!uid || issues.length > 0 || testState.kind === 'sending'}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-600 text-sm hover:bg-slate-800 disabled:opacity-40"
            >
              <Send size={14} />
              {testState.kind === 'sending' ? 'שולח…' : 'שליחת בדיקה אליי'}
            </button>
            {testState.kind === 'ok' && <p className="text-xs text-emerald-400">נשלח למכשיר שלך</p>}
            {testState.kind === 'err' && <p className="text-xs text-red-400">{testState.msg}</p>}
          </div>
        </div>

        {saveError && <p className="text-sm text-red-400">{saveError}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-slate-800">
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || issues.length > 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold text-sm hover:bg-cyan-400 disabled:opacity-40"
          >
            <Save size={16} />
            {saving ? 'שומר…' : 'שמירה'}
          </button>
        </div>
      </div>
    </div>
  );
}
