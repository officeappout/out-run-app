'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { MARKET } from '../wedding.config';
import { buildRoadmap, daysBeforeFor, daysUntil, formatShekel, rankVenues, taskDueDate, toIso, venueCost } from '../wedding.calc';
import { TOGETHER, VENDOR_STATUSES, type Venue, type WeddingSettings, type WeddingState, type WeddingTask } from '../wedding.types';
import { VenueEditor } from './VenueEditor';
import { useWeddingStore, type SaveStatus } from './useWeddingStore';

type Tab = 'home' | 'roadmap' | 'venues' | 'vendors' | 'tasks' | 'market' | 'settings';
const TABS: Array<[Tab, string]> = [
  ['home', 'סקירה'],
  ['roadmap', 'מפת דרכים'],
  ['venues', 'השוואת אולמות'],
  ['vendors', 'ספקים'],
  ['tasks', 'משימות'],
  ['market', 'מחירי שוק'],
  ['settings', 'הגדרות'],
];
/**
 * Selected pill colors set inline as well as by class: in production the
 * label of a selected tab rendered invisible (dark on dark) — inline style
 * wins over whatever cascade caused it.
 */
const SELECTED_STYLE: React.CSSProperties = { backgroundColor: '#0f172a', color: '#ffffff' };
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const card = 'rounded-2xl border border-gray-200 bg-white p-4 md:p-5';
const cellInput =
  'w-full min-w-[80px] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`;
const fmtIso = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};

function blankVenue(settings: WeddingSettings): Venue {
  return {
    id: newId(),
    name: '',
    city: '',
    contact: '',
    date: settings.date,
    status: 'לברר',
    price: 0,
    vatIncluded: false,
    minGuests: 0,
    alcohol: 0,
    incl: { design: false, chuppah: false, light: false, bar: false },
    djFee: 0,
    extras: 0,
    discount: 0,
    notes: '',
  };
}

