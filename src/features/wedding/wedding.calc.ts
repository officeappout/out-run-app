import type { Venue, WeddingSettings } from './wedding.types';

export interface VenueCost {
  /** Price per plate after alcohol and VAT */
  real: number;
  /** Plates actually billed: max(guests, venue minimum) */
  plates: number;
  /** Plates paid for but not eaten because of the venue minimum */
  emptyPlates: number;
  /** Items the package lacks, with the cost added for each */
  gaps: Array<{ label: string; amount: number }>;
  gapSum: number;
  meals: number;
  total: number;
  perGuest: number;
}

const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/**
 * True cost of a venue offer for a given guest count. Pure — the single
 * source for every number the page shows.
 *
 *   total = real × max(guests, min) + missing items + DJ fee + extras − discount
 *   real  = (price + alcohol) × (vatIncluded ? 1 : 1 + vat%)
 */
export function venueCost(venue: Venue, guests: number, settings: WeddingSettings): VenueCost {
  const g = Math.max(0, num(guests));
  const vatFactor = venue.vatIncluded ? 1 : 1 + num(settings.vat) / 100;
  const real = (num(venue.price) + num(venue.alcohol)) * vatFactor;
  const min = num(venue.minGuests);
  const plates = Math.max(g, min);
  const inc = venue.incl ?? { design: false, chuppah: false, light: false, bar: false };

  const gaps: VenueCost['gaps'] = [];
  if (!inc.design) gaps.push({ label: 'עיצוב', amount: num(settings.design) });
  if (!inc.chuppah) gaps.push({ label: 'חופה', amount: num(settings.chuppah) });
  if (!inc.light) gaps.push({ label: 'תאורה והגברה', amount: num(settings.light) });
  if (!inc.bar) gaps.push({ label: 'בר', amount: num(settings.bar) * g });
  const gapSum = gaps.reduce((s, x) => s + x.amount, 0);

  const meals = real * plates;
  const total = meals + gapSum + num(venue.djFee) + num(venue.extras) - num(venue.discount);

  return {
    real,
    plates,
    emptyPlates: Math.max(0, min - g),
    gaps,
    gapSum,
    meals,
    total,
    perGuest: g > 0 ? total / g : 0,
  };
}

/** Venues still in play (not rejected, has a price), cheapest real total first. */
export function rankVenues(
  venues: Venue[],
  guests: number,
  settings: WeddingSettings,
): Array<{ venue: Venue; cost: VenueCost }> {
  return venues
    .filter((v) => v.status !== 'נפסל' && num(v.price) > 0)
    .map((venue) => ({ venue, cost: venueCost(venue, guests, settings) }))
    .sort((a, b) => a.cost.total - b.cost.total);
}

/** Due date of a task counted back from the wedding date. */
export function taskDueDate(weddingIso: string, daysBefore: number): Date {
  const d = new Date(`${weddingIso}T00:00:00`);
  d.setDate(d.getDate() - num(daysBefore));
  return d;
}

