/** Progress tab v2 — Hebrew display helpers. Pure. */

const MONTHS_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const MONTHS_LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const WEEKDAY_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function monthName(m: number): string {
  return MONTHS_LONG[((m % 12) + 12) % 12];
}

export function monthShort(m: number): string {
  return MONTHS_SHORT[((m % 12) + 12) % 12];
}

/** "19–25 באוק׳" (same month) / "29 בספט׳–5 באוק׳". */
export function weekRangeLabel(start: Date, end: Date): string {
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${end.getDate()} ב${monthShort(end.getMonth())}`;
  return `${start.getDate()} ב${monthShort(start.getMonth())}–${end.getDate()} ב${monthShort(end.getMonth())}`;
}

/** "214" דק׳ under 10h, else "12:40" שע׳. */
export function formatMinutes(min: number): { value: string; unit: string } {
  const m = Math.max(0, Math.round(min));
  if (m < 600) return { value: m.toLocaleString('he-IL'), unit: 'דק׳' };
  return { value: `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, unit: 'שע׳' };
}

/** h:mm always (tab headers: "3:55 שע׳"). */
export function formatHours(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

export function formatKm(km: number): string {
  return (Math.round(km * 10) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 });
}

/** min/km → "5:42". */
export function formatPace(pace: number): string {
  if (!(pace > 0)) return '—';
  let m = Math.floor(pace);
  let s = Math.round((pace - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('he-IL');
}

/** "היום" / "אתמול" / "שלישי" (this week) / "לפני 9 ימים" / "4 באוק׳". */
export function relativeDay(d: Date, now: Date): string {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff <= 0) return 'היום';
  if (diff === 1) return 'אתמול';
  if (diff < 7) return WEEKDAY_LONG[d.getDay()];
  if (diff < 14) return 'שבוע שעבר';
  return `${d.getDate()} ב${monthShort(d.getMonth())}`;
}

/** "9 באוק׳" from YYYY-MM-DD. */
export function isoDayLabel(iso: string): string {
  const m = Number(iso.slice(5, 7)) - 1;
  return `${Number(iso.slice(8, 10))} ב${monthShort(m)}`;
}

/** Hebrew count noun: 1 → singular phrase, else "N plural". */
export function countNoun(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}
