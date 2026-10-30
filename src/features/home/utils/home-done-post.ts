/**
 * enable_home_after_v1 stage 3: the "done today" slide as a workout post (canvas boards HomePost /
 * HomeAfterPostKit, surface "home"): a title and a row of up to 3 big numbers. Pure. Real values only,
 * every number hides itself when its field is missing.
 *
 *   strength: minutes, sets
 *   run / walk / ride / hybrid: km, time, pace per km (sets too on a hybrid, when there is room)
 *   steps goal: steps
 */
import { common } from '@/messages/ns/common';
import { home } from '@/messages/ns/home';
import { makeT } from '@/lib/i18n/t';
import { formatNumber, formatTime } from '@/lib/i18n/core/fmt';
import type { Locale } from '@/lib/i18n/locales';
import type { TodayActivityCardData } from '@/features/home/components/TodayActivityCard';

/** The fields of a saved workout doc the post reads (WorkoutHistoryEntry subset). */
export interface DonePostWorkout {
  id?: string;
  /** km */
  distance?: number;
  /** seconds */
  duration?: number;
  /** minutes per km */
  pace?: number;
  setsCompleted?: number;
  date?: unknown;
}

export interface DonePostStat {
  value: string;
  label: string;
}

const DISTANCE_TYPES = new Set(['running', 'walking', 'cycling', 'hybrid']);
const MAX_STATS = 3;

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** "25:30" / "1:05:12". */
export function formatClock(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function homeDonePostStats(card: TodayActivityCardData, workout: DonePostWorkout | undefined, locale: Locale = 'he'): DonePostStat[] {
  const tc = makeT(locale, common);
  const th = makeT(locale, home);
  if (card.category === 'steps') {
    return isPos(card.stepsAchieved) ? [{ value: formatNumber(card.stepsAchieved, locale), label: th('homeAfter.post.steps') }] : [];
  }
  const out: DonePostStat[] = [];
  const sets = workout?.setsCompleted;
  const km = workout?.distance;
  const isDistance = card.category === 'cardio' || DISTANCE_TYPES.has(card.workoutType ?? '');
  if (isDistance && isPos(km) && km >= 0.1) {
    out.push({ value: formatNumber(Math.round(km * 10) / 10, locale, { maximumFractionDigits: 1 }), label: tc('units.label.km') });
    if (isPos(workout?.duration)) out.push({ value: formatClock(workout.duration), label: th('homeAfter.post.time') });
    else if (card.minutes > 0) out.push({ value: String(card.minutes), label: tc('units.label.minutes') });
    if (isPos(workout?.pace)) out.push({ value: formatClock(workout.pace * 60), label: tc('units.label.minPerKm') });
  } else if (card.minutes > 0) {
    out.push({ value: String(card.minutes), label: tc('units.label.minutes') });
  }
  if (isPos(sets)) out.push({ value: String(Math.round(sets)), label: th('homeAfter.post.sets') });
  return out.slice(0, MAX_STATS);
}

/** The workout's finish time ("18:10"), or null when the doc has no readable date. */
export function donePostTime(workout: DonePostWorkout | undefined, locale: Locale = 'he'): string | null {
  const raw = workout?.date as { toDate?: () => Date } | Date | undefined;
  const d = raw instanceof Date ? raw : typeof raw?.toDate === 'function' ? raw.toDate() : null;
  return d && !Number.isNaN(d.getTime()) ? formatTime(d, locale) : null;
}
