'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, Trash2 } from 'lucide-react';
import { MARKET } from '../wedding.config';
import { dayTypeOf, venuePriceFor, type DayType, type ScenarioPrice, buildRoadmap, daysUntil, formatShekel, hebrewDateLabel, rankVenues, taskDueDate, tasksOverlapping, toIso, venueCost } from '../wedding.calc';
import { VENDOR_STATUSES, type Venue, type WeddingSettings, type WeddingState } from '../wedding.types';
import { OwnerPicker, TagEditor } from './tags';
import { autoTask, bookingLead, closeWindow, taskOrder } from '../wedding.links';
import { TaskLine, TasksHub } from './TasksHub';
import { SELECTED_STYLE, card, cellInput, fmtDate, fmtIso, newId, type Update } from './ui';
import { VENUE_CATALOG } from '../data/venueCatalog';
import { DateCompare } from './DateCompare';
import { VenueCatalog } from './VenueCatalog';
import { VenueEditor } from './VenueEditor';
import { useWeddingStore, type SaveStatus } from './useWeddingStore';

type Tab = 'home' | 'tasks' | 'venues' | 'catalog' | 'vendors' | 'market' | 'settings';
const TABS: Array<[Tab, string]> = [
  ['home', 'סקירה'],
  ['tasks', 'משימות ולוח שנה'],
  ['venues', 'השוואת אולמות'],
  ['catalog', 'מקומות מוצעים'],
  ['vendors', 'ספקים'],
  ['market', 'מחירי שוק ותאריכים'],
  ['settings', 'הגדרות'],
];
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];



/** Market midpoint for a vendor category, matched by name ('' match = no estimate, e.g. our own DJ). 0 = none. */
function vendorEstimate(name: string): number {
  const m = MARKET.vendors.find((x) => x.match && name.includes(x.match));
  return m ? Math.round((m.min + m.max) / 2 / 250) * 250 : 0;
}

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

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
    catalogId: '',
    priceIsEstimate: false,
    offers: [],
  };
}

