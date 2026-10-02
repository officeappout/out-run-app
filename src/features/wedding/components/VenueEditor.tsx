'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MARKET } from '../wedding.config';
import { formatShekel, venueCost } from '../wedding.calc';
import { VENUE_STATUSES, type Venue, type VenueIncludes, type WeddingSettings } from '../wedding.types';

interface Props {
  venue: Venue;
  isNew: boolean;
  guests: number;
  settings: WeddingSettings;
  onSave: (v: Venue) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const INCLUDES: Array<[keyof VenueIncludes, string]> = [
  ['design', 'עיצוב'],
  ['chuppah', 'חופה'],
  ['light', 'תאורה והגברה'],
  ['bar', 'בר'],
];

const inputCls =
  'w-full min-h-[42px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export function VenueEditor({ venue, isNew, guests, settings, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<Venue>(venue);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof Venue>(k: K, v: Venue[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setNum = (k: 'price' | 'minGuests' | 'alcohol' | 'djFee' | 'extras' | 'discount') => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(k, Math.max(0, Number(e.target.value) || 0));

  const cost = venueCost(draft, guests, settings);
  const hasPrice = draft.price > 0;
  const { min, max } = MARKET.plateCenter;
  const pos = Math.min(100, Math.max(0, ((cost.perGuest - 200) / 400) * 100));

  const save = () => {
    if (!draft.name.trim()) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    onSave({ ...draft, name: draft.name.trim() });
  };

