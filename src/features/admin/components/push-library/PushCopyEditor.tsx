'use client';

/**
 * Editor for one push-library variant: live validation (the same rules the
 * senders enforce), live preview with sample values, deep-link dropdown from
 * the route list, audience / condition pickers, optional time window, and a
 * "send a test to me" that delivers the previewed copy to the signed-in
 * admin's own devices (/api/admin/notifications/test).
 *
 * Gender: a variant is either one neutral text for everyone, or a male/female
 * pair edited side by side, agreeing with the recipient or (for pushes that
 * talk about someone else) with that person. A pair saves as two rows that
 * share a pairId. Slashes are still rejected; a missing side is a warning.
 */

import React, { useMemo, useRef, useState } from 'react';
import { X, Save, Send, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  PUSH_AGE_BANDS,
  PUSH_BODY_MAX,
  PUSH_DEEP_LINK_ROUTES,
  PUSH_GENDER_LABEL,
  PUSH_LEVERS,
  PUSH_PERSONAS,
  PUSH_PRIMARY_GOALS,
  PUSH_TITLE_MAX,
  PUSH_VARIABLES,
  genderAxisOf,
  genderSideOf,
  pairSideFor,
  previewPushCopy,
  validatePushCopyPair,
  type PushAudienceFilter,
  type PushCatalogEntry,
  type PushCopyPairDraft,
  type PushCopyText,
  type PushGender,
  type PushGenderAxis,
  type PushPairSide,
} from '@/features/notifications/push-library/push-library.core';
import { savePushCopyPair, PushCopyValidationError, type PushLibraryRow } from '@/features/admin/services/push-library.service';

/** Starting copy for a new variant (e.g. "copy this default", a pair included). */
export interface PushEditorSeed {
  axis: PushGenderAxis;
  neutral: PushCopyText;
  male: PushCopyText;
  female: PushCopyText;
  audience?: PushAudienceFilter;
  conditions?: Record<string, string[]>;
  deepLink?: string;
  fallbackOnly?: boolean;
}

export interface PushEditorTarget {
  entry: PushCatalogEntry;
  /** Existing row (edit) — or null for a new variant. */
  row: PushLibraryRow | null;
  /** The row's other-gender twin(s), edited together with it. */
  twins?: PushLibraryRow[];
  seed?: PushEditorSeed;
}

interface Props extends PushEditorTarget {
  uid: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: PushCopyText = { title: '', body: '' };

const INPUT =
  'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100';

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
      <div className="text-xs font-medium text-slate-600 mb-1">
        {label} <span className="font-normal text-slate-400">(בלי בחירה = כולם)</span>
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
                on ? 'bg-cyan-50 border-cyan-400 text-cyan-800 font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
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

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
            value === o.id ? 'bg-white text-slate-900 font-semibold shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function sideText(rows: PushLibraryRow[], side: PushPairSide): PushCopyText {
  const r = rows.find((x) => (genderSideOf(x) ?? 'neutral') === side);
  return r ? { title: r.title, body: r.body } : EMPTY;
}