export function WeddingPlanner() {
  const store = useWeddingStore();
  // One-time fill for venues added from the catalog before estimates existed: copy the reported price in.
  const backfilled = useRef(false);
  useEffect(() => {
    if (backfilled.current || !store.state) return;
    backfilled.current = true;
    const reported = new Map(VENUE_CATALOG.filter((c) => c.reportedPrice).map((c) => [c.id, c.reportedPrice as number]));
    const needs = store.state.venues.some((v) => v.catalogId && v.price === 0 && reported.has(v.catalogId));
    const vendorNeeds = store.state.vendors.some((v) => v.price === 0 && vendorEstimate(v.name));
    if (!needs && !vendorNeeds) return;
    store.update((st) => ({
      ...st,
      vendors: st.vendors.map((v) => {
        const est = v.price === 0 ? vendorEstimate(v.name) : 0;
        return est ? { ...v, price: est, priceIsEstimate: true } : v;
      }),
      venues: st.venues.map((v) =>
        v.catalogId && v.price === 0 && reported.has(v.catalogId)
          ? { ...v, price: reported.get(v.catalogId) as number, vatIncluded: true, priceIsEstimate: true }
          : v,
      ),
    }));
  }, [store]);
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
              חתונה · {fmtIso(s.settings.date)} · {hebrewDateLabel(new Date(`${s.settings.date}T00:00:00`))} · יום {weekday}
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
        {tab === 'venues' && <Venues s={s} g={g} setGuests={setGuests} onNew={openNew} onEdit={openEdit} />}
        {tab === 'catalog' && <VenueCatalog s={s} update={store.update} goCompare={() => setTab('venues')} />}
        {tab === 'vendors' && <Vendors s={s} update={store.update} />}
        {tab === 'tasks' && <TasksHub s={s} update={store.update} />}
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
  const overdueIds = new Set(overdue.map((t) => t.id));
  const thisWeek = weeks[0]
    ? tasksOverlapping(s.settings.date, s.tasks, weeks[0].start, weeks[0].end)
        .filter((t) => !overdueIds.has(t.id))
        .sort((a, b) => b.daysBefore - a.daysBefore)
    : [];
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
          {weeks[0] && <p className="mb-2 text-xs text-slate-500">{`${fmtDate(weeks[0].start)}–${fmtDate(weeks[0].end)}`}</p>}
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
          <button onClick={() => go('tasks')} className="mt-3 text-sm font-bold text-emerald-700">
            ללוח השנה ולמשימות
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
  const wedding = new Date(`${s.settings.date}T12:00:00`);
  const [view, setView] = useState<'table' | 'months'>('table');
  const [ym, setYm] = useState<[number, number]>([wedding.getFullYear(), wedding.getMonth()]);
  const [dt, setDt] = useState<DayType>(dayTypeOf(wedding) ?? 'weekday');
  const months = useMemo(() => {
    const now = new Date();
    const list = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1)).map((d) => [d.getFullYear(), d.getMonth()] as [number, number]);
    const w: [number, number] = [wedding.getFullYear(), wedding.getMonth()];
    if (!list.some(([y, m]) => y === w[0] && m === w[1])) list.push(w);
    return list;
  }, [wedding.getFullYear(), wedding.getMonth()]); // eslint-disable-line react-hooks/exhaustive-deps
  const isWeddingScenario = ym[0] === wedding.getFullYear() && ym[1] === wedding.getMonth() && dt === (dayTypeOf(wedding) ?? 'weekday');

  // Every venue priced for the scenario: a quote for that month/day if there is one, else projected.
  const scen = new Map<string, ScenarioPrice | null>(s.venues.map((v) => [v.id, venuePriceFor(v, ym[0], ym[1], dt)]));
  const atScenario = (v: Venue): Venue => ({ ...v, price: scen.get(v.id)?.price ?? 0 });
  const ranked = rankVenues(s.venues.map(atScenario), g, s.settings);
  const rankedIds = new Set(ranked.map((r) => r.venue.id));
  const out = s.venues.filter((v) => !rankedIds.has(v.id));
  const options = useMemo(
    () => [s.settings.low, s.settings.guests, s.settings.high].filter((x, i, a) => x > 0 && a.indexOf(x) === i),
    [s.settings.low, s.settings.guests, s.settings.high],
  );
  const original = new Map(s.venues.map((v) => [v.id, v]));
  const rows: Array<{ venue: Venue; rank: number }> = [
    ...ranked.map((r, i) => ({ venue: original.get(r.venue.id) as Venue, rank: i + 1 })),
    ...out.map((venue) => ({ venue, rank: 0 })),
  ];
  const seg = (on: boolean) => `min-h-[36px] rounded-lg px-3 text-sm font-bold ${on ? 'bg-slate-900 text-white' : 'text-slate-600'}`;

  return (
    <div className="flex flex-col gap-4">
      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label="תצוגה">
            {(
              [
                ['table', 'השוואה לתרחיש'],
                ['months', 'לפי חודשים'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} aria-pressed={view === k} onClick={() => setView(k)} className={seg(view === k)} style={view === k ? SELECTED_STYLE : undefined}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={onNew} className="flex min-h-[42px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> הצעה חדשה
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">אורחים</span>
            <div className="flex gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label="מספר אורחים">
              {options.map((o) => (
                <button key={o} aria-pressed={o === g} onClick={() => setGuests(o)} className={seg(o === g)} style={o === g ? SELECTED_STYLE : undefined}>
                  {o}
                </button>
              ))}
            </div>
            <input
              aria-label="מספר אורחים מדויק"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="מספר אחר"
              className={cellInput}
              style={{ width: '7.5rem' }}
              value={options.includes(g) ? '' : g}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (n > 0) setGuests(Math.min(n, 5000));
              }}
            />
          </div>
          {view === 'table' && (
            <label className="flex items-center gap-2 text-sm text-slate-500">
              חודש
              <select
                className={`${cellInput} w-auto`}
                value={`${ym[0]}-${ym[1]}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split('-').map(Number);
                  setYm([y, m]);
                }}
              >
                {months.map(([y, m]) => (
                  <option key={`${y}-${m}`} value={`${y}-${m}`}>
                    {MONTHS_HE[m]} {y}
                    {y === wedding.getFullYear() && m === wedding.getMonth() ? ' (התאריך שלכם)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">יום</span>
            <div className="flex gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label="יום בשבוע">
              {(
                [
                  ['weekday', 'א׳–ד׳'],
                  ['thursday', 'חמישי'],
                ] as const
              ).map(([k, label]) => (
                <button key={k} aria-pressed={dt === k} onClick={() => setDt(k)} className={seg(dt === k)} style={dt === k ? SELECTED_STYLE : undefined}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          הבסיס הוא ההערכה שלנו: מחיר שהוזן לתאריך אחד מחושב לחודשים ולימים אחרים לפי מקדמי השוק (חמישי +11%, עונה אפריל–אוקטובר +25%, מרץ +12%). הצעה אמיתית לתאריך מסוים (בעריכת האולם → &quot;מחירים לתאריכים נוספים&quot;) גוברת על ההערכה.
          {!isWeddingScenario && <b className="text-slate-700"> מוצג תרחיש שאינו התאריך שלכם.</b>}
        </p>
      </section>

      {view === 'months' && rows.length > 0 && <MonthsMatrix s={s} g={g} dt={dt} months={months} onEdit={onEdit} />}

      {view === 'months' ? null : rows.length === 0 ? (
        <div className={`${card} py-10 text-center text-sm text-slate-500`}>
          עוד אין הצעות. לחץ על &quot;הצעה חדשה&quot; והזן מחיר למנה, מינימום ומה כלול בחבילה.
        </div>
      ) : (
        <section className={`${card} overflow-x-auto p-2 md:p-2`}>
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="text-right text-xs text-slate-500">
                {['דירוג', 'אולם', 'סטטוס', 'מחיר למנה', 'מנה אמיתית', 'מינימום', 'מה כלול', 'כניסת DJ', 'עלות כוללת', 'לאורח'].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-gray-200 px-2 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ venue: v, rank }) => {
                const sp = scen.get(v.id) ?? null;
                const c = venueCost(atScenario(v), g, s.settings);
                const priced = !!sp;
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
                      {sp ? formatShekel(sp.price) : '—'}
                      {sp && <SourceChip sp={sp} />}
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

      {view === 'table' && ranked.length > 0 && (
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

function SourceChip({ sp }: { sp: ScenarioPrice }) {
  const quote = sp.source === 'quote';
  return (
    <>
      <span className={`mr-1.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-bold ${quote ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{quote ? 'מהצעה' : 'הערכה'}</span>
      {sp.source === 'derived' && <p className="text-[11px] text-slate-400">מחושב מ-{fmtIso(sp.fromDate)}</p>}
    </>
  );
}

/** Rows = venues, columns = months, for one day type. Cell = total (per guest below); real quotes marked; cheapest per month green. */
function MonthsMatrix({ s, g, dt, months, onEdit }: { s: WeddingState; g: number; dt: DayType; months: Array<[number, number]>; onEdit: (v: Venue) => void }) {
  const venues = s.venues.filter((v) => v.status !== 'נפסל' && venuePriceFor(v, months[0][0], months[0][1], dt));
  const grid = venues.map((v) =>
    months.map(([y, m]) => {
      const sp = venuePriceFor(v, y, m, dt) as ScenarioPrice;
      return { sp, cost: venueCost({ ...v, price: sp.price }, g, s.settings) };
    }),
  );
  const best = months.map((_, j) => Math.min(...grid.map((row) => row[j].cost.total)));
  const wd = new Date(`${s.settings.date}T12:00:00`);
  if (!venues.length) return <div className={`${card} py-10 text-center text-sm text-slate-500`}>אין עדיין אולמות עם מחיר.</div>;
  return (
    <section className={`${card} overflow-x-auto p-2 md:p-2`}>
      <table className="w-full min-w-[1240px] border-collapse text-sm">
        <thead>
          <tr className="text-right text-xs text-slate-500">
            <th className="sticky right-0 border-b border-gray-200 bg-white px-2 py-2.5 font-medium">אולם</th>
            {months.map(([y, m]) => (
              <th key={`${y}-${m}`} className={`whitespace-nowrap border-b border-gray-200 px-2 py-2.5 font-medium ${y === wd.getFullYear() && m === wd.getMonth() ? 'text-emerald-700' : ''}`}>
                {MONTHS_HE[m]} {String(y).slice(2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {venues.map((v, i) => (
            <tr key={v.id} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50" onClick={() => onEdit(v)}>
              <td className="sticky right-0 bg-white px-2 py-2.5">
                <p className="whitespace-nowrap font-bold text-slate-900">{v.name}</p>
                <p className="text-xs text-slate-500">{v.city}</p>
              </td>
              {grid[i].map(({ sp, cost }, j) => (
                <td key={j} className={`whitespace-nowrap px-2 py-2.5 align-top tabular-nums ${cost.total === best[j] && venues.length > 1 ? 'bg-emerald-50' : ''}`}>
                  <div className={`font-bold ${cost.total === best[j] && venues.length > 1 ? 'text-emerald-800' : 'text-slate-900'}`}>{formatShekel(cost.total)}</div>
                  <div className="text-xs text-slate-500">{formatShekel(cost.perGuest)} לאורח</div>
                  {sp.source === 'quote' && <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-800">מהצעה</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-2 pt-2 text-xs text-slate-500">
        עלות כוללת ל-{g} אורחים ב{dt === 'thursday' ? 'יום חמישי' : 'ימים א׳–ד׳'}, כולל מע״מ והשלמות. ירוק = הזול בחודש. &quot;מהצעה&quot; = מחיר אמיתי שהוזן לחודש הזה; כל השאר הערכה.
      </p>
    </section>
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

function Vendors({ s, update }: { s: WeddingState; update: Update }) {
  const total = s.vendors.reduce((a, v) => a + v.price, 0);
  const paid = s.vendors.reduce((a, v) => a + v.paid, 0);
  const estimated = s.vendors.reduce((a, v) => a + (v.priceIsEstimate ? v.price : 0), 0);
  const order = taskOrder(s.tasks);
  const linked = (id: string) => s.tasks.find((t) => t.vendorId === id);
  const setOwners = (v: WeddingState['vendors'][number], owners: string[]) =>
    update((st) => {
      const has = st.tasks.some((t) => t.vendorId === v.id);
      const tasks = has ? st.tasks : [...st.tasks, autoTask(v, st.settings.date, newId())];
      return { ...st, tasks: tasks.map((t) => (t.vendorId === v.id ? { ...t, owners } : t)) };
    });
  const addTask = (v: WeddingState['vendors'][number]) => update((st) => ({ ...st, tasks: [...st.tasks, autoTask(v, st.settings.date, newId())] }));
  const sorted = [...s.vendors].sort((a, b) => (order.get(linked(a.id)?.id ?? '') ?? 999) - (order.get(linked(b.id)?.id ?? '') ?? 999));
  const patch = (id: string, p: Partial<WeddingState['vendors'][number]>) =>
    update((st) => ({ ...st, vendors: st.vendors.map((v) => (v.id === id ? { ...v, ...p } : v)) }));

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label="סה״כ ספקים"
          value={formatShekel(total)}
          sub={estimated ? `מתוכם ${formatShekel(estimated)} הערכה` : `${s.vendors.length} ספקים`}
        />
        <Kpi label="שולם" value={formatShekel(paid)} sub="מקדמות ותשלומים" />
        <Kpi label="נשאר לשלם" value={formatShekel(total - paid)} sub=" " />
      </section>
      <section className={`${card} overflow-x-auto p-2 md:p-2`}>
        <table className="w-full min-w-[1240px] border-collapse text-sm">
          <thead>
            <tr className="text-right text-xs text-slate-500">
              {['#', 'קטגוריה', 'ספק', 'מי סוגר', 'לסגור עד', 'מחיר (₪)', 'שולם (₪)', 'יתרה', 'סטטוס', ''].map((h, i) => (
                <th key={i} className="border-b border-gray-200 px-2 py-2.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((v) => {
              const t = linked(v.id);
              const lead = bookingLead(v.name);
              const late = closeWindow(v.name, s.settings.date).late;
              const due = t ? taskDueDate(s.settings.date, t.daysBefore) : null;
              const overdue = !!due && !t?.done && toIso(due) < toIso(new Date());
              return (
              <tr key={v.id} className="border-b border-gray-100 align-top">
                <td className="px-2 py-3 text-xs font-bold tabular-nums text-slate-400">{t ? `#${order.get(t.id)}` : ''}</td>
                <td className="px-2 py-2">
                  <input aria-label="קטגוריה" className={cellInput} value={v.name} onChange={(e) => patch(v.id, { name: e.target.value })} />
                </td>
                <td className="px-2 py-2">
                  <input aria-label="שם הספק" placeholder="שם הספק" className={cellInput} value={v.supplier} onChange={(e) => patch(v.id, { supplier: e.target.value })} />
                </td>
                <td className="px-2 py-2">
                  <div className="w-[150px]">
                    <OwnerPicker compact s={s} value={t?.owners ?? []} onChange={(o) => setOwners(v, o)} />
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-xs">
                  {t ? (
                    <>
                      <p className={`font-bold tabular-nums ${t.done ? 'text-emerald-700' : overdue ? 'text-red-600' : 'text-slate-800'}`}>
                        {t.done ? 'נסגר ✓' : fmtDate(due as Date)}
                        {overdue ? ' · באיחור' : ''}
                      </p>
                      <p className="text-slate-500">מומלץ: {lead.label} לפני</p>
                      {late && !t.done && <p className="font-bold text-orange-700">כבר עברנו את המומלץ – בהקדם</p>}
                    </>
                  ) : (
                    <button onClick={() => addTask(v)} className="rounded-lg border border-dashed border-gray-300 px-2 py-1 font-bold text-slate-600 hover:bg-gray-50">
                      + משימה בלוח
                    </button>
                  )}
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label="מחיר"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className={`${cellInput} ${v.priceIsEstimate ? 'border-amber-300 bg-amber-50/50' : ''}`}
                    value={v.price || ''}
                    onChange={(e) => patch(v.id, { price: Math.max(0, Number(e.target.value) || 0), priceIsEstimate: false })}
                  />
                  {v.priceIsEstimate && <p className="mt-0.5 text-[11px] font-bold text-amber-800">הערכת שוק · הזינו מחיר אמיתי</p>}
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
              );
            })}
          </tbody>
        </table>
        <div className="px-2 pb-2 pt-3">
          <button
            onClick={() => update((st) => ({ ...st, vendors: [...st.vendors, { id: newId(), name: 'ספק חדש', supplier: '', price: 0, paid: 0, status: 'לברר', priceIsEstimate: false }] }))}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" /> ספק
          </button>
        </div>
      </section>
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

      <DateCompare s={s} />

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
  const num = (k: Exclude<keyof WeddingSettings, 'date' | 'people' | 'tagColors'>, label: string, hint?: string) => (
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
      <section className={card}>
        <h2 className="mb-3 font-black text-slate-900">תגיות – מי עושה</h2>
        <TagEditor s={s} update={update} />
      </section>
      <p className="text-xs text-slate-500">כל שינוי נשמר אוטומטית.</p>
    </div>
  );
}