  const field = (id: keyof Venue, label: string, input: React.ReactNode, full = false) => (
    <div className={`flex flex-col gap-1.5 ${full ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={`wv-${id}`} className="text-xs font-bold text-slate-600">
        {label}
      </label>
      {input}
    </div>
  );

  const numInput = (k: 'price' | 'minGuests' | 'alcohol' | 'djFee' | 'extras' | 'discount') => (
    <input id={`wv-${k}`} type="number" inputMode="numeric" min={0} className={inputCls} value={draft[k] || ''} onChange={setNum(k)} />
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-start bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wv-title"
        dir="rtl"
        className="h-full w-full max-w-xl overflow-y-auto bg-gray-50 p-5 shadow-2xl"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="wv-title" className="text-xl font-black text-slate-900">
            {isNew ? 'הצעה חדשה' : 'עריכת הצעה'}
          </h2>
          <button onClick={onClose} aria-label="סגירה" className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-600 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field(
            'name',
            'שם האולם',
            <>
              <input
                id="wv-name"
                ref={nameRef}
                className={`${inputCls} ${nameError ? 'border-red-400' : ''}`}
                placeholder="למשל: גן אירועים בשוהם"
                value={draft.name}
                onChange={(e) => {
                  set('name', e.target.value);
                  setNameError(false);
                }}
              />
              {nameError && <span className="text-xs text-red-600">צריך לתת לאולם שם כדי לשמור.</span>}
            </>,
            true,
          )}
          {field('city', 'עיר', <input id="wv-city" className={inputCls} value={draft.city} onChange={(e) => set('city', e.target.value)} />)}
          {field('contact', 'איש קשר / טלפון', <input id="wv-contact" className={inputCls} value={draft.contact} onChange={(e) => set('contact', e.target.value)} />)}
          {field('date', 'תאריך מוצע', <input id="wv-date" type="date" className={inputCls} value={draft.date} onChange={(e) => set('date', e.target.value)} />)}
          {field(
            'status',
            'סטטוס',
            <select id="wv-status" className={inputCls} value={draft.status} onChange={(e) => set('status', e.target.value as Venue['status'])}>
              {VENUE_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>,
          )}
          {field('price', 'מחיר למנה (₪)', numInput('price'))}
          {field('minGuests', 'מינימום מנות', numInput('minGuests'))}
          {field('alcohol', 'תוספת אלכוהול למנה (₪)', numInput('alcohol'))}
          {field('djFee', 'כניסת DJ חיצוני (₪)', numInput('djFee'))}
          {field('extras', 'תוספות אחרות (₪)', numInput('extras'))}
          {field('discount', 'הנחה / זיכוי (₪)', numInput('discount'))}

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">מע״מ</span>
            <button
              type="button"
              aria-pressed={draft.vatIncluded}
              onClick={() => set('vatIncluded', !draft.vatIncluded)}
              className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-sm font-bold ${
                draft.vatIncluded ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-slate-700'
              }`}
            >
              <span>{draft.vatIncluded ? 'המחיר כולל מע״מ' : 'המחיר לא כולל מע״מ'}</span>
              {!draft.vatIncluded && <span className="text-xs text-slate-500">+{settings.vat}%</span>}
            </button>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-xs font-bold text-slate-600">מה כלול בחבילה</span>
            <div className="grid grid-cols-2 gap-2">
              {INCLUDES.map(([k, label]) => {
                const on = draft.incl[k];
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set('incl', { ...draft.incl, [k]: !on })}
                    className={`flex min-h-[44px] items-center justify-between rounded-xl border px-3 text-sm font-bold ${
                      on ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-slate-700'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-xs font-medium text-slate-500">{on ? 'כלול' : 'לא כלול'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {field(
            'notes',
            'הערות מהפגישה',
            <textarea id="wv-notes" rows={3} className={inputCls} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />,
            true,
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
          {!hasPrice ? (
            <p className="text-sm text-slate-500">הזן מחיר למנה כדי לראות את העלות האמיתית.</p>
          ) : (
            <div className="space-y-1 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-black text-slate-900">העלות האמיתית</span>
                <span className="text-xs text-slate-500">ב-{guests} אורחים</span>
              </div>
              <Line label="מנה אמיתית (כולל מע״מ ואלכוהול)" value={formatShekel(cost.real)} />
              <Line label={`מנות לתשלום${cost.emptyPlates ? ` (${cost.emptyPlates} ריקות)` : ''}`} value={String(cost.plates)} />
              <Line label="סה״כ מנות" value={formatShekel(cost.meals)} />
              {cost.gaps.map((g) => (
                <Line key={g.label} label={`+ ${g.label} (לא כלול)`} value={formatShekel(g.amount)} tone="add" />
              ))}
              {draft.djFee > 0 && <Line label="+ כניסת DJ" value={formatShekel(draft.djFee)} />}
              {draft.extras > 0 && <Line label="+ תוספות" value={formatShekel(draft.extras)} />}
              {draft.discount > 0 && <Line label="− הנחה" value={formatShekel(draft.discount)} />}
              <div className="flex items-baseline justify-between pt-2">
                <span className="font-bold text-slate-900">עלות כוללת</span>
                <span className="text-2xl font-black tabular-nums text-slate-900">{formatShekel(cost.total)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>לאורח</span>
                <span className="font-bold tabular-nums text-slate-900">{formatShekel(cost.perGuest)}</span>
              </div>
              <div className="relative my-3 h-2.5 rounded-full bg-gray-100" aria-hidden="true">
                <span className="absolute inset-y-0 rounded-full bg-emerald-100" style={{ right: `${((min - 200) / 400) * 100}%`, left: `${100 - ((max - 200) / 400) * 100}%` }} />
                <span className="absolute -top-1 h-[18px] w-1 rounded bg-slate-900" style={{ right: `calc(${pos.toFixed(1)}% - 2px)` }} />
              </div>
              <p className="text-xs text-slate-600">
                {cost.perGuest > max
                  ? `מעל הטווח הרגיל במרכז (${min}–${max} ₪). יש מקום למשא ומתן.`
                  : cost.perGuest < min
                    ? 'מתחת לטווח הרגיל. כדאי לוודא שלא חסר משהו בחבילה.'
                    : `בתוך הטווח הרגיל במרכז (${min}–${max} ₪).`}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button onClick={save} className="min-h-[44px] rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700">
              שמירה
            </button>
            <button onClick={onClose} className="min-h-[44px] rounded-xl border border-gray-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-gray-100">
              ביטול
            </button>
          </div>
          {!isNew &&
            (confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">למחוק את ההצעה?</span>
                <button onClick={() => onDelete(draft.id)} className="min-h-[38px] rounded-xl bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-700">
                  כן, למחוק
                </button>
                <button onClick={() => setConfirmDelete(false)} className="min-h-[38px] rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-slate-700">
                  לא
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="min-h-[38px] rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-600 hover:bg-red-50">
                מחיקה
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'add' }) {
  return (
    <div className={`flex justify-between gap-3 border-b border-gray-100 py-1.5 ${tone === 'add' ? 'text-orange-800' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
