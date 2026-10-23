/**
 * Home v2 "done today" rows — which rows to show and their one-line meta
 * (owner, 19.10.2026: compact like the big schedule's done workout, not a
 * big summary card). Pure: today's activity cards + today's real workout docs.
 */

import { common } from '@/messages/ns/common';
import { home } from '@/messages/ns/home';
import { makeT } from '@/lib/i18n/t';
import { withUnit } from '@/lib/i18n/units';
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { Locale } from '@/lib/i18n/locales';
import type { TodayActivityCardData } from '@/features/home/components/TodayActivityCard';

/** The fields of a saved workout doc a row reads (WorkoutHistoryEntry subset). */
export interface DoneRowWorkout {
  id?: string;
  /** km */
  distance?: number;
  setsCompleted?: number;
}

export interface DoneWorkoutRowData {
  card: TodayActivityCardData;
  meta: string | null;
  /** Steps cards don't open a summary. */
  tappable: boolean;
}

const DISTANCE_TYPES = new Set(['running', 'walking', 'cycling']);

function formatKm(km: number, locale: Locale): string {
  return withUnit('km', formatNumber(Math.round(km * 10) / 10, locale, { maximumFractionDigits: 1 }), makeT(locale, common));
}

/** "35 דק׳ · 5.2 ק״מ" / "42 דק׳ · 18 סטים" / "8,400 צעדים" — real values only. */
export function doneRowMeta(card: TodayActivityCardData, workout?: DoneRowWorkout, locale: Locale = 'he'): string | null {
  if (card.category === 'steps') {
    return typeof card.stepsAchieved === 'number' && card.stepsAchieved > 0
      ? withUnit('steps', formatNumber(card.stepsAchieved, locale), makeT(locale, common))
      : null;
  }
  const parts: string[] = [];
  if (card.minutes > 0) parts.push(withUnit('min', card.minutes, makeT(locale, common)));
  const km = workout?.distance;
  const isDistance = card.category === 'cardio' || DISTANCE_TYPES.has(card.workoutType ?? '') || card.workoutType === 'hybrid';
  if (isDistance && typeof km === 'number' && Number.isFinite(km) && km >= 0.1) parts.push(formatKm(km, locale));
  const sets = workout?.setsCompleted;
  if (typeof sets === 'number' && Number.isFinite(sets) && sets > 0) parts.push(makeT(locale, home)('doneToday.sets', { n: Math.round(sets) }));
  return parts.length ? parts.join(' · ') : null;
}

/**
 * One row per card (the cards are one per real workout doc, plus a met step
 * goal); each workout card is matched to its own doc by id (card.key).
 */
export function buildDoneWorkoutRows(
  cards: readonly TodayActivityCardData[],
  workouts: readonly DoneRowWorkout[],
  locale: Locale = 'he',
  /** Run-done state: a short extra line per workout id ("נספרה כריצת היום" / the plan recap). */
  notes?: Readonly<Record<string, string>>,
): DoneWorkoutRowData[] {
  const byId = new Map<string, DoneRowWorkout>();
  for (const w of workouts) if (w.id) byId.set(w.id, w);
  return cards.map((card) => {
    const base = doneRowMeta(card, byId.get(card.key), locale);
    const note = notes?.[card.key];
    return {
      card,
      meta: note ? (base ? `${base} · ${note}` : note) : base,
      tappable: card.category !== 'steps',
    };
  });
}
