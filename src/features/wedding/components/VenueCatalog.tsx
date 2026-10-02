'use client';

import { useMemo, useState } from 'react';
import { Check, ExternalLink, Plus, Search, Star } from 'lucide-react';
import { CATALOG_AREAS, CATALOG_UPDATED, VENUE_CATALOG, type CatalogVenue } from '../data/venueCatalog';
import type { Venue, WeddingState } from '../wedding.types';
import { SELECTED_STYLE, card, cellInput, fmtIso, newId, type Update } from './ui';

/**
 * Suggested venues: the researched list of central-Israel venues, filterable,
 * with one tap to copy a venue into the comparison (as 'לברר', no price yet)
 * or hide it as not relevant. Hidden ids and added venues are saved with the
 * rest of the planner.
 */

type Sort = 'rating' | 'price' | 'name';

function toVenue(c: CatalogVenue, weddingIso: string): Venue {
  const facts = [c.type, c.area, c.capacity && `קיבולת ${c.capacity}`, c.reportedPrice && `מחיר מדווח ~${c.reportedPrice} ₪ למנה`].filter(Boolean).join(' · ');
  return {
    id: newId(),
    name: c.name,
    city: c.city,
    contact: c.phone,
    date: weddingIso,
    status: 'לברר',
    price: 0,
    vatIncluded: false,
    minGuests: 0,
    alcohol: 0,
    incl: { design: false, chuppah: false, light: false, bar: false },
    djFee: 0,
    extras: 0,
    discount: 0,
    notes: `${facts}\n${c.url}`,
    catalogId: c.id,
  };
}

