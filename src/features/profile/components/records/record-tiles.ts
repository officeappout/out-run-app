/**
 * Profile v2 · שיאים אישיים (board P-3) — which record tiles to show.
 * Only real values: a record with no value yet is left out (never "—", never
 * invented). Pure.
 */
import { unitLabel, withUnit } from '@/lib/i18n/units';
import { formatDate, formatNumber, monthName } from '@/lib/i18n/core/fmt';
import type { Locale } from '@/lib/i18n/locales';
import { bestMonth, type PeriodTotals, type ProgressionRecords } from '@/features/user/progression/records/records.utils';

export type RecordIcon = 'strength' | 'run' | 'walk' | 'streak' | 'month';

export interface RecordTile {
  key: string;
  icon: RecordIcon;
  value: string;
  unit?: string;
  label: string;
  /** Epoch ms when set (null = no date, e.g. a streak). */
  at: number | null;
  /** Broken in the last 7 days. */
  isNew: boolean;
}

export interface ExerciseBest {
  exerciseId: string;
  name: string;
  bestReps: number;
  bestAt: number | null;
}

const WEEK = 7 * 86_400_000;

export function clock(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const km = (n: number, locale: Locale) => formatNumber(Math.round(n * 10) / 10, locale, { maximumFractionDigits: 1 });

export function buildRecordTiles(input: {
  records?: ProgressionRecords | null;
  periodTotals?: Record<string, PeriodTotals> | null;
  longestStreak?: number | null;
  exercises?: ExerciseBest[];
  nowMs: number;
  /** Display language for numbers and month names; absent = Hebrew (today's output). */
  locale?: Locale;
}): RecordTile[] {
  const { records, nowMs } = input;
  const locale = input.locale ?? 'he';
  const fresh = (at: number | null) => at != null && nowMs - at < WEEK;
  const tiles: RecordTile[] = [];
  for (const ex of input.exercises ?? []) {
    if (!(ex.bestReps > 0)) continue;
    tiles.push({ key: `ex:${ex.exerciseId}`, icon: 'strength', value: String(ex.bestReps), unit: 'חזרות', label: `${ex.name} · בסט`, at: ex.bestAt, isNew: fresh(ex.bestAt) });
  }
  if (records?.fastest5kSec?.value) {
    tiles.push({ key: '5k', icon: 'run', value: clock(records.fastest5kSec.value), label: `${withUnit('km', 5)} הכי מהיר`, at: records.fastest5kSec.at, isNew: fresh(records.fastest5kSec.at) });
  }
  if (records?.longestRunKm?.value) {
    tiles.push({ key: 'run', icon: 'run', value: km(records.longestRunKm.value, locale), unit: unitLabel('km'), label: 'ריצה הכי ארוכה', at: records.longestRunKm.at, isNew: fresh(records.longestRunKm.at) });
  }
  if (records?.longestWalkKm?.value) {
    tiles.push({ key: 'walk', icon: 'walk', value: km(records.longestWalkKm.value, locale), unit: unitLabel('km'), label: 'הליכה הכי ארוכה', at: records.longestWalkKm.at, isNew: fresh(records.longestWalkKm.at) });
  }
  if ((input.longestStreak ?? 0) > 1) {
    tiles.push({ key: 'streak', icon: 'streak', value: String(input.longestStreak), unit: 'ימים', label: 'רצף הכי ארוך', at: null, isNew: false });
  }
  const month = bestMonth(input.periodTotals);
  if (month) {
    const m = Number(month.month.slice(5, 7)) - 1;
    tiles.push({ key: 'month', icon: 'month', value: String(month.workouts), unit: 'אימונים', label: `הכי הרבה בחודש · ${Number.isInteger(m) && m >= 0 && m <= 11 ? monthName(m, locale) : month.month}`, at: null, isNew: false });
  }
  return tiles;
}

/** "15 במרץ" (he) — the Intl day + long month form, in the device's time zone. */
export function dateLabel(at: number, locale: Locale = 'he'): string {
  if (!Number.isFinite(at)) return '';
  return formatDate(new Date(at), locale, { day: 'numeric', month: 'long' });
}
