/**
 * Today's scheduled workout kind from the userSchedule entries of today — enable_hybrid_cards_v2.
 * PURE. Completed entries don't count (the strength workout was already done → not "scheduled").
 */

import type { TodayScheduledKind } from './situation.types';

export interface ScheduleEntryLite {
  type?: string;
  completed?: boolean;
  scheduledCategories?: string[];
}

export function todayScheduledKind(entries: ScheduleEntryLite[] | null | undefined): TodayScheduledKind {
  if (entries == null) return 'unknown';
  const open = entries.filter((e) => e && !e.completed);
  if (open.length === 0) return entries.some((e) => e?.type === 'rest') ? 'rest' : 'none';
  const cats = new Set(open.flatMap((e) => e.scheduledCategories ?? []));
  const training = open.filter((e) => e.type === 'training');
  if (cats.has('strength')) return 'strength';
  if (cats.has('cardio')) return 'run';
  if (cats.has('walking')) return 'walk';
  // A training entry with no categories is a strength program day (programIds only).
  if (training.length > 0) return 'strength';
  if (open.some((e) => e.type === 'rest')) return 'rest';
  return 'none';
}