function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-0.5 rounded-xl bg-gray-100 p-1" role="group" aria-label={label}>
        {options.map(([v, l]) => (
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

export function VenueCatalog({ s, update, goCompare }: { s: WeddingState; update: Update; goCompare: () => void }) {
  const [area, setArea] = useState<string>('');
  const [type, setType] = useState<'' | 'אולם' | 'גן'>('');
  const [onlyPriced, setOnlyPriced] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<Sort>('rating');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const hidden = useMemo(() => new Set(s.catalogHidden), [s.catalogHidden]);
  const added = useMemo(() => new Set(s.venues.map((v) => v.catalogId).filter(Boolean)), [s.venues]);

  const list = VENUE_CATALOG.filter((c) => {
    if (area && c.area !== area) return false;
    if (type && !c.type.includes(type)) return false;
    if (onlyPriced && !c.reportedPrice) return false;
    if (!showHidden && hidden.has(c.id)) return false;
    const needle = q.trim();
    if (needle && !`${c.name} ${c.city}`.includes(needle)) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'he');
    if (sort === 'price') return (a.reportedPrice ?? 1e9) - (b.reportedPrice ?? 1e9);
    return (b.rating ?? 0) - (a.rating ?? 0) || (b.reviews ?? 0) - (a.reviews ?? 0);
  });

  const add = (c: CatalogVenue) => {
    update((st) => ({ ...st, venues: [...st.venues, toVenue(c, st.settings.date)] }));
    setNotice(`${c.name} נוסף להשוואת האולמות. כשתקבלו הצעה, פותחים אותו שם ומזינים מחיר.`);
  };
  const setHidden = (id: string, hide: boolean) =>
    update((st) => ({ ...st, catalogHidden: hide ? [...st.catalogHidden.filter((x) => x !== id), id] : st.catalogHidden.filter((x) => x !== id) }));

  return (
    <div className="flex flex-col gap-4">
      <section className={`${card} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-black text-slate-900">מקומות מוצעים במרכז</h2>
          <span className="text-xs text-slate-500">
            {VENUE_CATALOG.length} מקומות ל-200–300 אורחים · נאספו ב-{fmtIso(CATALOG_UPDATED)} מ-mit4mit, וואלה ו&quot;מקומות אירועים&quot;
          </span>
        </div>
        <Chips label="אזור" value={area} onChange={setArea} options={[['', 'הכל'], ...CATALOG_AREAS.map((a): [string, string] => [a, a])]} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Chips<'' | 'אולם' | 'גן'> label="סוג" value={type} onChange={setType} options={[['', 'הכל'], ['אולם', 'אולם'], ['גן', 'גן']]} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={onlyPriced} onChange={(e) => setOnlyPriced(e.target.checked)} />
            רק עם מחיר מדווח
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            מיון
            <select className={`${cellInput} w-auto min-w-0`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="rating">דירוג</option>
              <option value="price">מחיר מדווח</option>
              <option value="name">שם</option>
            </select>
          </label>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input aria-label="חיפוש מקום או עיר" placeholder="חיפוש מקום או עיר" className={`${cellInput} min-h-[40px] pr-8`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>
            מוצגים <b className="tabular-nums text-slate-800">{list.length}</b> · <b className="tabular-nums text-slate-800">{added.size}</b> כבר בהשוואה
          </span>
          {s.catalogHidden.length > 0 && (
            <button onClick={() => setShowHidden((v) => !v)} className="font-bold text-emerald-700">
              {showHidden ? 'להסתיר את הלא רלוונטיים' : `להציג גם ${s.catalogHidden.length} שסומנו לא רלוונטיים`}
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <span>{notice}</span>
            <button onClick={goCompare} className="font-bold underline-offset-2 hover:underline">
              להשוואת האולמות
            </button>
          </p>
        )}
      </section>

      {list.length === 0 ? (
        <div className={`${card} py-10 text-center text-sm text-slate-500`}>אין מקומות שמתאימים לסינון.</div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const isAdded = added.has(c.id);
            const isHidden = hidden.has(c.id);
            return (
              <li key={c.id} className={`${card} flex flex-col gap-2 ${isHidden ? 'opacity-50' : ''} ${isAdded ? 'border-emerald-300' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-black leading-tight text-slate-900">{c.name}</h3>
                    <p className="text-xs text-slate-500">
                      {[c.city, c.area].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-slate-600">{c.type}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                  {c.rating !== undefined && (
                    <span className="flex items-center gap-1 tabular-nums">
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      {c.rating}
                      {c.reviews !== undefined && <span className="text-xs text-slate-500">({c.reviews.toLocaleString('en-US')} ביקורות)</span>}
                    </span>
                  )}
                  {c.capacity && <span>קיבולת {c.capacity}</span>}
                </div>
                {c.reportedPrice ? (
                  <p className="text-sm">
                    <b className="tabular-nums text-slate-900">~{c.reportedPrice} ₪</b> <span className="text-slate-500">למנה, מדווח</span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-400">אין מחיר מדווח</p>
                )}
                {c.note && <p className="text-xs text-amber-800">{c.note}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {isAdded ? (
                    <button onClick={goCompare} className="flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-50 px-3 text-sm font-bold text-emerald-800">
                      <Check className="h-4 w-4" /> בהשוואה
                    </button>
                  ) : (
                    <button onClick={() => add(c)} className="flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700">
                      <Plus className="h-4 w-4" /> הוספה להשוואה
                    </button>
                  )}
                  {!isAdded && (
                    <button onClick={() => setHidden(c.id, !isHidden)} className="min-h-[38px] rounded-xl border border-gray-200 px-3 text-sm font-bold text-slate-600 hover:bg-gray-50">
                      {isHidden ? 'להחזיר' : 'לא רלוונטי'}
                    </button>
                  )}
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[38px] items-center gap-1 px-1 text-sm font-bold text-emerald-700 hover:underline">
                    לפרטים <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  {c.phone && <span className="text-xs tabular-nums text-slate-500" dir="ltr">{c.phone}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        המחיר המדווח הוא ממוצע שזוגות דיווחו ב-mit4mit, לא הצעה. מספרי 072 ו-052-9 הם קווי מעקב של אתר &quot;מקומות אירועים&quot; ומעבירים למקום.
      </p>
    </div>
  );
}