export function daysUntil(weddingIso: string, today: Date = new Date()): number {
  const target = new Date(`${weddingIso}T00:00:00`);
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function formatShekel(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} ₪`;
}

/** ISO date (YYYY-MM-DD) in local time. */
export function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** daysBefore value that puts a task on `dateIso` (never negative). */
export function daysBeforeFor(weddingIso: string, dateIso: string): number {
  const w = new Date(`${weddingIso}T00:00:00`).getTime();
  const d = new Date(`${dateIso}T00:00:00`).getTime();
  return Math.max(0, Math.round((w - d) / 86_400_000));
}

/** Sunday 00:00 of the week containing `d` (Israeli week, Sunday–Saturday). */
export function weekStart(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export interface RoadmapWeek<T> {
  start: Date;
  end: Date;
  /** Week index from the current week: 0 = this week, 1 = next week… */
  offset: number;
  isWeddingWeek: boolean;
  tasks: T[];
}

/**
 * Weekly roadmap from the current week through the wedding week. Tasks are
 * placed by their due date (wedding date − daysBefore). Unfinished tasks due
 * before this week go to `overdue`; finished past tasks are dropped.
 */
export function buildRoadmap<T extends { daysBefore: number; done: boolean }>(
  weddingIso: string,
  tasks: T[],
  today: Date = new Date(),
): { overdue: T[]; weeks: Array<RoadmapWeek<T>> } {
  const first = weekStart(today);
  const last = weekStart(new Date(`${weddingIso}T00:00:00`));
  const weeks: Array<RoadmapWeek<T>> = [];
  for (let s = new Date(first), i = 0; s <= last && i < 260; i++) {
    const end = new Date(s);
    end.setDate(end.getDate() + 6);
    weeks.push({ start: new Date(s), end, offset: i, isWeddingWeek: s.getTime() === last.getTime(), tasks: [] });
    s.setDate(s.getDate() + 7);
  }
  const overdue: T[] = [];
  const sorted = [...tasks].sort((a, b) => b.daysBefore - a.daysBefore);
  for (const t of sorted) {
    const due = taskDueDate(weddingIso, t.daysBefore);
    if (due < first) {
      if (!t.done) overdue.push(t);
      continue;
    }
    // round, not floor: a DST change (Israel: late Oct / late Mar) makes a week 1h short or long
    const idx = Math.round((weekStart(due).getTime() - first.getTime()) / (7 * 86_400_000));
    const week = weeks[Math.min(Math.max(idx, 0), weeks.length - 1)];
    if (week) week.tasks.push(t);
  }
  return { overdue, weeks };
}

/** Start of a task's range (equal to its due date for a one-day task). */
export function taskStartDate(weddingIso: string, t: { daysBefore: number; startBefore?: number }): Date {
  return taskDueDate(weddingIso, Math.max(t.startBefore ?? t.daysBefore, t.daysBefore));
}

/** Tasks whose [start, due] range overlaps [from, to] (inclusive days). */
export function tasksOverlapping<T extends { daysBefore: number; startBefore?: number }>(weddingIso: string, tasks: T[], from: Date, to: Date): T[] {
  return tasks.filter((t) => taskStartDate(weddingIso, t) <= to && taskDueDate(weddingIso, t.daysBefore) >= from);
}

export interface WeekSegment<T> {
  task: T;
  /** 0 = Sunday … 6 = Saturday */
  col: number;
  span: number;
  lane: number;
  /** The range continues before / after this week */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Lays out ranged tasks on one week row like a calendar: each task becomes
 * a segment (col, span) clipped to the week, stacked into the first free
 * lane. Longer and earlier tasks get the upper lanes.
 */
export function layoutWeek<T extends { daysBefore: number; startBefore?: number }>(weddingIso: string, weekStartDate: Date, tasks: T[]): Array<WeekSegment<T>> {
  const ws = new Date(weekStartDate);
  ws.setHours(0, 0, 0, 0);
  const we = new Date(ws);
  we.setDate(we.getDate() + 6);
  const segs = tasksOverlapping(weddingIso, tasks, ws, we).map((task) => {
    const start = taskStartDate(weddingIso, task);
    const due = taskDueDate(weddingIso, task.daysBefore);
    const a = start < ws ? 0 : Math.min(6, Math.max(0, start.getDay()));
    const b = due > we ? 6 : Math.min(6, Math.max(0, due.getDay()));
    return { task, col: a, span: b - a + 1, lane: 0, continuesBefore: start < ws, continuesAfter: due > we };
  });
  segs.sort((x, y) => x.col - y.col || y.span - x.span);
  const laneEnds: number[] = [];
  for (const sg of segs) {
    let lane = laneEnds.findIndex((end) => end < sg.col);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(-1);
    }
    laneEnds[lane] = sg.col + sg.span - 1;
    sg.lane = lane;
  }
  return segs;
}

const GEM_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const GEM_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const GEM_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];

/** Hebrew numerals with geresh/gershayim: 21 → כ״א, 15 → ט״ו, 30 → ל׳, 787 → תשפ״ז. */
export function gematria(n: number): string {
  let v = Math.floor(n) % 1000;
  if (v <= 0) return '';
  let s = GEM_HUNDREDS[Math.floor(v / 100)];
  v %= 100;
  if (v === 15) s += 'טו';
  else if (v === 16) s += 'טז';
  else s += GEM_TENS[Math.floor(v / 10)] + GEM_ONES[v % 10];
  return s.length === 1 ? `${s}׳` : `${s.slice(0, -1)}״${s.slice(-1)}`;
}

export interface HebrewDate {
  day: number;
  /** e.g. 'תשרי', 'אדר א׳' */
  month: string;
  year: number;
}

const hebrewFmt = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

/** The Hebrew-calendar date of a civil day (via the browser's Intl Hebrew calendar). Null if unsupported. */
export function hebrewDate(d: Date): HebrewDate | null {
  if (!hebrewFmt) return null;
  try {
    const parts = hebrewFmt.formatToParts(d);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    if (!day || !month || !year) return null;
    return { day, month, year };
  } catch {
    return null;
  }
}

/** 'כ״א בתשרי תשפ״ז' (withYear) or 'כ״א בתשרי'. */
export function hebrewDateLabel(d: Date, withYear = true): string {
  const h = hebrewDate(d);
  if (!h) return '';
  return `${gematria(h.day)} ב${h.month}${withYear ? ` ${gematria(h.year)}` : ''}`;
}
