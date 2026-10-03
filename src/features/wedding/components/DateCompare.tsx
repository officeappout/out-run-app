'use client';

import { useState } from 'react';
import { DAY_FACTOR, familyIcon, familyOn, dateFactor, formatShekel, gematria, hebrewDate, monthOptions, seasonFactor, seasonLabel } from '../wedding.calc';
import { MARKET } from '../wedding.config';
import type { WeddingState } from '../wedding.types';
import { card, cellInput, fmtIso } from './ui';
import { WeddingDateFamilyNote } from './FamilyDates';

/**
 * "What if we moved the date?" — estimated price per guest for a weekday
 * (Sun–Wed) vs a Thursday in each of the next 12 months, relative to the
 * current wedding date, plus how many dates each month are open by the
 * Hebrew calendar. Estimates only: factors come from the market research.
 */

const MARKET_MID = Math.round((MARKET.plateCenter.min + MARKET.plateCenter.max) / 2);

export function DateCompare({ s }: { s: WeddingState }) {
  const priced = s.venues.filter((v) => v.price > 0 && v.status !== 'נפסל');
  const [source, setSource] = useState<string>(priced[0]?.id ?? 'market');
  const venue = priced.find((v) => v.id === source);

  const wedding = new Date(`${s.settings.date}T12:00:00`);
  // Normalise the chosen price to a "winter weekday" base, then re-apply each month/day factor.
  const vat = 1 + s.settings.vat / 100;
  const refPrice = venue ? venue.price * (venue.vatIncluded ? 1 : vat) : MARKET_MID;
  const refDate = venue ? new Date(`${venue.date || s.settings.date}T12:00:00`) : wedding;
  const base = refPrice / dateFactor(refDate);
  const current = base * dateFactor(wedding);
  const guests = s.settings.guests;

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() + i, 1));

  const cell = (price: number, isCurrent: boolean) => {
    const diff = current ? (price - current) / current : 0;
    const tone = Math.abs(diff) < 0.005 ? 'text-slate-500' : diff < 0 ? 'text-emerald-700' : 'text-red-600';
    return (
      <td className={`px-2 py-2.5 align-top ${isCurrent ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-400' : ''}`}>
        <div className="font-bold tabular-nums text-slate-900">{formatShekel(price)}</div>
        <div className="text-xs tabular-nums text-slate-500">{formatShekel(price * guests)}</div>
        <div className={`text-xs font-bold tabular-nums ${tone}`}>
          {isCurrent ? 'התאריך שלכם' : Math.abs(diff) < 0.005 ? 'אותו מחיר' : <span dir="ltr">{`${diff > 0 ? '+' : '−'}${Math.round(Math.abs(diff) * 100)}%`}</span>}
        </div>
      </td>
    );
  };

  return (
    <section className={card}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-black text-slate-900">השוואת תאריכים: יום בשבוע וחודש</h2>
          <p className="text-xs text-slate-500">
            הערכה לפי מחקר השוק, ביחס לתאריך שלכם ({fmtIso(s.settings.date)}, יום {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][wedding.getDay()]}). מחיר למנה, ומתחתיו סה״כ מנות ל-{guests} אורחים.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          לפי
          <select className={`${cellInput} w-auto max-w-[240px]`} value={venue ? source : 'market'} onChange={(e) => setSource(e.target.value)}>
            <option value="market">ממוצע השוק במרכז (~{MARKET_MID} ₪)</option>
            {priced.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.price} ₪{v.priceIsEstimate ? ', הערכה' : ''})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-2">
        <WeddingDateFamilyNote settings={s.settings} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="text-right text-xs text-slate-500">
              <th className="border-b border-gray-200 px-2 py-2 font-medium">חודש</th>
              <th className="border-b border-gray-200 px-2 py-2 font-medium">א׳–ד׳</th>
              <th className="border-b border-gray-200 px-2 py-2 font-medium">חמישי</th>
              <th className="border-b border-gray-200 px-2 py-2 font-medium">תאריכים פנויים (א׳–ה׳)</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const opt = monthOptions(m.getFullYear(), m.getMonth(), today, s.settings.familyDates);
              const famDays = Array.from({ length: new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate() }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1, 12))
                .filter((d) => d >= today)
                .flatMap((d) => familyOn(d, s.settings.familyDates).map((x) => ({ ...x, d })));
              const isWeddingMonth = m.getFullYear() === wedding.getFullYear() && m.getMonth() === wedding.getMonth();
              const weddingIsThu = wedding.getDay() === 4;
              const f = seasonFactor(m.getMonth());
              const h1 = hebrewDate(m);
              const h2 = hebrewDate(new Date(m.getFullYear(), m.getMonth() + 1, 0));
              const blocked = Object.entries(opt.blocked);
              return (
                <tr key={m.getTime()} className={`border-b border-gray-100 ${isWeddingMonth ? 'bg-emerald-50/40' : ''}`}>
                  <td className="px-2 py-2.5 align-top">
                    <div className="font-bold text-slate-900">{m.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}</div>
                    <div className="text-xs text-slate-500">
                      {h1 && h2 ? (h1.month === h2.month ? h1.month : `${h1.month}–${h2.month}`) : ''} {h2 ? gematria(h2.year) : ''}
                    </div>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        f === 1 ? 'bg-sky-50 text-sky-800' : f < 1.2 ? 'bg-amber-50 text-amber-800' : 'bg-orange-50 text-orange-800'
                      }`}
                    >
                      {seasonLabel(m.getMonth())}
                    </span>
                  </td>
                  {cell(base * f * DAY_FACTOR.weekday, isWeddingMonth && !weddingIsThu)}
                  {cell(base * f * DAY_FACTOR.thursday, isWeddingMonth && weddingIsThu)}
                  <td className="px-2 py-2.5 align-top">
                    <div className="tabular-nums text-slate-800">
                      <b>{opt.weekdayFree}</b> א׳–ד׳ · <b>{opt.thursdayFree}</b> חמישי
                    </div>
                    {blocked.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {blocked.map(([reason, n]) => (
                          <span key={reason} className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                            {reason}: {n === 1 ? 'יום אחד' : `${n} ימים`}
                          </span>
                        ))}
                      </div>
                    )}
                    {famDays.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {famDays.map((x) => (
                          <span key={`${x.date.id}-${x.d.getDate()}`} className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                            {familyIcon(x.date)} {x.d.getDate()}.{x.d.getMonth() + 1} {x.date.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1 text-xs leading-relaxed text-slate-500">
        <p>
          <b>איך זה מחושב:</b> חמישי יקר בכ-11% מיום חול (המקורות: 10–12%). בעונה (אפריל–אוקטובר) המחיר גבוה בכ-25% מהחורף (נובמבר–פברואר; המקורות: 20–30%). במרץ המקורות
          חלוקים, אז הוא באמצע (+12%). המספרים הם הערכה בלבד. המחיר האמיתי לכל תאריך מגיע רק מהצעה כתובה של האולם.
        </p>
        <p>
          <b>תאריכים משפחתיים</b> (ימי הולדת ואזכרות, עורכים בהגדרות) נספרים כתפוסים ומופיעים בצהוב בכל חודש. <b>תאריכים חסומים:</b> ספירת העומר (בלי ל״ג בעומר), בין המצרים וחגים, לפי המנהג הנפוץ. המנהגים שונים בין עדות, אז כדאי לבדוק מול הרב. שישי בצהריים ומוצאי שבת לא נכללים, כי
          אין עליהם נתוני מחיר אמינים.
        </p>
      </div>
    </section>
  );
}
