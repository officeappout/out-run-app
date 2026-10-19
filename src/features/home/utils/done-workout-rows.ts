/**
 * Home v2 "done today" rows — which rows to show and their one-line meta
 * (owner, 19.10.2026: compact like the big schedule's done workout, not a
 * big summary card). Pure: today's activity cards + today's real workout docs.
 */

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

function formatKm(km: number): string {
  return `${(Math.round(km * 10) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 })} ק״מ`;
}

/** "35 דק׳ · 5.2 ק״מ" / "42 דק׳ · 18 סטים" / "8,400 צעדים" — real values only. */
export function doneRowMeta(card: TodayActivityCardData, workout?: DoneRowWorkout): string | null {
  if (card.category === 'steps') {
    return typeof card.stepsAchieved === 'number' && card.stepsAchieved > 0
      ? `${card.stepsAchieved.toLocaleString('he-IL')} צעדים`
      : null;
  }
  const parts: string[] = [];
  if (card.minutes > 0) parts.push(`${card.minutes} דק׳`);
  const km = workout?.distance;
  const isDistance = card.category === 'cardio' || DISTANCE_TYPES.has(card.workoutType ?? '') || card.workoutType === 'hybrid';
  if (isDistance && typeof km === 'number' && Number.isFinite(km) && km >= 0.1) parts.push(formatKm(km));
  const sets = workout?.setsCompleted;
  if (typeof sets === 'number' && Number.isFinite(sets) && sets > 0) parts.push(`${Math.round(sets)} סטים`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * One row per card (the cards are one per real workout doc, plus a met step
 * goal); each workout card is matched to its own doc by id (card.key).
 */
export function buildDoneWorkoutRows(
  cards: readonly TodayActivityCardData[],
  workouts: readonly DoneRowWorkout[],
): DoneWorkoutRowData[] {
  const byId = new Map<string, DoneRowWorkout>();
  for (const w of workouts) if (w.id) byId.set(w.id, w);
  return cards.map((card) => ({
    card,
    meta: doneRowMeta(card, byId.get(card.key)),
    tappable: card.category !== 'steps',
  }));
}
