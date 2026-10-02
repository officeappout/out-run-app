'use client';

import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { buildRoadmap, daysBeforeFor, gematria, hebrewDate, hebrewDateLabel, layoutWeek, taskDueDate, taskStartDate, tasksOverlapping, toIso, weekStart } from '../wedding.calc';
import type { WeddingState, WeddingTask } from '../wedding.types';
import { OwnerFilterBar, OwnerPicker, OwnerPills, TAG_STYLES, matchesOwner, tagColor, taskStyle, type OwnerFilter } from './tags';
import { SELECTED_STYLE, card, cellInput, fmtDate, newId, type Update } from './ui';

/**
 * The tasks tab: one set of tasks, three views — month calendar (ranges as
 * bars), weeks, and a plain list — sharing one owner filter and one dialog.
 */

type View = 'calendar' | 'weeks' | 'list';
type TaskDraft = { task: WeddingTask; isNew: boolean };

const isRange = (t: WeddingTask) => t.startBefore > t.daysBefore;

/** "5.10" or "4.10–10.10" */
export function taskWhen(s: WeddingState, t: WeddingTask): string {
  const due = taskDueDate(s.settings.date, t.daysBefore);
  return isRange(t) ? `${fmtDate(taskStartDate(s.settings.date, t))}–${fmtDate(due)}` : fmtDate(due);
}

