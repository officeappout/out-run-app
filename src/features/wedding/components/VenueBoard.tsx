'use client';

import { useState } from 'react';
import { formatShekel } from '../wedding.calc';
import { VENUE_STATUSES, type Venue, type VenueStatus, type WeddingState } from '../wedding.types';
import { card, type Update } from './ui';

/**
 * Overview board: one column per venue status, a card per venue. Click a card
 * to edit it; on desktop, drag a card to another column to change its status.
 * 'נפסל' is folded into a footer line so the board stays about live options.
 */

const BOARD: VenueStatus[] = VENUE_STATUSES.filter((s) => s !== 'נפסל');

export function VenueBoard({ s, update, onEdit, onAll }: { s: WeddingState; update: Update; onEdit: (v: Venue) => void; onAll: () => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<VenueStatus | null>(null);
  const [showOut, setShowOut] = useState(false);
  const out = s.venues.filter((v) => v.status === 'נפסל');
  const move = (id: string, status: VenueStatus) => update((st) => ({ ...st, venues: st.venues.map((v) => (v.id === id ? { ...v, status } : v)) }));

  const cardFor = (v: Venue) => (
    <button
      key={v.id}
      draggable
      onDragStart={(e) => {
        setDragId(v.id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', v.id);
      }}
      onDragEnd={() => {
        setDragId(null);
        setOver(null);
      }}
      onClick={() => onEdit(v)}
      className={`flex w-full flex-col items-start gap-0.5 rounded-lg border bg-white px-3 py-2 text-right shadow-sm hover:border-emerald-400 ${
        v.status === 'נבחר' ? 'border-emerald-400' : 'border-gray-200'
      } ${dragId === v.id ? 'opacity-40' : ''}`}
    >
      <span className="w-full truncate text-sm font-bold text-slate-900">{v.name}</span>
      <span className="w-full truncate text-xs text-slate-500">
        {[v.city, v.price ? `${formatShekel(v.price)} למנה${v.priceIsEstimate ? ' (הערכה)' : ''}` : 'אין מחיר'].filter(Boolean).join(' · ')}
      </span>
    </button>
  );

  return (
    <section className={card}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-black text-slate-900">סטטוס אולמות</h2>
        <button onClick={onAll} className="text-sm font-bold text-emerald-700">
          להשוואת האולמות
        </button>
      </div>
      {s.venues.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">עוד אין אולמות. מוסיפים מ&quot;מקומות מוצעים&quot; או עם &quot;הצעה חדשה&quot;.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="grid min-w-[760px] grid-cols-5 gap-2">
            {BOARD.map((st) => {
              const list = s.venues.filter((v) => v.status === st);
              return (
                <div
                  key={st}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(st);
                  }}
                  onDragLeave={() => setOver((o) => (o === st ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain') || dragId;
                    if (id) move(id, st);
                    setDragId(null);
                    setOver(null);
                  }}
                  className={`flex min-h-[120px] flex-col gap-1.5 rounded-xl p-2 ${
                    over === st ? 'bg-emerald-50 ring-2 ring-emerald-300' : st === 'נבחר' ? 'bg-emerald-50/60' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between px-1 pb-0.5">
                    <span className={`text-sm font-black ${st === 'נבחר' ? 'text-emerald-800' : 'text-slate-800'}`}>{st}</span>
                    <span className="text-xs tabular-nums text-slate-500">{list.length}</span>
                  </div>
                  {list.map(cardFor)}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {out.length > 0 && (
        <div className="mt-2 text-xs text-slate-500">
          <button onClick={() => setShowOut((x) => !x)} className="font-bold text-slate-600">
            {showOut ? 'להסתיר' : `נפסלו: ${out.length}`}
          </button>
          {showOut && <div className="mt-1.5 grid grid-cols-2 gap-1.5 md:grid-cols-5">{out.map(cardFor)}</div>}
        </div>
      )}
      <p className="mt-2 hidden text-xs text-slate-400 md:block">גוררים כרטיס לעמודה אחרת כדי לשנות סטטוס, או לוחצים עליו לעריכה.</p>
    </section>
  );
}