export function WeddingPlanner() {
  const store = useWeddingStore();
  const [tab, setTab] = useState<Tab>('home');
  const [guests, setGuests] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ venue: Venue; isNew: boolean } | null>(null);

  if (store.forbidden) {
    return (
      <div className={`${card} mx-auto mt-10 max-w-md text-center`}>
        <p className="font-bold text-slate-900">העמוד לא זמין כרגע.</p>
      </div>
    );
  }
  if (store.error) {
    return (
      <div className={`${card} mx-auto mt-10 max-w-md text-center`}>
        <p className="font-bold text-slate-900">{store.error}</p>
        <button onClick={() => window.location.reload()} className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
          נסה שוב
        </button>
      </div>
    );
  }
  if (!store.state) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
      </div>
    );
  }

  const s = store.state;
  const g = guests ?? s.settings.guests;
  const weekday = WEEKDAYS[new Date(`${s.settings.date}T00:00:00`).getDay()];
  const openNew = () => setEditing({ venue: blankVenue(s.settings), isNew: true });
  const openEdit = (v: Venue) => setEditing({ venue: v, isNew: false });

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6" dir="rtl">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">
              חתונה · {fmtIso(s.settings.date)} · יום {weekday}
            </p>
            <h1 className="text-2xl font-black text-slate-900">תכנון חתונה</h1>
          </div>
          <SaveBadge status={store.status} onRetry={store.retry} />
        </header>

        <nav role="tablist" aria-label="מסכים" className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-white p-1">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-[40px] rounded-xl px-4 text-sm font-bold ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-gray-100'}`}
              style={tab === id ? SELECTED_STYLE : undefined}
            >
              {label}
            </button>
          ))}
        </nav>

        {store.notice && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{store.notice}</span>
            <button onClick={store.dismissNotice} className="font-bold">
              הבנתי
            </button>
          </div>
        )}

        {tab === 'home' && <Overview s={s} g={g} onNew={openNew} go={setTab} update={store.update} />}
        {tab === 'roadmap' && <Roadmap s={s} update={store.update} />}
        {tab === 'venues' && <Venues s={s} g={g} setGuests={setGuests} onNew={openNew} onEdit={openEdit} />}
        {tab === 'vendors' && <Vendors s={s} update={store.update} />}
        {tab === 'tasks' && <Tasks s={s} update={store.update} />}
        {tab === 'market' && <Market s={s} g={g} />}
        {tab === 'settings' && <Settings s={s} update={store.update} />}
      </div>

      {editing && (
        <VenueEditor
          venue={editing.venue}
          isNew={editing.isNew}
          guests={g}
          settings={s.settings}
          onClose={() => setEditing(null)}
          onSave={(v) => {
            store.update((st) => ({
              ...st,
              venues: st.venues.some((x) => x.id === v.id) ? st.venues.map((x) => (x.id === v.id ? v : x)) : [...st.venues, v],
            }));
            setEditing(null);
          }}
          onDelete={(id) => {
            store.update((st) => ({ ...st, venues: st.venues.filter((x) => x.id !== id) }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SaveBadge({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> שומר…
      </span>
    );
  if (status === 'saved')
    return (
      <span className="flex items-center gap-1.5 text-sm text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> נשמר
      </span>
    );
  if (status === 'error')
    return (
      <button onClick={onRetry} className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-bold text-red-600">
        <AlertTriangle className="h-4 w-4" /> השמירה נכשלה, לנסות שוב
      </button>
    );
  return null;
}

function Kpi({ label, value, sub, tone }: { label: string; value: string | number; sub: string; tone?: 'good' }) {
  return (
    <div className={card}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${tone === 'good' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function CostBars({ rows, split }: { rows: ReturnType<typeof rankVenues>; split: boolean }) {
  const max = rows[rows.length - 1]?.cost.total || 1;
  const w = (x: number) => `${Math.max(0, (x / max) * 100).toFixed(1)}%`;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map(({ venue, cost }, i) => (
        <div key={venue.id} className="grid grid-cols-[1fr_90px] items-center gap-x-3 gap-y-1 sm:grid-cols-[180px_1fr_100px]">
          <span className="truncate text-sm font-bold text-slate-700">{venue.name}</span>
          <div className="col-span-2 row-start-2 flex h-5 gap-0.5 overflow-hidden rounded-md bg-gray-100 sm:col-span-1 sm:row-start-auto">
            {split ? (
              <>
                <span className="h-full bg-slate-700" style={{ width: w(cost.meals - venue.discount) }} />
                <span className="h-full bg-orange-400" style={{ width: w(cost.gapSum) }} />
                <span className="h-full bg-gray-400" style={{ width: w(venue.djFee + venue.extras) }} />
              </>
            ) : (
              <span className={`h-full ${i === 0 ? 'bg-emerald-500' : 'bg-slate-700'}`} style={{ width: w(cost.total) }} />
            )}
          </div>
          <span className="text-left text-sm font-black tabular-nums text-slate-900 sm:row-start-auto">{formatShekel(cost.total)}</span>
        </div>
      ))}
    </div>
  );
}

function Overview({ s, g, onNew, go, update }: { s: WeddingState; g: number; onNew: () => void; go: (t: Tab) => void; update: Update }) {
  const ranked = rankVenues(s.venues, g, s.settings);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const days = daysUntil(s.settings.date);
  const cheapestPlate = [...ranked].sort((a, b) => a.venue.price - b.venue.price)[0];
  const cheapRank = cheapestPlate ? ranked.indexOf(cheapestPlate) + 1 : 0;

  const { overdue, weeks } = buildRoadmap(s.settings.date, s.tasks);
  const thisWeek = weeks[0]?.tasks ?? [];
  const nextUp = weeks.slice(1).flatMap((w) => w.tasks).find((t) => !t.done);

  const chosen = s.venues.find((v) => v.status === 'נבחר') ?? best?.venue;
  const venueTotal = chosen ? venueCost(chosen, g, s.settings).total : 0;
  const vendorsTotal = s.vendors.reduce((a, v) => a + v.price, 0);
  const total = venueTotal + vendorsTotal;
  const budget = s.settings.budget;
  const scale = Math.max(budget, total) || 1;

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ימים לחתונה" value={days >= 0 ? days : '—'} sub={`עד ${fmtIso(s.settings.date)}`} />
        <Kpi label="אורחים" value={g} sub={`טווח ${s.settings.low}–${s.settings.high}`} />
        <Kpi label={`ההצעה המשתלמת (${g})`} value={best ? formatShekel(best.cost.total) : '—'} sub={best ? `${best.venue.name} · ${formatShekel(best.cost.perGuest)} לאורח` : 'עוד אין הצעות'} tone="good" />
        <Kpi label="פער בין הזולה ליקרה" value={ranked.length > 1 ? formatShekel(worst.cost.total - best.cost.total) : '—'} sub={`${ranked.length} הצעות פעילות`} />
      </section>

      {cheapRank > 1 && (
        <section className={`${card} flex flex-wrap items-center gap-4`}>
          <span className="text-2xl font-black tabular-nums text-orange-700">{formatShekel(cheapestPlate.venue.price)}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900">המחיר למנה הכי נמוך לא אומר הצעה זולה</p>
            <p className="text-sm text-slate-600">
              {cheapestPlate.venue.name} מציע את המנה הזולה, אבל בעלות האמיתית הוא במקום {cheapRank} מתוך {ranked.length}: {formatShekel(cheapestPlate.cost.total)}.
            </p>
          </div>
          <button onClick={() => go('venues')} className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-gray-50">
            לפירוט
          </button>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${card} lg:col-span-2`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-black text-slate-900">עלות כוללת אמיתית</h2>
            <span className="text-xs text-slate-500">{g} אורחים · כולל מע״מ והשלמות</span>
          </div>
          {ranked.length ? (
            <CostBars rows={ranked} split={false} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center text-sm text-slate-500">
              עוד לא הוזנו הצעות מאולמות.
              <button onClick={onNew} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white">
                <Plus className="h-4 w-4" /> הוספת הצעה ראשונה
              </button>
            </div>
          )}
        </div>
        <div className={card}>
          <h2 className="mb-1 font-black text-slate-900">השבוע שלך</h2>
          {weeks[0] && <p className="mb-2 text-xs text-slate-500">{weekRange(weeks[0].start, weeks[0].end)}</p>}
          {overdue.map((t) => (
            <TaskLine key={t.id} t={t} s={s} update={update} late />
          ))}
          {thisWeek.map((t) => (
            <TaskLine key={t.id} t={t} s={s} update={update} />
          ))}
          {!overdue.length && !thisWeek.length && (
            <p className="py-2 text-sm text-slate-500">
              אין משימות לשבוע הזה.
              {nextUp ? ` הבאה בתור: ${nextUp.name} (${fmtDate(taskDueDate(s.settings.date, nextUp.daysBefore))}).` : ''}
            </p>
          )}
          <button onClick={() => go('roadmap')} className="mt-3 text-sm font-bold text-emerald-700">
            למפת הדרכים
          </button>
        </div>
      </section>

      <section className={card}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-black text-slate-900">תקציב</h2>
          {budget ? (
            <span className="text-xs text-slate-500">תקציב כולל {formatShekel(budget)}</span>
          ) : (
            <button onClick={() => go('settings')} className="text-sm font-bold text-emerald-700">
              להגדרת תקציב
            </button>
          )}
        </div>
        <div className="flex h-6 gap-0.5 overflow-hidden rounded-md bg-gray-100">
          <span className="h-full bg-slate-700" style={{ width: `${((venueTotal / scale) * 100).toFixed(1)}%` }} />
          <span className="h-full bg-orange-400" style={{ width: `${((vendorsTotal / scale) * 100).toFixed(1)}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Mini label={`אולם${chosen ? ` (${chosen.name})` : ''}`} value={formatShekel(venueTotal)} />
          <Mini label="ספקים" value={formatShekel(vendorsTotal)} />
          <Mini label="סה״כ צפוי" value={formatShekel(total)} />
          <Mini
            label={!budget ? 'נשאר' : budget >= total ? 'נשאר' : 'חריגה'}
            value={budget ? formatShekel(Math.abs(budget - total)) : '—'}
            tone={budget && budget < total ? 'bad' : 'good'}
          />
        </div>
      </section>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-black tabular-nums ${tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`ml-1 inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800 line-through'}`}>
      {label}
    </span>
  );
}

function Venues({
  s,
  g,
  setGuests,
  onNew,
  onEdit,
}: {
  s: WeddingState;
  g: number;
  setGuests: (n: number) => void;
  onNew: () => void;
  onEdit: (v: Venue) => void;
}) {
  const ranked = rankVenues(s.venues, g, s.settings);
  const rankedIds = new Set(ranked.map((r) => r.venue.id));
  const out = s.venues.filter((v) => !rankedIds.has(v.id));
  const options = useMemo(
    () => [s.settings.low, s.settings.guests, s.settings.high].filter((x, i, a) => x > 0 && a.indexOf(x) === i),
    [s.settings.low, s.settings.guests, s.settings.high],
  );
  const rows: Array<{ venue: Venue; rank: number }> = [...ranked.map((r, i) => ({ venue: r.venue, rank: i + 1 })), ...out.map((venue) => ({ venue, rank: 0 }))];

  return (
    <div className="flex flex-col gap-4">
      <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">מספר אורחים</span>
          <div className="flex gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label="מספר אורחים">
            {options.map((o) => (
              <button
                key={o}
                aria-pressed={o === g}
                onClick={() => setGuests(o)}
                className={`min-h-[36px] rounded-lg px-3 text-sm font-bold ${o === g ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                style={o === g ? SELECTED_STYLE : undefined}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onNew} className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">
          <Plus className="h-4 w-4" /> הצעה חדשה
        </button>
      </section>

      {rows.length === 0 ? (
        <div className={`${card} py-10 text-center text-sm text-slate-500`}>
          עוד אין הצעות. לחץ על &quot;הצעה חדשה&quot; והזן מחיר למנה, מינימום ומה כלול בחבילה.
        </div>
      ) : (
        <section className={`${card} overflow-x-auto p-2 md:p-2`}>
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500">
                {['דירוג', 'אולם', 'סטטוס', 'מחיר בהצעה', 'מנה אמיתית', 'מינימום', 'מה כלול', 'כניסת DJ', 'עלות כוללת', 'לאורח'].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-gray-200 px-2 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ venue: v, rank }) => {
                const c = venueCost(v, g, s.settings);
                const priced = v.price > 0;
                return (
                  <tr
                    key={v.id}
                    tabIndex={0}
                    onClick={() => onEdit(v)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onEdit(v);
                      }
                    }}
                    aria-label={`עריכת ${v.name}`}
                    className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${rank === 1 ? 'bg-emerald-50/60' : ''} ${rank === 0 ? 'opacity-60' : ''}`}
                  >
                    <td className="px-2 py-3">
                      {rank ? (
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${rank === 1 ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-slate-700'}`}>{rank}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <p className="font-bold text-slate-900">{v.name}</p>
                      <p className="text-xs text-slate-500">
                        {v.city}
                        {v.date ? ` · ${fmtIso(v.date)}` : ''}
                      </p>
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
                          v.status === 'נבחר' ? 'bg-emerald-50 text-emerald-800' : v.status === 'נפסל' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-slate-600'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>
                    <td className="px-2 py-3 tabular-nums">
                      {priced ? formatShekel(v.price) : '—'}
                      <p className="text-xs text-slate-500">
                        {v.vatIncluded ? 'כולל מע״מ' : '+ מע״מ'}
                        {v.alcohol ? ` · אלכוהול +${v.alcohol}` : ''}
                      </p>
                    </td>
                    <td className="px-2 py-3 font-bold tabular-nums">{priced ? formatShekel(c.real) : '—'}</td>
                    <td className="px-2 py-3 tabular-nums">
                      {v.minGuests || '—'}
                      {c.emptyPlates > 0 && <p className="text-xs text-orange-700">{c.emptyPlates} מנות ריקות</p>}
                    </td>
                    <td className="px-2 py-3">
                      <Chip ok={v.incl.design} label="עיצוב" />
                      <Chip ok={v.incl.chuppah} label="חופה" />
                      <Chip ok={v.incl.light} label="תאורה" />
                      <Chip ok={v.incl.bar} label="בר" />
                    </td>
                    <td className="px-2 py-3 tabular-nums">{v.djFee ? formatShekel(v.djFee) : 'ללא'}</td>
                    <td className="px-2 py-3 font-black tabular-nums text-slate-900">{priced ? formatShekel(c.total) : '—'}</td>
                    <td className="px-2 py-3 tabular-nums">{priced ? formatShekel(c.perGuest) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {ranked.length > 0 && (
        <section className={card}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-black text-slate-900">ממה מורכבת העלות</h2>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <Legend cls="bg-slate-700" label="מנות כולל מע״מ" />
              <Legend cls="bg-orange-400" label="השלמות" />
              <Legend cls="bg-gray-400" label="DJ ותוספות" />
            </div>
          </div>
          <CostBars rows={ranked} split />
          <p className="mt-3 text-xs text-slate-500">
            עלויות השלמה: עיצוב {formatShekel(s.settings.design)} · חופה {formatShekel(s.settings.chuppah)} · תאורה {formatShekel(s.settings.light)} · בר {formatShekel(s.settings.bar)} לאורח. משנים בלשונית הגדרות.
          </p>
        </section>
      )}
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <i className={`inline-block h-2.5 w-2.5 rounded-sm ${cls}`} />
      {label}
    </span>
  );
}

type Update = (fn: (s: WeddingState) => WeddingState) => void;

const weekRange = (a: Date, b: Date) => `${fmtDate(a)}–${fmtDate(b)}`;

function patchTask(update: Update, id: string, p: Partial<WeddingTask>) {
  update((st) => ({ ...st, tasks: st.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
}

/** Pill colors per person, by position in settings.people; TOGETHER and unassigned have their own. */
const PERSON_PILLS = [
  'bg-sky-50 text-sky-800 border-sky-200',
  'bg-violet-50 text-violet-800 border-violet-200',
  'bg-amber-50 text-amber-800 border-amber-200',
  'bg-teal-50 text-teal-800 border-teal-200',
  'bg-rose-50 text-rose-800 border-rose-200',
  'bg-lime-50 text-lime-800 border-lime-200',
];
function pillClass(owner: string, people: string[]): string {
  if (!owner) return 'border-dashed border-gray-300 bg-white text-slate-400';
  if (owner === TOGETHER) return 'bg-slate-100 text-slate-700 border-slate-200';
  const i = people.indexOf(owner);
  return i >= 0 ? PERSON_PILLS[i % PERSON_PILLS.length] : 'bg-gray-50 text-slate-600 border-gray-200';
}

/** Who-does-it tag. A select styled as a pill when editable, a plain pill otherwise. */
function OwnerTag({ t, s, update, editable }: { t: WeddingTask; s: WeddingState; update: Update; editable?: boolean }) {
  const people = s.settings.people;
  const cls = `shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${pillClass(t.owner, people)}`;
  if (!editable) return t.owner ? <span className={cls}>{t.owner}</span> : null;
  const options = [...people, TOGETHER];
  if (t.owner && !options.includes(t.owner)) options.push(t.owner); // keep a name that was renamed/removed in settings
  return (
    <select aria-label={`מי עושה: ${t.name}`} className={`${cls} min-h-[32px] cursor-pointer appearance-none text-center`} value={t.owner} onChange={(e) => patchTask(update, t.id, { owner: e.target.value })}>
      <option value="">מי?</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/** '' = everyone. A person filter also shows tasks tagged TOGETHER. */
type OwnerFilter = string;
function matchesOwner(t: WeddingTask, f: OwnerFilter): boolean {
  if (!f) return true;
  if (f === '__none') return !t.owner;
  return t.owner === f || (f !== TOGETHER && t.owner === TOGETHER);
}

function OwnerFilterBar({ s, value, onChange }: { s: WeddingState; value: OwnerFilter; onChange: (v: OwnerFilter) => void }) {
  const opts: Array<[OwnerFilter, string]> = [['', 'כולם'], ...s.settings.people.map((p): [string, string] => [p, p]), [TOGETHER, TOGETHER], ['__none', 'בלי שיוך']];
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
    </div>
  );
}

/** One task row: tick, name, who, and (in the roadmap) a date to move it to another week. */
function TaskLine({ t, s, update, late, editable }: { t: WeddingTask; s: WeddingState; update: Update; late?: boolean; editable?: boolean }) {
  const due = taskDueDate(s.settings.date, t.daysBefore);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-2 text-sm last:border-b-0">
      <input
        type="checkbox"
        aria-label={`בוצע: ${t.name}`}
        className="h-5 w-5 shrink-0 accent-emerald-600"
        checked={t.done}
        onChange={(e) => patchTask(update, t.id, { done: e.target.checked })}
      />
      {editable ? (
        <input
          aria-label="משימה"
          className={`${cellInput} min-w-[50%] flex-1 ${t.done ? 'text-slate-400 line-through' : ''}`}
          value={t.name}
          onChange={(e) => patchTask(update, t.id, { name: e.target.value })}
        />
      ) : (
        <span className={`min-w-0 flex-1 ${t.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{t.name}</span>
      )}
      <OwnerTag t={t} s={s} update={update} editable={editable} />
      {editable ? (
        <input
          type="date"
          aria-label={`תאריך יעד: ${t.name}`}
          className={`${cellInput} w-36 min-w-0 shrink-0 ${late ? 'text-red-600' : ''}`}
          value={toIso(due)}
          max={s.settings.date}
          onChange={(e) => e.target.value && patchTask(update, t.id, { daysBefore: daysBeforeFor(s.settings.date, e.target.value) })}
        />
      ) : (
        <span className={`shrink-0 tabular-nums ${late ? 'font-bold text-red-600' : 'text-slate-500'}`}>
          {fmtDate(due)}
          {late ? ' · באיחור' : ''}
        </span>
      )}
      {editable && (
        <button
          aria-label={`מחיקת ${t.name}`}
          onClick={() => update((st) => ({ ...st, tasks: st.tasks.filter((x) => x.id !== t.id) }))}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Week-by-week plan from this week to the wedding week. */
function Roadmap({ s, update }: { s: WeddingState; update: Update }) {
  const [showEmpty, setShowEmpty] = useState(false);
  const [who, setWho] = useState<OwnerFilter>('');
  const { overdue, weeks } = buildRoadmap(s.settings.date, s.tasks.filter((t) => matchesOwner(t, who)));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const addTo = (start: Date, end: Date) => {
    // This week: due today; future weeks: due on the week's Thursday (capped by the wedding date).
    const thu = new Date(start);
    thu.setDate(thu.getDate() + 4);
    const due = start <= today && today <= end ? today : thu;
    const iso = toIso(due) > s.settings.date ? s.settings.date : toIso(due);
    // A task added while filtering by a person is tagged with that person.
    const owner = who && who !== '__none' ? who : '';
    update((st) => ({ ...st, tasks: [...st.tasks, { id: newId(), name: 'משימה חדשה', daysBefore: daysBeforeFor(st.settings.date, iso), done: false, owner }] }));
  };

  const label = (offset: number, wedding: boolean) =>
    wedding ? 'שבוע החתונה' : offset === 0 ? 'השבוע' : offset === 1 ? 'שבוע הבא' : `בעוד ${offset} שבועות`;

  const visible = weeks.filter((w) => showEmpty || w.offset < 2 || w.isWeddingWeek || w.tasks.length > 0);
  const hidden = weeks.length - visible.length;

  return (
    <div className="flex flex-col gap-4">
      <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <p className="text-sm text-slate-700">
          <b className="tabular-nums">{weeks.length}</b> שבועות עד החתונה · <b className="tabular-nums">{s.tasks.filter((t) => t.done).length}</b> מתוך{' '}
          <b className="tabular-nums">{s.tasks.length}</b> משימות בוצעו
        </p>
        <OwnerFilterBar s={s} value={who} onChange={setWho} />
        {hidden > 0 || showEmpty ? (
          <button onClick={() => setShowEmpty((v) => !v)} className="text-sm font-bold text-emerald-700">
            {showEmpty ? 'להסתיר שבועות ריקים' : `להציג גם ${hidden} שבועות ריקים`}
          </button>
        ) : null}
      </section>

      {overdue.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-4 md:p-5">
          <h2 className="mb-1 font-black text-red-700">באיחור</h2>
          <p className="mb-2 text-xs text-red-700/80">משימות שהתאריך שלהן עבר. סמן שבוצעו, או שנה תאריך כדי להעביר לשבוע אחר.</p>
          {overdue.map((t) => (
            <TaskLine key={t.id} t={t} s={s} update={update} late editable />
          ))}
        </section>
      )}

      <ol className="flex flex-col gap-3">
        {visible.map((w) => {
          const done = w.tasks.filter((t) => t.done).length;
          const current = w.offset === 0;
          return (
            <li
              key={w.start.getTime()}
              className={`rounded-2xl border bg-white p-4 md:p-5 ${current ? 'border-emerald-400 ring-1 ring-emerald-200' : w.isWeddingWeek ? 'border-slate-900' : 'border-gray-200'}`}
            >
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
              {w.tasks.length ? (
                w.tasks.map((t) => <TaskLine key={t.id} t={t} s={s} update={update} editable />)
              ) : (
                <p className="py-1 text-sm text-slate-400">אין משימות לשבוע הזה.</p>
              )}
              <button onClick={() => addTo(w.start, w.end)} className="mt-2 flex items-center gap-1 text-sm font-bold text-emerald-700">
                <Plus className="h-4 w-4" /> משימה לשבוע הזה
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Vendors({ s, update }: { s: WeddingState; update: Update }) {
  const total = s.vendors.reduce((a, v) => a + v.price, 0);
  const paid = s.vendors.reduce((a, v) => a + v.paid, 0);
  const patch = (id: string, p: Partial<WeddingState['vendors'][number]>) =>
    update((st) => ({ ...st, vendors: st.vendors.map((v) => (v.id === id ? { ...v, ...p } : v)) }));

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="סה״כ ספקים" value={formatShekel(total)} sub={`${s.vendors.length} ספקים`} />
        <Kpi label="שולם" value={formatShekel(paid)} sub="מקדמות ותשלומים" />
        <Kpi label="נשאר לשלם" value={formatShekel(total - paid)} sub=" " />
      </section>
      <section className={`${card} overflow-x-auto p-2 md:p-2`}>
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-right text-xs text-slate-500">
              {['קטגוריה', 'ספק', 'מחיר (₪)', 'שולם (₪)', 'יתרה', 'סטטוס', ''].map((h, i) => (
                <th key={i} className="border-b border-gray-200 px-2 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.vendors.map((v) => (
              <tr key={v.id} className="border-b border-gray-100">
                <td className="px-2 py-2">
                  <input aria-label="קטגוריה" className={cellInput} value={v.name} onChange={(e) => patch(v.id, { name: e.target.value })} />
                </td>
                <td className="px-2 py-2">
                  <input aria-label="שם הספק" placeholder="שם הספק" className={cellInput} value={v.supplier} onChange={(e) => patch(v.id, { supplier: e.target.value })} />
                </td>
                <td className="px-2 py-2">
                  <input aria-label="מחיר" type="number" inputMode="numeric" min={0} className={cellInput} value={v.price || ''} onChange={(e) => patch(v.id, { price: Math.max(0, Number(e.target.value) || 0) })} />
                </td>
                <td className="px-2 py-2">
                  <input aria-label="שולם" type="number" inputMode="numeric" min={0} className={cellInput} value={v.paid || ''} onChange={(e) => patch(v.id, { paid: Math.max(0, Number(e.target.value) || 0) })} />
                </td>
                <td className="px-2 py-2 tabular-nums">{formatShekel(v.price - v.paid)}</td>
                <td className="px-2 py-2">
                  <select aria-label="סטטוס" className={cellInput} value={v.status} onChange={(e) => patch(v.id, { status: e.target.value as (typeof VENDOR_STATUSES)[number] })}>
                    {VENDOR_STATUSES.map((st) => (
                      <option key={st}>{st}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <button
                    aria-label={`מחיקת ${v.name}`}
                    onClick={() => update((st) => ({ ...st, vendors: st.vendors.filter((x) => x.id !== v.id) }))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-2 pb-2 pt-3">
          <button
            onClick={() => update((st) => ({ ...st, vendors: [...st.vendors, { id: newId(), name: 'ספק חדש', supplier: '', price: 0, paid: 0, status: 'לברר' }] }))}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" /> ספק
          </button>
        </div>
      </section>
    </div>
  );
}

function Tasks({ s, update }: { s: WeddingState; update: Update }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [who, setWho] = useState<OwnerFilter>('');
  const list = [...s.tasks].filter((t) => matchesOwner(t, who)).sort((a, b) => b.daysBefore - a.daysBefore);
  const done = list.filter((t) => t.done).length;
  const patch = (id: string, p: Partial<WeddingState['tasks'][number]>) =>
    update((st) => ({ ...st, tasks: st.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) }));

  return (
    <div className="flex flex-col gap-4">
      <section className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <p className="text-sm text-slate-700">
          <b className="tabular-nums">{done}</b> מתוך <b className="tabular-nums">{list.length}</b> משימות בוצעו
        </p>
        <button
          onClick={() => update((st) => ({ ...st, tasks: [...st.tasks, { id: newId(), name: 'משימה חדשה', daysBefore: 30, done: false, owner: who && who !== '__none' ? who : '' }] }))}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" /> משימה
        </button>
        <div className="w-full">
          <OwnerFilterBar s={s} value={who} onChange={setWho} />
        </div>
      </section>
      <section className={`${card} overflow-x-auto p-2 md:p-2`}>
        <table className="w-full min-w-[700px] border-collapse text-sm">
          <thead>
            <tr className="text-right text-xs text-slate-500">
              {['', 'משימה', 'מי', 'ימים לפני', 'תאריך יעד', ''].map((h, i) => (
                <th key={i} className="border-b border-gray-200 px-2 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const d = taskDueDate(s.settings.date, t.daysBefore);
              const late = !t.done && d < today;
              return (
                <tr key={t.id} className="border-b border-gray-100">
                  <td className="w-10 px-2 py-2">
                    <input type="checkbox" aria-label={`בוצע: ${t.name}`} className="h-5 w-5 accent-emerald-600" checked={t.done} onChange={(e) => patch(t.id, { done: e.target.checked })} />
                  </td>
                  <td className="px-2 py-2">
                    <input aria-label="משימה" className={`${cellInput} ${t.done ? 'text-slate-400 line-through' : ''}`} value={t.name} onChange={(e) => patch(t.id, { name: e.target.value })} />
                  </td>
                  <td className="w-28 px-2 py-2">
                    <OwnerTag t={t} s={s} update={update} editable />
                  </td>
                  <td className="w-28 px-2 py-2">
                    <input aria-label="ימים לפני החתונה" type="number" min={0} className={cellInput} value={t.daysBefore} onChange={(e) => patch(t.id, { daysBefore: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                  </td>
                  <td className={`whitespace-nowrap px-2 py-2 tabular-nums ${late ? 'font-bold text-red-600' : 'text-slate-700'}`}>
                    {d.getDate()}.{d.getMonth() + 1}.{d.getFullYear()}
                    {late ? ' · באיחור' : ''}
                  </td>
                  <td className="w-12 px-2 py-2">
                    <button
                      aria-label={`מחיקת ${t.name}`}
                      onClick={() => update((st) => ({ ...st, tasks: st.tasks.filter((x) => x.id !== t.id) }))}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-500">תאריכי היעד מחושבים לאחור מתאריך החתונה. כשמשנים את התאריך בהגדרות, כולם זזים איתו.</p>
    </div>
  );
}

function Market({ s, g }: { s: WeddingState; g: number }) {
  const ranked = rankVenues(s.venues, g, s.settings);
  const { min, max } = MARKET.plateCenter;
  const pos = (x: number) => Math.min(100, Math.max(0, ((x - 200) / 400) * 100));
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="מנה באולם במרכז" value={`${min}–${max} ₪`} sub={`גני אירועים ${MARKET.plateGarden.min}–${MARKET.plateGarden.max} ₪`} />
        <Kpi label="חיסכון ביום חול" value={MARKET.weekdaySaving} sub="א׳–ד׳ לעומת סוף שבוע" tone="good" />
        <Kpi label="תוספת ליום חמישי" value={MARKET.thursdaySurcharge} sub="על מחיר המנה" />
        <Kpi label="בר אלכוהול" value={`${MARKET.alcoholPerGuest.min}–${MARKET.alcoholPerGuest.max} ₪`} sub="לאורח" />
      </section>

      <section className={card}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-black text-slate-900">ההצעות שלך מול השוק</h2>
          <span className="text-xs text-slate-500">
            עלות אמיתית לאורח ב-{g} אורחים · הטווח המסומן: {min}–{max} ₪
          </span>
        </div>
        <div className="relative my-4 h-2.5 rounded-full bg-gray-100" aria-hidden="true">
          <span className="absolute inset-y-0 rounded-full bg-emerald-100" style={{ right: `${pos(min)}%`, left: `${100 - pos(max)}%` }} />
          {ranked.map((r, i) => (
            <span key={r.venue.id} title={r.venue.name} className={`absolute -top-1 h-[18px] w-1 rounded ${i === 0 ? 'bg-emerald-600' : 'bg-slate-900'}`} style={{ right: `calc(${pos(r.cost.perGuest).toFixed(1)}% - 2px)` }} />
          ))}
        </div>
        <div className="flex justify-between text-xs tabular-nums text-slate-500">
          <span>200 ₪</span>
          <span>400 ₪</span>
          <span>600 ₪</span>
        </div>
        <div className="mt-3">
          {ranked.length ? (
            ranked.map((r) => (
              <div key={r.venue.id} className="flex justify-between gap-2 border-b border-gray-100 py-2 text-sm">
                <span className="text-slate-700">{r.venue.name}</span>
                <span className="tabular-nums text-slate-900">
                  {formatShekel(r.cost.perGuest)} לאורח{r.cost.perGuest > max ? ' · מעל הטווח' : ''}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">הזן הצעות כדי לראות אותן כאן.</p>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="mb-2 font-black text-slate-900">ספקים – טווחי מחיר</h2>
          {MARKET.vendors.map((v) => (
            <div key={v.name} className="flex justify-between gap-2 border-b border-gray-100 py-2 text-sm">
              <span className="text-slate-700">{v.name}</span>
              <span className="tabular-nums text-slate-900">
                {v.min.toLocaleString('en-US')}–{v.max.toLocaleString('en-US')} ₪
              </span>
            </div>
          ))}
        </div>
        <div className={`${card} space-y-2 text-sm leading-relaxed text-slate-700`}>
          <h2 className="font-black text-slate-900">מה זה אומר על התאריך</h2>
          <p>
            <b>יום חול הוא קלף המיקוח הכי חזק.</b> תזכיר אותו בכל פגישה כסיבה להנחה.
          </p>
          <p>
            <b>במרץ המקורות חלוקים.</b> חלקם עדיין רואים בו חורף וחלקם כבר תחילת העונה. תחילת החודש, לפני פורים ופסח, בדרך כלל זולה יותר.
          </p>
          <p>
            <b>כניסת DJ חיצוני:</b> לא מצאנו מחיר מקובל. תבקש את הסכום בכתב בכל אולם.
          </p>
        </div>
      </section>

      <section className={`${card} text-sm`}>
        <p className="mb-2 font-bold text-slate-900">מקורות (אוקטובר 2026)</p>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {MARKET.sources.map((src) => (
            <a key={src.url} href={src.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline-offset-2 hover:underline">
              {src.label}
            </a>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">אלה טווחים מאתרי תוכן. את המחיר האמיתי מקבלים רק בהצעה כתובה.</p>
      </section>
    </div>
  );
}

function Settings({ s, update }: { s: WeddingState; update: Update }) {
  const set = (k: keyof WeddingSettings, v: string | number) => update((st) => ({ ...st, settings: { ...st.settings, [k]: v } }));
  const num = (k: Exclude<keyof WeddingSettings, 'date' | 'people'>, label: string, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`ws-${k}`} className="text-xs font-bold text-slate-600">
        {label}
      </label>
      <input
        id={`ws-${k}`}
        type="number"
        inputMode="numeric"
        min={0}
        className={`${cellInput} min-h-[42px]`}
        value={s.settings[k] || ''}
        onChange={(e) => set(k, Math.max(0, Number(e.target.value) || 0))}
      />
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <section className={card}>
        <h2 className="mb-3 font-black text-slate-900">האירוע</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ws-date" className="text-xs font-bold text-slate-600">
              תאריך החתונה
            </label>
            <input id="ws-date" type="date" className={`${cellInput} min-h-[42px]`} value={s.settings.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
          </div>
          {num('guests', 'מספר אורחים צפוי')}
          {num('low', 'תרחיש נמוך')}
          {num('high', 'תרחיש גבוה')}
          {num('budget', 'תקציב כולל (₪)', 'משמש להשוואה במסך הסקירה')}
          {num('vat', 'מע״מ (%)')}
        </div>
      </section>
      <section className={card}>
        <h2 className="mb-3 font-black text-slate-900">עלות השלמה כשמשהו לא כלול באולם</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {num('design', 'עיצוב (₪)')}
          {num('chuppah', 'חופה (₪)')}
          {num('light', 'תאורה והגברה (₪)')}
          {num('bar', 'בר – לאורח (₪)')}
        </div>
        <p className="mt-3 text-xs text-slate-500">אלה הערכות ראשוניות. כדאי לעדכן אותן כשמגיעות הצעות אמיתיות מספקים.</p>
      </section>
      <PeopleSettings s={s} update={update} />
      <p className="text-xs text-slate-500">כל שינוי נשמר אוטומטית.</p>
    </div>
  );
}

/**
 * Names tasks can be tagged with. Renaming a person retags their tasks;
 * removing one leaves their tasks tagged with the old name (still shown,
 * filterable as-is) rather than silently unassigning them.
 */
function PeopleSettings({ s, update }: { s: WeddingState; update: Update }) {
  const people = s.settings.people;
  const rename = (i: number, name: string) =>
    update((st) => {
      const old = st.settings.people[i];
      if (!name || name === old || name === TOGETHER || st.settings.people.includes(name)) return st;
      return {
        ...st,
        settings: { ...st.settings, people: st.settings.people.map((p, j) => (j === i ? name : p)) },
        tasks: st.tasks.map((t) => (t.owner === old ? { ...t, owner: name } : t)),
      };
    });
  return (
    <section className={card}>
      <h2 className="mb-1 font-black text-slate-900">מי עושה את המשימות</h2>
      <p className="mb-3 text-xs text-slate-500">השמות שאפשר לתייג בהם משימות. בנוסף תמיד יש &quot;{TOGETHER}&quot;.</p>
      <div className="flex flex-col gap-2">
        {people.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`h-3 w-3 shrink-0 rounded-full border ${pillClass(p || ' ', people)}`} aria-hidden="true" />
            <PersonName key={p} index={i} name={p} onRename={rename} />
            <button
              aria-label={`הסרת ${p}`}
              onClick={() => update((st) => ({ ...st, settings: { ...st.settings, people: st.settings.people.filter((_, j) => j !== i) } }))}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {people.length < 6 && (
        <button
          onClick={() => update((st) => ({ ...st, settings: { ...st.settings, people: [...st.settings.people, `אדם ${st.settings.people.length + 1}`] } }))}
          className="mt-3 flex items-center gap-1 text-sm font-bold text-emerald-700"
        >
          <Plus className="h-4 w-4" /> שם נוסף
        </button>
      )}
    </section>
  );
}

/** Edits a name locally and applies the rename on blur/Enter, so typing never orphans tagged tasks. */
function PersonName({ index, name, onRename }: { index: number; name: string; onRename: (i: number, name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const commit = () => {
    const v = draft.trim();
    if (v && v !== name) onRename(index, v);
    else setDraft(name);
  };
  return (
    <input
      aria-label={`שם ${index + 1}`}
      className={`${cellInput} min-h-[42px] max-w-xs`}
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