function patchTask(update: Update, id: string, p: Partial<WeddingTask>) {
  update((st) => ({ ...st, tasks: st.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
}

/** Today, or the wedding date if today is already past it. */
function defaultDueIso(s: WeddingState): string {
  const t = toIso(new Date());
  return t > s.settings.date ? s.settings.date : t;
}

function newTaskOn(s: WeddingState, iso: string, owners: string[]): WeddingTask {
  const d = daysBeforeFor(s.settings.date, iso);
  return { id: newId(), name: '', daysBefore: d, startBefore: d, done: false, owners };
}

/** One task row: tick + name, when, who. Tapping the name opens the dialog when `onOpen` is given. */
export function TaskLine({ t, s, update, late, onOpen }: { t: WeddingTask; s: WeddingState; update: Update; late?: boolean; onOpen?: (t: WeddingTask) => void }) {
  const body = (
    <>
      <span className={`min-w-0 flex-1 ${t.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{t.name}</span>
      <OwnerPills t={t} s={s} />
      <span className={`shrink-0 tabular-nums ${late ? 'font-bold text-red-600' : 'text-slate-500'}`}>
        {taskWhen(s, t)}
        {late ? ' · באיחור' : ''}
      </span>
    </>
  );
  return (
    <div className="flex items-center gap-2 border-b border-gray-100 py-2 text-sm last:border-b-0">
      <input
        type="checkbox"
        aria-label={`בוצע: ${t.name}`}
        className="h-5 w-5 shrink-0 accent-emerald-600"
        checked={t.done}
        onChange={(e) => patchTask(update, t.id, { done: e.target.checked })}
      />
      {onOpen ? (
        <button onClick={() => onOpen(t)} className="flex min-h-[36px] min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg px-1 text-right hover:bg-gray-50">
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{body}</div>
      )}
    </div>
  );
}

/** Add / edit a task: name, one day or a date range, who (several allowed), done, delete. */
function TaskDialog({ s, draft, onSave, onDelete, onClose }: { s: WeddingState; draft: TaskDraft; onSave: (t: WeddingTask) => void; onDelete: (id: string) => void; onClose: () => void }) {
  const [t, setT] = useState<WeddingTask>(draft.task);
  const [ranged, setRanged] = useState(isRange(draft.task));
  const [err, setErr] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const wedding = s.settings.date;
  const dueIso = toIso(taskDueDate(wedding, t.daysBefore));
  const startIso = toIso(taskStartDate(wedding, t));

  const setDue = (iso: string) => {
    const d = daysBeforeFor(wedding, iso);
    // Moving the end before the start drags the start along.
    setT((x) => ({ ...x, daysBefore: d, startBefore: ranged ? Math.max(x.startBefore, d) : d }));
  };
  const setStart = (iso: string) => {
    const d = daysBeforeFor(wedding, iso);
    setT((x) => ({ ...x, startBefore: d, daysBefore: Math.min(x.daysBefore, d) }));
  };
  const toggleRange = (on: boolean) => {
    setRanged(on);
    // Turning a range on starts it 3 days before the due date; off collapses it.
    setT((x) => ({ ...x, startBefore: on ? Math.max(x.startBefore, x.daysBefore + 3) : x.daysBefore }));
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!t.name.trim()) {
      setErr(true);
      return;
    }
    onSave({ ...t, name: t.name.trim(), startBefore: ranged ? Math.max(t.startBefore, t.daysBefore) : t.daysBefore });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="wt-title"
        dir="rtl"
        onSubmit={submit}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="wt-title" className="text-lg font-black text-slate-900">
            {draft.isNew ? 'משימה חדשה' : 'עריכת משימה'}
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wt-name" className="text-xs font-bold text-slate-600">
              מה צריך לעשות
            </label>
            <input
              id="wt-name"
              autoFocus
              placeholder="למשל: לסגור צלם"
              className={`${cellInput} min-h-[44px] ${err ? 'border-red-400' : ''}`}
              value={t.name}
              maxLength={300}
              onChange={(e) => {
                setT({ ...t, name: e.target.value });
                setErr(false);
              }}
            />
            {err && <span className="text-xs text-red-600">כתוב מה המשימה כדי לשמור.</span>}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-0.5 self-start rounded-xl bg-gray-100 p-1" role="group" aria-label="סוג תאריך">
              {(
                [
                  [false, 'יום אחד'],
                  [true, 'כמה ימים'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={ranged === v}
                  onClick={() => toggleRange(v)}
                  className={`min-h-[34px] rounded-lg px-3 text-sm font-bold ${ranged === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                  style={ranged === v ? SELECTED_STYLE : undefined}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className={`grid gap-3 ${ranged ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {ranged && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="wt-start" className="text-xs font-bold text-slate-600">
                    מתאריך
                  </label>
                  <input id="wt-start" type="date" max={wedding} className={`${cellInput} min-h-[44px]`} value={startIso} onChange={(e) => e.target.value && setStart(e.target.value)} />
                  <span className="text-xs text-slate-500">{hebrewDateLabel(new Date(`${startIso}T00:00:00`), false)}</span>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="wt-date" className="text-xs font-bold text-slate-600">
                  {ranged ? 'עד תאריך' : 'עד מתי'}
                </label>
                <input id="wt-date" type="date" max={wedding} className={`${cellInput} min-h-[44px]`} value={dueIso} onChange={(e) => e.target.value && setDue(e.target.value)} />
                <span className="text-xs text-slate-500">{hebrewDateLabel(new Date(`${dueIso}T00:00:00`), false)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-600">מי עושה (אפשר לבחור כמה)</span>
            <OwnerPicker s={s} value={t.owners} onChange={(owners) => setT({ ...t, owners })} />
          </div>

          {!draft.isNew && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={t.done} onChange={(e) => setT({ ...t, done: e.target.checked })} />
              בוצע
            </label>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <button type="submit" className="min-h-[44px] rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700">
              {draft.isNew ? 'הוספה' : 'שמירה'}
            </button>
            <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-gray-200 px-4 text-sm font-bold text-slate-700 hover:bg-gray-50">
              ביטול
            </button>
          </div>
          {!draft.isNew &&
            (confirmDel ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onDelete(t.id)} className="min-h-[38px] rounded-xl bg-red-600 px-3 text-sm font-bold text-white">
                  כן, למחוק
                </button>
                <button type="button" onClick={() => setConfirmDel(false)} className="min-h-[38px] rounded-xl border border-gray-200 px-3 text-sm font-bold text-slate-700">
                  לא
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="min-h-[38px] rounded-xl px-3 text-sm font-bold text-red-600 hover:bg-red-50">
                מחיקה
              </button>
            ))}
        </div>
      </form>
    </div>
  );
}

const HEB_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MAX_LANES = 4;

/**
 * Month grid, Sunday-first. Each week row lays its tasks out as bars that
 * span their date range (layoutWeek). Tapping a day lists everything active
 * that day under the grid, with '+' to add one there.
 */
function MonthCalendar({ s, tasks, onAdd, onOpen }: { s: WeddingState; tasks: WeddingTask[]; onAdd: (iso: string) => void; onOpen: (t: WeddingTask) => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const todayIso = toIso(new Date());
  const [picked, setPicked] = useState<string>(todayIso);
  const wedding = s.settings.date;
  const weddingDate = new Date(`${wedding}T00:00:00`);

  const first = weekStart(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((month.getDay() + daysInMonth) / 7);
  const weeks = Array.from({ length: rows }, (_, r) => {
    const ws = new Date(first);
    ws.setDate(first.getDate() + r * 7);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ws);
      d.setDate(ws.getDate() + i);
      return d;
    });
    const segs = layoutWeek(wedding, ws, tasks);
    return { ws, days, segs };
  });

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  // Hebrew months this civil month spans, e.g. 'תשרי–חשוון תשפ״ז'.
  const hFirst = hebrewDate(month);
  const hLast = hebrewDate(new Date(month.getFullYear(), month.getMonth(), daysInMonth));
  const hebrewSpan =
    hFirst && hLast
      ? hFirst.month === hLast.month
        ? `${hFirst.month} ${gematria(hFirst.year)}`
        : hFirst.year === hLast.year
          ? `${hFirst.month}–${hLast.month} ${gematria(hLast.year)}`
          : `${hFirst.month} ${gematria(hFirst.year)} – ${hLast.month} ${gematria(hLast.year)}`
      : '';
  const goTo = (d: Date) => setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  const pickedDate = new Date(`${picked}T00:00:00`);
  const pickedTasks = tasksOverlapping(wedding, tasks, pickedDate, pickedDate);
  const isLate = (t: WeddingTask) => !t.done && toIso(taskDueDate(wedding, t.daysBefore)) < todayIso;

  return (
    <section className={`${card} p-3 md:p-4`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} aria-label="החודש הקודם" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-slate-700 hover:bg-gray-50">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="min-w-[140px] text-center">
            <h2 className="text-lg font-black leading-tight text-slate-900">{month.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</h2>
            {hebrewSpan && <p className="text-xs font-bold text-slate-500">{hebrewSpan}</p>}
          </div>
          <button onClick={() => shift(1)} aria-label="החודש הבא" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-slate-700 hover:bg-gray-50">
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => goTo(new Date())} className="min-h-[36px] rounded-xl border border-gray-200 px-3 text-sm font-bold text-slate-700 hover:bg-gray-50">
            היום
          </button>
          <button onClick={() => goTo(weddingDate)} className="min-h-[36px] rounded-xl border border-gray-200 px-3 text-sm font-bold text-slate-700 hover:bg-gray-50">
            חודש החתונה
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="grid grid-cols-7 bg-gray-50">
          {HEB_DAYS.map((d) => (
            <div key={d} className="border-b border-gray-200 py-1.5 text-center text-xs font-bold text-slate-500">
              {d}
            </div>
          ))}
        </div>
        {weeks.map(({ ws, days, segs }) => {
          const lanes = Math.min(MAX_LANES, segs.reduce((m, sg) => Math.max(m, sg.lane + 1), 0));
          const hiddenByDay = days.map((_, i) => segs.filter((sg) => sg.lane >= MAX_LANES && sg.col <= i && i < sg.col + sg.span).length);
          return (
            <div
              key={ws.getTime()}
              className="grid grid-cols-7 border-b border-gray-200 last:border-b-0 [grid-template-rows:40px_repeat(var(--lanes),7px)_minmax(10px,1fr)] md:[grid-template-rows:28px_repeat(var(--lanes),24px)_minmax(18px,1fr)]"
              style={{ ['--lanes' as string]: String(lanes), minHeight: 64 } as React.CSSProperties}
            >
              {days.map((d, i) => {
                const iso = toIso(d);
                const inMonth = d.getMonth() === month.getMonth();
                const isWedding = iso === wedding;
                const h = hebrewDate(d);
                return (
                  <button
                    key={iso}
                    onClick={() => setPicked(iso)}
                    aria-label={d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}
                    aria-pressed={picked === iso}
                    style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
                    className={`flex flex-col items-start gap-0.5 border-s border-gray-100 p-1 first:border-s-0 md:min-h-[96px] md:flex-row md:flex-wrap md:items-center md:content-start md:gap-x-1.5 md:p-1.5 ${
                      isWedding ? 'bg-emerald-50' : inMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50'
                    } ${picked === iso ? 'ring-2 ring-inset ring-emerald-500' : ''}`}
                  >
                    <span
                      className={`flex h-6 min-w-[24px] items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                        iso === todayIso ? 'bg-emerald-600 font-bold text-white' : isWedding ? 'bg-slate-900 font-bold text-white' : inMonth ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    {h && (
                      <span className={`max-w-full truncate text-[10px] leading-tight md:text-[11px] ${h.day === 1 ? 'font-bold text-emerald-700' : inMonth ? 'text-slate-400' : 'text-slate-300'}`}>
                        {h.day === 1 ? `${gematria(1)} ${h.month}` : gematria(h.day)}
                      </span>
                    )}
                    {hiddenByDay[i] > 0 && <span className="mt-auto hidden text-[11px] font-bold text-slate-500 md:block">+{hiddenByDay[i]} נוספות</span>}
                  </button>
                );
              })}
              {segs
                .filter((sg) => sg.lane < MAX_LANES)
                .map((sg) => {
                  const st = taskStyle(sg.task, s.settings);
                  const late = isLate(sg.task);
                  return (
                    <button
                      key={sg.task.id}
                      onClick={() => onOpen(sg.task)}
                      title={`${sg.task.name} · ${taskWhen(s, sg.task)}${sg.task.owners.length ? ` · ${sg.task.owners.join(', ')}` : ''}`}
                      style={{ gridColumn: `${sg.col + 1} / span ${sg.span}`, gridRow: sg.lane + 2 }}
                      className={`z-10 mx-0.5 my-px flex min-w-0 items-center gap-1 overflow-hidden border px-1.5 text-right text-[11px] leading-none md:text-xs ${
                        late ? 'border-red-300 bg-red-100 text-red-800' : st.bar
                      } ${sg.continuesBefore ? 'rounded-s-none border-s-0' : 'rounded-s-md'} ${sg.continuesAfter ? 'rounded-e-none border-e-0' : 'rounded-e-md'} ${
                        sg.task.done ? 'opacity-50 line-through' : ''
                      }`}
                    >
                      <span className="hidden truncate md:inline">{sg.task.name}</span>
                      {sg.task.owners.length > 1 && (
                        <span className="ms-auto hidden shrink-0 gap-0.5 md:flex" aria-hidden="true">
                          {sg.task.owners.map((o) => (
                            <i key={o} className={`block h-2 w-2 rounded-full ${TAG_STYLES[tagColor(o, s.settings)].dot}`} />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-slate-900">{pickedDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
            <p className="text-xs text-slate-500">{hebrewDateLabel(pickedDate)}</p>
          </div>
          {picked <= wedding && (
            <button onClick={() => onAdd(picked)} className="flex items-center gap-1 text-sm font-bold text-emerald-700">
              <Plus className="h-4 w-4" /> משימה ליום הזה
            </button>
          )}
        </div>
        {picked === wedding && <p className="py-1 text-sm font-bold text-emerald-700">יום החתונה</p>}
        {pickedTasks.length ? (
          pickedTasks.map((t) => {
            const st = taskStyle(t, s.settings);
            return (
              <button
                key={t.id}
                onClick={() => onOpen(t)}
                className={`mb-1.5 flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-right text-sm ${isLate(t) ? 'border-red-200 bg-red-50 text-red-800' : st.pill} ${
                  t.done ? 'line-through opacity-60' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-bold">{t.name}</span>
                <span className="shrink-0 text-xs">
                  {taskWhen(s, t)}
                  {t.owners.length ? ` · ${t.owners.join(', ')}` : ''}
                </span>
              </button>
            );
          })
        ) : (
          <p className="py-1 text-sm text-slate-400">אין משימות ביום הזה.</p>
        )}
      </div>
    </section>
  );
}

const weekRange = (a: Date, b: Date) => `${fmtDate(a)}–${fmtDate(b)}`;

function WeeksView({ s, tasks, update, onAddDate, onOpen }: { s: WeddingState; tasks: WeddingTask[]; update: Update; onAddDate: (iso: string) => void; onOpen: (t: WeddingTask) => void }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const { weeks } = buildRoadmap(s.settings.date, tasks);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addToWeek = (start: Date, end: Date) => {
    const thu = new Date(start);
    thu.setDate(thu.getDate() + 4);
    const iso = toIso(start <= today && today <= end ? today : thu);
    onAddDate(iso > s.settings.date ? s.settings.date : iso);
  };
  const label = (offset: number, wedding: boolean) =>
    wedding ? 'שבוע החתונה' : offset === 0 ? 'השבוע' : offset === 1 ? 'שבוע הבא' : `בעוד ${offset} שבועות`;
  const visible = weeks.filter((w) => showEmpty || w.offset < 2 || w.isWeddingWeek || w.tasks.length > 0);
  const hidden = weeks.length - visible.length;

  return (
    <div className="flex flex-col gap-3">
      {(hidden > 0 || showEmpty) && (
        <button onClick={() => setShowEmpty((v) => !v)} className="self-start text-sm font-bold text-emerald-700">
          {showEmpty ? 'להסתיר שבועות ריקים' : `להציג גם ${hidden} שבועות ריקים`}
        </button>
      )}
      <ol className="flex flex-col gap-3">
        {visible.map((w) => {
          const done = w.tasks.filter((t) => t.done).length;
          const current = w.offset === 0;
          return (
            <li key={w.start.getTime()} className={`rounded-2xl border bg-white p-4 md:p-5 ${current ? 'border-emerald-400 ring-1 ring-emerald-200' : w.isWeddingWeek ? 'border-slate-900' : 'border-gray-200'}`}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className={`h-4 w-4 ${current ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <h2 className="font-black text-slate-900">{label(w.offset, w.isWeddingWeek)}</h2>
                  <span className="text-xs tabular-nums text-slate-500">{weekRange(w.start, w.end)}</span>
                </div>
                {w.tasks.length > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${done === w.tasks.length ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-slate-600'}`}>
                    {done}/{w.tasks.length}
                  </span>
                )}
              </div>
              {w.tasks.length ? w.tasks.map((t) => <TaskLine key={t.id} t={t} s={s} update={update} onOpen={onOpen} />) : <p className="py-1 text-sm text-slate-400">אין משימות לשבוע הזה.</p>}
              <button onClick={() => addToWeek(w.start, w.end)} className="mt-2 flex items-center gap-1 text-sm font-bold text-emerald-700">
                <Plus className="h-4 w-4" /> משימה לשבוע הזה
              </button>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-slate-500">בתצוגת שבועות כל משימה מופיעה בשבוע של תאריך הסיום שלה.</p>
    </div>
  );
}

/** All tasks by due date, grouped by month. */
function ListView({ s, tasks, update, onOpen }: { s: WeddingState; tasks: WeddingTask[]; update: Update; onOpen: (t: WeddingTask) => void }) {
  const todayIso = toIso(new Date());
  const sorted = [...tasks].sort((a, b) => b.daysBefore - a.daysBefore);
  const groups: Array<{ label: string; items: WeddingTask[] }> = [];
  for (const t of sorted) {
    const label = taskDueDate(s.settings.date, t.daysBefore).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(t);
    else groups.push({ label, items: [t] });
  }
  if (!sorted.length) return <div className={`${card} py-10 text-center text-sm text-slate-500`}>אין משימות להצגה.</div>;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <section key={g.label} className={card}>
          <h2 className="mb-1 font-black text-slate-900">{g.label}</h2>
          {g.items.map((t) => (
            <TaskLine key={t.id} t={t} s={s} update={update} onOpen={onOpen} late={!t.done && toIso(taskDueDate(s.settings.date, t.daysBefore)) < todayIso} />
          ))}
        </section>
      ))}
    </div>
  );
}

export function TasksHub({ s, update }: { s: WeddingState; update: Update }) {
  const [view, setView] = useState<View>('calendar');
  const [who, setWho] = useState<OwnerFilter>('');
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = s.tasks.filter((t) => matchesOwner(t, who));
  const { overdue, weeks } = buildRoadmap(s.settings.date, filtered);
  const ownersForNew = who && who !== '__none' ? [who] : [];

  const addOn = (iso: string) => setDraft({ task: newTaskOn(s, iso, ownersForNew), isNew: true });
  const open = (t: WeddingTask) => setDraft({ task: t, isNew: false });

  return (
    <div className="flex flex-col gap-4">
      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">
            <b className="tabular-nums">{weeks.length}</b> שבועות עד החתונה · <b className="tabular-nums">{s.tasks.filter((t) => t.done).length}</b> מתוך{' '}
            <b className="tabular-nums">{s.tasks.length}</b> משימות בוצעו
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label="תצוגה">
              {(
                [
                  ['calendar', 'לוח שנה'],
                  ['weeks', 'שבועות'],
                  ['list', 'רשימה'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`min-h-[34px] rounded-lg px-3 text-sm font-bold ${view === v ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                  style={view === v ? SELECTED_STYLE : undefined}
                >
                  {l}
                </button>
              ))}
            </div>
            <button onClick={() => addOn(defaultDueIso(s))} className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> משימה
            </button>
          </div>
        </div>
        <OwnerFilterBar s={s} value={who} onChange={setWho} update={update} />
        {notice && (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        )}
      </section>

      {overdue.length > 0 && view !== 'list' && (
        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4 md:p-5">
          <h2 className="mb-1 font-black text-red-700">באיחור</h2>
          <p className="mb-2 text-xs text-red-700/80">משימות שתאריך הסיום שלהן עבר. סמן שבוצעו, או פתח ושנה תאריך.</p>
          {overdue.map((t) => (
            <TaskLine key={t.id} t={t} s={s} update={update} late onOpen={open} />
          ))}
        </section>
      )}

      {view === 'calendar' && <MonthCalendar s={s} tasks={filtered} onAdd={addOn} onOpen={open} />}
      {view === 'weeks' && <WeeksView s={s} tasks={filtered} update={update} onAddDate={addOn} onOpen={open} />}
      {view === 'list' && <ListView s={s} tasks={filtered} update={update} onOpen={open} />}

      {draft && (
        <TaskDialog
          s={s}
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={(t) => {
            update((st) => ({ ...st, tasks: st.tasks.some((x) => x.id === t.id) ? st.tasks.map((x) => (x.id === t.id ? t : x)) : [...st.tasks, t] }));
            if (draft.isNew) setNotice(`נוספה המשימה "${t.name}" (${taskWhen(s, t)}).`);
            setDraft(null);
          }}
          onDelete={(id) => {
            update((st) => ({ ...st, tasks: st.tasks.filter((x) => x.id !== id) }));
            setDraft(null);
          }}
        />
      )}
    </div>
  );
}