export function PushCopyEditor({ entry, row, twins, seed, uid, onClose, onSaved }: Props) {
  const existing = useMemo(() => (row ? [row, ...(twins ?? [])] : []), [row, twins]);
  const [axis, setAxis] = useState<PushGenderAxis>(row ? genderAxisOf(row) : seed?.axis ?? 'none');
  const [texts, setTexts] = useState<Record<PushPairSide, PushCopyText>>(() =>
    row
      ? { neutral: sideText(existing, 'neutral'), male: sideText(existing, 'male'), female: sideText(existing, 'female') }
      : { neutral: seed?.neutral ?? EMPTY, male: seed?.male ?? EMPTY, female: seed?.female ?? EMPTY },
  );
  const [lever, setLever] = useState<string>(row?.lever ?? entry.lever);
  const [deepLink, setDeepLink] = useState<string>(row?.deepLink ?? seed?.deepLink ?? entry.deepLinks[0]);
  const [audience, setAudience] = useState<PushAudienceFilter>(row?.audience ?? seed?.audience ?? {});
  const [conditions, setConditions] = useState<Record<string, string[]>>(row?.conditions ?? seed?.conditions ?? {});
  const [useWindow, setUseWindow] = useState(!!row?.timeWindow);
  const [fallbackOnly, setFallbackOnly] = useState<boolean>(row?.fallbackOnly ?? seed?.fallbackOnly ?? false);
  const [windowStart, setWindowStart] = useState(row?.timeWindow?.start ?? '08:00');
  const [windowEnd, setWindowEnd] = useState(row?.timeWindow?.end ?? '21:30');
  const [previewRecipient, setPreviewRecipient] = useState<PushGender | 'other'>('female');
  const [previewSubject, setPreviewSubject] = useState<PushGender>('female');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [testState, setTestState] = useState<{ kind: 'idle' | 'sending' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' });
  const lastFocused = useRef<{ side: PushPairSide; field: 'title' | 'body' }>({ side: 'neutral', field: 'body' });
  const inputs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

  const pair: PushCopyPairDraft = useMemo(
    () => ({
      pushType: entry.pushType,
      lever,
      deepLink,
      audience,
      conditions,
      timeWindow: useWindow ? { start: windowStart, end: windowEnd } : null,
      axis,
      neutral: texts.neutral,
      male: texts.male,
      female: texts.female,
    }),
    [entry.pushType, lever, deepLink, audience, conditions, useWindow, windowStart, windowEnd, axis, texts],
  );
  const { issues, warnings } = useMemo(() => validatePushCopyPair(pair), [pair]);
  const sharedIssues = (field: string) => issues.filter((i) => i.side === 'shared' && i.field === field);

  const recipientGender = previewRecipient === 'other' ? null : previewRecipient;
  const shownSide = pairSideFor(pair, recipientGender, entry.subject ? previewSubject : null);
  const preview = useMemo(() => {
    if (!shownSide) return null;
    const t = texts[shownSide];
    return previewPushCopy(
      {
        pushType: entry.pushType,
        title: t.title,
        body: t.body,
        deepLink,
        gender: axis === 'recipient' && shownSide !== 'neutral' ? shownSide : 'both',
        subjectGender: axis === 'subject' && shownSide !== 'neutral' ? shownSide : 'any',
      },
      { gender: recipientGender, subjectGender: entry.subject ? previewSubject : null },
    );
  }, [shownSide, texts, entry.pushType, entry.subject, deepLink, axis, recipientGender, previewSubject]);

  const allowedVars = PUSH_VARIABLES.filter((v) => entry.vars.includes(v.key));

  const setText = (side: PushPairSide, field: 'title' | 'body', value: string) =>
    setTexts((cur) => ({ ...cur, [side]: { ...cur[side], [field]: value } }));

  const changeAxis = (next: PushGenderAxis) => {
    setTexts((cur) => {
      if (next === 'none') {
        return { ...cur, neutral: cur.neutral.title || cur.neutral.body ? cur.neutral : cur.male.title || cur.male.body ? cur.male : cur.female };
      }
      // Start both sides from the neutral text, ready to change the one word that differs.
      const fill = (t: PushCopyText) => (t.title || t.body ? t : cur.neutral);
      return { ...cur, male: fill(cur.male), female: fill(cur.female) };
    });
    setAxis(next);
  };

  const insertVar = (key: string) => {
    const { side, field } = lastFocused.current;
    const target = axis === 'none' ? 'neutral' : side === 'neutral' ? 'male' : side;
    const el = inputs.current[`${target}:${field}`];
    const cur = texts[target][field];
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    setText(target, field, `${cur.slice(0, start)}${key}${cur.slice(end)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + key.length, start + key.length);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await savePushCopyPair(existing, { ...pair, lever }, {
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
    if (!uid || !preview) return;
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
  const axisOptions: Array<{ id: PushGenderAxis; label: string }> = [
    { id: 'none', label: 'נוסח אחד לכולם' },
    { id: 'recipient', label: 'זכר ונקבה, לפי הנמען' },
    ...(entry.subject ? [{ id: 'subject' as const, label: `זכר ונקבה, לפי ${entry.subject.label}` }] : []),
  ];
  const sides: PushPairSide[] = axis === 'none' ? ['neutral'] : ['male', 'female'];
  const sideHeading = (side: PushPairSide) =>
    side === 'neutral'
      ? null
      : axis === 'subject'
        ? `${entry.subject?.label ?? 'האדם הנוסף'}: ${PUSH_GENDER_LABEL[side]}`
        : `נמען: ${PUSH_GENDER_LABEL[side]}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4" dir="rtl">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-5 text-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {row ? 'עריכת וריאנט' : 'וריאנט חדש'} · {entry.label}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-mono" dir="ltr">
              {entry.pushType}
              {existing.map((r) => ` · ${r.id} v${r.version}`).join('')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="סגירה">
            <X size={18} />
          </button>
        </div>

        {row?.legacy && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            שורה מהספרייה הישנה (בלי כותרת משלה). שמירה הופכת אותה לשורה רגילה של הספרייה.
          </p>
        )}
        {row?.needsRewrite && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            מסומנת לשכתוב{row.rewriteReasons.length ? `: ${row.rewriteReasons.join(', ')}` : ''}. אחרי שמירה תקינה היא עולה לאוויר.
          </p>
        )}

        <div className="grid md:grid-cols-[1fr_270px] gap-5">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-600">מגדר</div>
              <Segmented label="מגדר" options={axisOptions} value={axis} onChange={changeAxis} />
              <p className="text-xs text-slate-400">
                {axis === 'none'
                  ? 'בלי לוכסנים: כותבים ברבים או בלי פנייה, או בוחרים נוסח לזכר ולנקבה.'
                  : axis === 'recipient'
                    ? 'מי שלא בחר מגדר מקבל וריאנט כללי (או את ברירת המחדל שבקוד).'
                    : `הפועל מתאים ל${entry.subject?.label} (${entry.subject?.var}). כשהמגדר לא ידוע נשלח וריאנט כללי.`}
              </p>
              {sharedIssues('gender').map((i) => (
                <p key={i.message} className="text-xs text-red-600">{i.message}</p>
              ))}
            </div>

            <div className={axis === 'none' ? '' : 'grid sm:grid-cols-2 gap-3'}>
              {sides.map((side) => {
                const t = texts[side];
                const sideIssues = (f: 'title' | 'body') => issues.filter((i) => i.side === side && i.field === f);
                const heading = sideHeading(side);
                // Counters measure the text as sent (sample values filled), like the save rule.
                const rendered = previewPushCopy({
                  pushType: entry.pushType,
                  title: t.title,
                  body: t.body,
                  deepLink,
                  gender: axis === 'recipient' && side !== 'neutral' ? side : 'both',
                  subjectGender: axis === 'subject' && side !== 'neutral' ? side : 'any',
                });
                return (
                  <div key={side} className={heading ? 'rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3' : 'space-y-4'}>
                    {heading && <div className="text-xs font-bold text-indigo-700">{heading}</div>}
                    <label className="block">
                      <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                        <span>כותרת</span>
                        <span className={rendered.title.length > PUSH_TITLE_MAX ? 'text-red-600' : 'text-slate-400'}>
                          {rendered.title.length}/{PUSH_TITLE_MAX}
                        </span>
                      </div>
                      <input
                        ref={(el) => {
                          inputs.current[`${side}:title`] = el;
                        }}
                        value={t.title}
                        onChange={(e) => setText(side, 'title', e.target.value)}
                        onFocus={() => (lastFocused.current = { side, field: 'title' })}
                        className={INPUT}
                      />
                      {sideIssues('title').map((i) => (
                        <p key={i.message} className="text-xs text-red-600 mt-1">{i.message}</p>
                      ))}
                    </label>
                    <label className="block">
                      <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                        <span>טקסט</span>
                        <span className={rendered.body.length > PUSH_BODY_MAX ? 'text-red-600' : 'text-slate-400'}>
                          {rendered.body.length}/{PUSH_BODY_MAX}
                        </span>
                      </div>
                      <textarea
                        ref={(el) => {
                          inputs.current[`${side}:body`] = el;
                        }}
                        value={t.body}
                        rows={3}
                        onChange={(e) => setText(side, 'body', e.target.value)}
                        onFocus={() => (lastFocused.current = { side, field: 'body' })}
                        className={`${INPUT} resize-y`}
                      />
                      {sideIssues('body').map((i) => (
                        <p key={i.message} className="text-xs text-red-600 mt-1">{i.message}</p>
                      ))}
                    </label>
                  </div>
                );
              })}
            </div>
            {sharedIssues('body').map((i) => (
              <p key={i.message} className="text-xs text-red-600">{i.message}</p>
            ))}
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}

            <div>
              <div className="text-xs font-medium text-slate-600 mb-1">משתנים שהפוש הזה ממלא (לחיצה מוסיפה לשדה האחרון)</div>
              <div className="flex flex-wrap gap-1.5">
                {allowedVars.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key)}
                    title={`${v.label} · לדוגמה: ${v.sample}`}
                    className="px-2 py-0.5 rounded-md text-xs bg-slate-100 text-slate-700 border border-slate-200 hover:border-cyan-500 hover:text-cyan-800 font-mono"
                  >
                    {v.key}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-xs font-medium text-slate-600 mb-1">לאן הפוש מוביל</div>
                <select value={deepLink} onChange={(e) => setDeepLink(e.target.value)} className={`${INPUT} px-2`}>
                  {routeOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {sharedIssues('deepLink').map((i) => (
                  <p key={i.message} className="text-xs text-red-600 mt-1">{i.message}</p>
                ))}
              </label>
              <label className="block">
                <div className="text-xs font-medium text-slate-600 mb-1">מנוף</div>
                <select value={lever} onChange={(e) => setLever(e.target.value)} className={`${INPUT} px-2`}>
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
            {sharedIssues('conditions').map((i) => (
              <p key={i.message} className="text-xs text-red-600">{i.message}</p>
            ))}

            <details
              className="rounded-xl border border-slate-200 p-3"
              open={!!(audience.persona?.length || audience.ageBand?.length || audience.primaryGoal?.length)}
            >
              <summary className="text-sm cursor-pointer text-slate-700">קהל (לא חובה)</summary>
              <div className="space-y-3 mt-3">
                <ChipPicker label="פרסונה" options={PUSH_PERSONAS} value={audience.persona} onChange={(v) => setAudience({ ...audience, persona: v })} />
                <ChipPicker label="גיל" options={PUSH_AGE_BANDS} value={audience.ageBand} onChange={(v) => setAudience({ ...audience, ageBand: v })} />
                <ChipPicker label="מטרה" options={PUSH_PRIMARY_GOALS} value={audience.primaryGoal} onChange={(v) => setAudience({ ...audience, primaryGoal: v })} />
                <p className="text-xs text-slate-400">כשיש כמה שורות מתאימות, הממוקדת יותר נבחרת.</p>
              </div>
            </details>

            <div className="rounded-xl border border-slate-200 p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="accent-cyan-600" checked={useWindow} onChange={(e) => setUseWindow(e.target.checked)} />
                רק בחלון זמן (שעון ישראל)
              </label>
              {useWindow && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-slate-500">מ-</span>
                  <input value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={`${INPUT} w-20 px-2 py-1`} dir="ltr" />
                  <span className="text-slate-500">עד</span>
                  <input value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className={`${INPUT} w-20 px-2 py-1`} dir="ltr" />
                </div>
              )}
              <p className="text-xs text-slate-400">החלון רק מסנן איזה טקסט נבחר. מתי הפוש נשלח קובע הקוד.</p>
              <label className="flex items-center gap-2 text-sm text-slate-700 pt-1">
                <input type="checkbox" className="accent-cyan-600" checked={fallbackOnly} onChange={(e) => setFallbackOnly(e.target.checked)} />
                גיבוי בלבד: רק כשאין וריאנט אחר שאפשר למלא (למשל בלי שם)
              </label>
              {sharedIssues('timeWindow').map((i) => (
                <p key={i.message} className="text-xs text-red-600">{i.message}</p>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-medium text-slate-600">תצוגה מקדימה (ערכים לדוגמה)</div>
            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-400">הנמען</div>
              <Segmented
                label="מגדר הנמען בתצוגה"
                options={[
                  { id: 'male', label: 'זכר' },
                  { id: 'female', label: 'נקבה' },
                  { id: 'other', label: 'אחר / לא ידוע' },
                ]}
                value={previewRecipient}
                onChange={setPreviewRecipient}
              />
              {entry.subject && (
                <>
                  <div className="text-[11px] text-slate-400 pt-1">{entry.subject.label}</div>
                  <Segmented
                    label={`מגדר: ${entry.subject.label}`}
                    options={[
                      { id: 'male', label: 'זכר' },
                      { id: 'female', label: 'נקבה' },
                    ]}
                    value={previewSubject}
                    onChange={setPreviewSubject}
                  />
                </>
              )}
            </div>
            {preview ? (
              <div className="rounded-2xl bg-slate-100 border border-slate-200 text-slate-900 p-3 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                  <span className="font-semibold text-slate-700">OUT</span>
                  <span>· עכשיו</span>
                </div>
                <div className="text-sm font-semibold leading-snug break-words">{preview.title || 'כותרת'}</div>
                <div className="text-sm leading-snug break-words">{preview.body || 'טקסט'}</div>
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">
                הנמען הזה לא מקבל את הווריאנט הזה. נשלח לו וריאנט כללי, או ברירת המחדל שבקוד.
              </p>
            )}
            <div className="text-xs text-slate-500">
              לחיצה פותחת: <span className="font-mono text-slate-700" dir="ltr">{preview?.deepLink ?? '-'}</span>
            </div>
            {issues.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle2 size={14} /> עומד בכללי הכתיבה
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle size={14} /> {issues.length} בעיות לתיקון
              </p>
            )}
            <button
              type="button"
              onClick={handleTestSend}
              disabled={!uid || !preview || issues.length > 0 || testState.kind === 'sending'}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Send size={14} />
              {testState.kind === 'sending' ? 'שולח…' : 'שליחת בדיקה אליי (הנוסח שבתצוגה)'}
            </button>
            {testState.kind === 'ok' && <p className="text-xs text-emerald-700">נשלח למכשיר שלך</p>}
            {testState.kind === 'err' && <p className="text-xs text-red-600">{testState.msg}</p>}
          </div>
        </div>

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">
            ביטול
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || issues.length > 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 text-white font-bold text-sm hover:bg-cyan-600 disabled:opacity-40"
          >
            <Save size={16} />
            {saving ? 'שומר…' : axis === 'none' ? 'שמירה' : 'שמירת הזוג'}
          </button>
        </div>
      </div>
    </div>
  );
}
