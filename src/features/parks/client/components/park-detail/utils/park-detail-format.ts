/**
 * ParkDetailSheet — copy, constants and pure formatting helpers.
 * (Split out of ParkDetailSheet.tsx; no behaviour change.)
 */
import type { DayFilter } from '@/features/parks/core/hooks/useCommunityEnrichment';

export const DAY_FILTER_LABELS: Record<DayFilter, string> = {
  today: 'היום',
  tomorrow: 'מחר',
  week: 'השבוע',
};

export const DAY_FILTERS: DayFilter[] = ['today', 'tomorrow', 'week'];

export const DRAWER_HEIGHT = '92vh';
/**
 * The sheet opens directly at full height (y: 0) and returns there on any
 * drag release short of CLOSE_THRESHOLD — there is no separate "peek"
 * resting state. PEEK_Y_PX only sets where the header's fade-out starts as
 * the sheet is dragged down toward close (see useParkSheetMotion's
 * `opacity`); it is not a snap target anymore.
 */
export const PEEK_Y_PX = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.07) : 57;
export const CLOSE_THRESHOLD = 120;

export const FACILITY_LABELS: Record<string, string> = {
  gym_park: 'גינת כושר', court: 'מגרש ספורט', route: 'מסלול',
  zen_spot: 'פינת גוף-נפש', urban_spot: 'אורבן / אקסטרים', nature_community: 'טבע וקהילה',
};

/**
 * Rotating curiosity lines for the primary CTA, replacing the static
 * "התחל אימון". One is picked at random per sheet mount (the sheet body
 * unmounts on close, so this naturally re-rolls on every open, not just once
 * per session). Edit this array to change the copy; the onClick behavior is
 * untouched.
 */
export const START_WORKOUT_CTA_LINES = [
  'סקרנים מה באימון?',
  'בואו נגלה מה מחכה לכם',
  'מה הכנו לכם היום?',
  'רוצים לראות מה יש בפנים?',
];

/** Reviews list starts collapsed to this many — "צפה בעוד ביקורות" reveals the rest. */
export const REVIEWS_COLLAPSED_COUNT = 3;

/** Dual-range slider domain: 0..1440 minutes, in 15-minute steps. */
export const RANGE_MIN = 0;
export const RANGE_MAX = 24 * 60;
export const RANGE_STEP_MIN = 15;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts instanceof Date ? ts : typeof ts?.toDate === 'function' ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

/**
 * Format a "minutes from midnight" value (the unit the dual-range slider
 * operates on — see RANGE_STEP_MIN) into a HH:MM string for the floating
 * slider labels and the LTR window summary line.
 */
export function minutesToLabel(minutes: number): string {
  const hh = Math.floor(minutes / 60) % 24;
  const mm = Math.floor(minutes) % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}`;
}

/**
 * Convert a `Date` into the local-date `<input type="date">` value
 * ("YYYY-MM-DD"). Used for the explicit date picker that shows up in
 * `dayFilter === 'week'` mode (paired with the time-range slider).
 */
export function toLocalDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The time label on a park-session row: "HH:MM" today, "מחר HH:MM"
 * tomorrow, otherwise the short Hebrew weekday + "HH:MM". '' for an
 * unparseable start time.
 */
export function sessionRowTimeLabel(nextStartTime: string, now: Date = new Date()): string {
  let timeLabel = '';
  const d = new Date(nextStartTime);
  if (!isNaN(d.getTime())) {
    const isToday = d.toDateString() === now.toDateString();
    const tmrw = new Date(now); tmrw.setDate(tmrw.getDate() + 1);
    const isTomorrow = d.toDateString() === tmrw.toDateString();
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    timeLabel = isToday ? hhmm : isTomorrow ? `מחר ${hhmm}` : d.toLocaleDateString('he-IL', { weekday: 'short' }) + ` ${hhmm}`;
  }
  return timeLabel;
}
