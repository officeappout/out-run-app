'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { TAG_COLORS, type TagColor, type WeddingSettings, type WeddingState, type WeddingTask } from '../wedding.types';
import { SELECTED_STYLE, cellInput, type Update } from './ui';

/** Who-does-it tags: colors, display pills, the multi-select picker, the filter bar and the tag editor. */

/** Static class sets per tag color (Tailwind needs literal class names). */
export const TAG_STYLES: Record<TagColor, { pill: string; dot: string; bar: string; label: string }> = {
  sky: { pill: 'bg-sky-50 text-sky-800 border-sky-200', dot: 'bg-sky-500', bar: 'bg-sky-100 text-sky-900 border-sky-300', label: 'תכלת' },
  violet: { pill: 'bg-violet-50 text-violet-800 border-violet-200', dot: 'bg-violet-500', bar: 'bg-violet-100 text-violet-900 border-violet-300', label: 'סגול' },
  amber: { pill: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500', bar: 'bg-amber-100 text-amber-900 border-amber-300', label: 'צהוב' },
  teal: { pill: 'bg-teal-50 text-teal-800 border-teal-200', dot: 'bg-teal-500', bar: 'bg-teal-100 text-teal-900 border-teal-300', label: 'טורקיז' },
  rose: { pill: 'bg-rose-50 text-rose-800 border-rose-200', dot: 'bg-rose-500', bar: 'bg-rose-100 text-rose-900 border-rose-300', label: 'ורוד' },
  lime: { pill: 'bg-lime-50 text-lime-800 border-lime-200', dot: 'bg-lime-500', bar: 'bg-lime-100 text-lime-900 border-lime-300', label: 'ירוק בהיר' },
  emerald: { pill: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-600', bar: 'bg-emerald-100 text-emerald-900 border-emerald-300', label: 'ירוק' },
  orange: { pill: 'bg-orange-50 text-orange-800 border-orange-200', dot: 'bg-orange-500', bar: 'bg-orange-100 text-orange-900 border-orange-300', label: 'כתום' },
  pink: { pill: 'bg-pink-50 text-pink-800 border-pink-200', dot: 'bg-pink-500', bar: 'bg-pink-100 text-pink-900 border-pink-300', label: 'פוקסיה' },
  slate: { pill: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-500', bar: 'bg-slate-200 text-slate-800 border-slate-300', label: 'אפור' },
};
export const UNASSIGNED = { pill: 'border-dashed border-gray-300 bg-white text-slate-400', dot: 'bg-gray-300', bar: 'border-dashed border-gray-300 bg-gray-50 text-slate-600' };

/** A tag's color: its chosen color, else a default by position. */
export function tagColor(name: string, settings: WeddingSettings): TagColor {
  const chosen = settings.tagColors[name];
  if (chosen) return chosen;
  const i = settings.people.indexOf(name);
  return i >= 0 ? TAG_COLORS[i % (TAG_COLORS.length - 1)] : 'slate';
}

/** Style of a task by its first owner (bars and calendar dots use one color). */
export function taskStyle(t: WeddingTask, settings: WeddingSettings) {
  return t.owners.length ? TAG_STYLES[tagColor(t.owners[0], settings)] : UNASSIGNED;
}

/** Owner pills for display. Shows 'מי?' when nobody is assigned and `showEmpty` is set. */
export function OwnerPills({ t, s, showEmpty }: { t: WeddingTask; s: WeddingState; showEmpty?: boolean }) {
  if (!t.owners.length) return showEmpty ? <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${UNASSIGNED.pill}`}>מי?</span> : null;
  return (
    <span className="flex shrink-0 flex-wrap gap-1">
      {t.owners.map((o) => (
        <span key={o} className={`rounded-full border px-2 py-0.5 text-xs font-bold ${TAG_STYLES[tagColor(o, s.settings)].pill}`}>
          {o}
        </span>
      ))}
    </span>
  );
}

/** Multi-select: tap a name to add or remove it. */
export function OwnerPicker({ s, value, onChange, id }: { s: WeddingState; value: string[]; onChange: (v: string[]) => void; id?: string }) {
  const names = [...s.settings.people, ...value.filter((v) => !s.settings.people.includes(v))];
  return (
    <div id={id} className="flex flex-wrap gap-1.5" role="group" aria-label="מי עושה">
      {names.map((n) => {
        const on = value.includes(n);
        const st = TAG_STYLES[tagColor(n, s.settings)];
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== n) : [...value, n])}
            className={`min-h-[38px] rounded-full border px-3 text-sm font-bold ${on ? st.pill : 'border-gray-200 bg-white text-slate-500'}`}
          >
            {on ? '✓ ' : ''}
            {n}
          </button>
        );
      })}
      {!names.length && <span className="text-sm text-slate-400">אין עדיין תגיות. אפשר להוסיף ב&quot;עריכת תגיות&quot;.</span>}
    </div>
  );
}

/** '' = everyone, '__none' = not assigned, otherwise a name. */
export type OwnerFilter = string;
export function matchesOwner(t: WeddingTask, f: OwnerFilter): boolean {
  if (!f) return true;
  if (f === '__none') return t.owners.length === 0;
  return t.owners.includes(f);
}

export function OwnerFilterBar({ s, value, onChange, update }: { s: WeddingState; value: OwnerFilter; onChange: (v: OwnerFilter) => void; update: Update }) {
  const [editing, setEditing] = useState(false);
  const opts: Array<[OwnerFilter, string]> = [['', 'כולם'], ...s.settings.people.map((p): [string, string] => [p, p]), ['__none', 'בלי שיוך']];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">של מי</span>
      <div className="flex flex-wrap gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label="סינון לפי מי עושה">
        {opts.map(([v, l]) => (
          <button
            key={v || 'all'}
            aria-pressed={v === value}
            onClick={() => onChange(v)}
            className={`min-h-[34px] rounded-lg px-3 text-sm font-bold ${v === value ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
            style={v === value ? SELECTED_STYLE : undefined}
          >
            {l}
          </button>
        ))}
      </div>
      <button onClick={() => setEditing(true)} className="min-h-[34px] rounded-lg px-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50">
        עריכת תגיות
      </button>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={() => setEditing(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="עריכת תגיות"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">עריכת תגיות</h2>
              <button onClick={() => setEditing(false)} aria-label="סגירה" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <TagEditor s={s} update={update} />
            <button onClick={() => setEditing(false)} className="mt-4 min-h-[44px] w-full rounded-xl bg-emerald-600 text-sm font-bold text-white">
              סיום
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Add, rename, recolor and delete tags. Renaming retags that person's tasks
 * and keeps the color; deleting removes the tag from its tasks (after a
 * confirm that says how many).
 */
export function TagEditor({ s, update }: { s: WeddingState; update: Update }) {
  const people = s.settings.people;
  const [adding, setAdding] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taken = (name: string, except?: string) => people.some((p) => p === name && p !== except);

  const setColor = (name: string, color: TagColor) =>
    update((st) => ({ ...st, settings: { ...st.settings, tagColors: { ...st.settings.tagColors, [name]: color } } }));

  const rename = (old: string, name: string): boolean => {
    if (!name || name === old) return true;
    if (taken(name, old)) {
      setError(`כבר יש תגית בשם "${name}".`);
      return false;
    }
    setError(null);
    update((st) => {
      const colors = { ...st.settings.tagColors };
      const c = colors[old] ?? tagColor(old, st.settings);
      delete colors[old];
      colors[name] = c;
      return {
        ...st,
        settings: { ...st.settings, people: st.settings.people.map((p) => (p === old ? name : p)), tagColors: colors },
        tasks: st.tasks.map((t) => (t.owners.includes(old) ? { ...t, owners: t.owners.map((o) => (o === old ? name : o)) } : t)),
      };
    });
    return true;
  };

  const remove = (name: string) => {
    update((st) => {
      const colors = { ...st.settings.tagColors };
      delete colors[name];
      return {
        ...st,
        settings: { ...st.settings, people: st.settings.people.filter((p) => p !== name), tagColors: colors },
        tasks: st.tasks.map((t) => (t.owners.includes(name) ? { ...t, owners: t.owners.filter((o) => o !== name) } : t)),
      };
    });
    setConfirmDel(null);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    if (taken(name)) {
      setError(`כבר יש תגית בשם "${name}".`);
      return;
    }
    setError(null);
    const used = new Set(people.map((p) => tagColor(p, s.settings)));
    const color = TAG_COLORS.find((c) => !used.has(c)) ?? 'slate';
    update((st) => ({
      ...st,
      settings: { ...st.settings, people: [...st.settings.people, name], tagColors: { ...st.settings.tagColors, [name]: color } },
    }));
    setAdding('');
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">שינוי שם מעדכן את כל המשימות של התגית. הצבע מופיע בלוח השנה ובכל הרשימות. משימה יכולה לקבל כמה תגיות.</p>
      <ul className="flex flex-col gap-2">
        {people.map((name) => {
          const current = tagColor(name, s.settings);
          const count = s.tasks.filter((t) => t.owners.includes(name)).length;
          return (
            <li key={name} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${TAG_STYLES[current].pill}`}>{name}</span>
                <TagName name={name} onRename={rename} />
                {confirmDel !== name && (
                  <button
                    onClick={() => (count ? setConfirmDel(name) : remove(name))}
                    aria-label={`מחיקת התגית ${name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {confirmDel === name && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">
                  <span className="flex-1">
                    התגית מופיעה ב-{count} משימות ותוסר מהן. למחוק?
                  </span>
                  <button onClick={() => remove(name)} className="min-h-[34px] rounded-lg bg-red-600 px-3 font-bold text-white">
                    כן, למחוק
                  </button>
                  <button onClick={() => setConfirmDel(null)} className="min-h-[34px] rounded-lg border border-red-200 bg-white px-3 font-bold text-red-700">
                    לא
                  </button>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`צבע לתגית ${name}`}>
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={c === current}
                    aria-label={TAG_STYLES[c].label}
                    title={TAG_STYLES[c].label}
                    onClick={() => setColor(name, c)}
                    className={`h-7 w-7 rounded-full ${TAG_STYLES[c].dot} ${c === current ? 'ring-2 ring-slate-900 ring-offset-2' : 'opacity-80 hover:opacity-100'}`}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {people.length < 10 && (
        <form onSubmit={add} className="flex gap-2">
          <label htmlFor="tag-new" className="sr-only">
            תגית חדשה
          </label>
          <input
            id="tag-new"
            placeholder="תגית חדשה, למשל: אמא"
            maxLength={30}
            className={`${cellInput} min-h-[44px] flex-1`}
            value={adding}
            onChange={(e) => {
              setAdding(e.target.value);
              setError(null);
            }}
          />
          <button type="submit" className="flex min-h-[44px] items-center gap-1 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={!adding.trim()}>
            <Plus className="h-4 w-4" /> הוספה
          </button>
        </form>
      )}
    </div>
  );
}

/** Edits a tag name locally and applies it on blur/Enter, so typing never orphans tagged tasks. */
function TagName({ name, onRename }: { name: string; onRename: (old: string, name: string) => boolean }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const v = draft.trim();
    if (!v || v === name || !onRename(name, v)) setDraft(name);
  };
  return (
    <input
      aria-label={`שם התגית ${name}`}
      className={`${cellInput} min-h-[38px] min-w-0 flex-1`}
      value={draft}
      maxLength={30}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
