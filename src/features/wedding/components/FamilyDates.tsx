'use client';

import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { familyIcon, familyOn, gematria, hebrewDate, hebrewMonthMatches, type FamilyHit } from '../wedding.calc';
import { FAMILY_KINDS, HEBREW_MONTHS, type FamilyDate, type FamilyKind, type HebrewMonth, type WeddingSettings } from '../wedding.types';
import { cellInput, fmtDate, newId, type Update } from './ui';

/** Family birthdays / yahrzeits: the editor (Settings) and the wedding-date conflict check. */

const label = (f: FamilyDate) =>
  [f.hDay ? `${gematria(f.hDay)} ${f.hMonth}` : '', f.gDay ? `${f.gDay}/${f.gMonth}` : ''].filter(Boolean).join(' · ');

/** Next civil date (from today, within ~13 months) each family date falls on, by either calendar. */
function useNextOccurrences(family: FamilyDate[]): Map<string, Date> {
  return useMemo(() => {
    const out = new Map<string, Date>();
    if (!family.length) return out;
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    for (let i = 0; i < 400 && out.size < family.length; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const h = hebrewDate(d);
      for (const f of family) {
        if (out.has(f.id)) continue;
        const heb = f.hDay && h && h.day === f.hDay && hebrewMonthMatches(h.month, f.hMonth);
        const civ = f.gDay && d.getDate() === f.gDay && d.getMonth() + 1 === f.gMonth;
        if (heb || civ) out.set(f.id, d);
      }
    }
    return out;
  }, [family]);
}

/** Family dates on the wedding day itself, and within 3 days of it. */
export function weddingFamilyCheck(settings: WeddingSettings): { same: FamilyHit[]; near: Array<FamilyHit & { day: Date }> } {
  const w = new Date(`${settings.date}T12:00:00`);
  const same = familyOn(w, settings.familyDates);
  const near: Array<FamilyHit & { day: Date }> = [];
  for (const off of [-3, -2, -1, 1, 2, 3]) {
    const d = new Date(w);
    d.setDate(w.getDate() + off);
    for (const hit of familyOn(d, settings.familyDates)) near.push({ ...hit, day: d });
  }
  return { same, near };
}

export function WeddingDateFamilyNote({ settings }: { settings: WeddingSettings }) {
  if (!settings.familyDates.length) return null;
  const { same, near } = weddingFamilyCheck(settings);
  if (same.length)
    return (
      <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs font-bold text-red-700">
        ⚠ התאריך נופל על: {same.map((h) => `${familyIcon(h.date)} ${h.date.name}${h.by === 'civil' ? ' (לועזי)' : ''}`).join(', ')}
      </p>
    );
  return (
    <p className="text-xs text-emerald-700">
      ✓ לא נופל על תאריך משפחתי
      {near.length > 0 && (
        <span className="text-slate-500"> · קרוב: {near.map((h) => `${familyIcon(h.date)} ${h.date.name} ${fmtDate(h.day)}`).join(', ')}</span>
      )}
    </p>
  );
}

export function FamilyDatesEditor({ settings, update }: { settings: WeddingSettings; update: Update }) {
  const list = settings.familyDates;
  const next = useNextOccurrences(list);
  const setList = (fn: (l: FamilyDate[]) => FamilyDate[]) => update((st) => ({ ...st, settings: { ...st.settings, familyDates: fn(st.settings.familyDates) } }));
  const patch = (id: string, p: Partial<FamilyDate>) => setList((l) => l.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const sel = `${cellInput} !w-auto !min-w-0`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-500">
        מסומנים בלוח השנה ונחשבים &quot;תפוסים&quot; בהשוואת התאריכים. כל אחד מסומן בתאריך העברי שלו בכל שנה, ואם הוזן גם תאריך לועזי – גם בו. &quot;אדר&quot; סתם = גם אדר א׳ וגם
        אדר ב׳ בשנה מעוברת.
      </p>
      {list.map((f) => {
        const n = next.get(f.id);
        return (
          <div key={f.id} className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2">
            <span className="w-6 text-center" aria-hidden="true">
              {familyIcon(f)}
            </span>
            <input aria-label="שם" className={`${cellInput} !w-44`} value={f.name} placeholder="שם" onChange={(e) => patch(f.id, { name: e.target.value })} />
            <select aria-label="סוג" className={sel} value={f.kind} onChange={(e) => patch(f.id, { kind: e.target.value as FamilyKind })}>
              {FAMILY_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500">עברי</span>
            <select aria-label="יום עברי" className={sel} value={f.hDay} onChange={(e) => patch(f.id, { hDay: Number(e.target.value) })}>
              <option value={0}>—</option>
              {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {gematria(d)}
                </option>
              ))}
            </select>
            <select aria-label="חודש עברי" className={sel} value={f.hMonth} onChange={(e) => patch(f.id, { hMonth: e.target.value as HebrewMonth })}>
              {HEBREW_MONTHS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <span className="text-xs text-slate-500">לועזי</span>
            <select aria-label="יום לועזי" className={sel} value={f.gDay} onChange={(e) => patch(f.id, { gDay: Number(e.target.value), gMonth: f.gMonth || 1 })}>
              <option value={0}>—</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select aria-label="חודש לועזי" className={sel} value={f.gMonth} onChange={(e) => patch(f.id, { gMonth: Number(e.target.value), gDay: f.gDay || 1 })}>
              <option value={0}>—</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">{n ? `הבא: ${n.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })}` : label(f)}</span>
            <button
              aria-label={`מחיקת ${f.name}`}
              onClick={() => setList((l) => l.filter((x) => x.id !== f.id))}
              className="ms-auto flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      <button
        onClick={() => setList((l) => [...l, { id: newId(), name: 'תאריך חדש', kind: 'יום הולדת', hDay: 1, hMonth: 'תשרי', gDay: 0, gMonth: 0 }])}
        className="flex items-center gap-1.5 self-start rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
      >
        <Plus className="h-4 w-4" /> תאריך
      </button>
    </div>
  );
}
