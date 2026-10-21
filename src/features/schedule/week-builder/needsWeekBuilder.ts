/**
 * Simple or complex? (owner 21.10.2026, the two-level schedule UI.)
 *
 *   simple  — one repeated workout on one track (full body ×3, walks ×3): the days picker
 *             (S-2b) is all the user needs; today's week screen follows.
 *   complex — any of: a strength split (upper / lower, push / pull / legs, a rotation —
 *             days that are not the same workout), two tracks, a walking plan next to
 *             another track, sessions that differ inside a track (quality / easy / long run),
 *             or 5+ training days → the week builder after the days step.
 *
 * Decided from the week the engine actually built (what the user would see), plus the
 * split the recommendation policy picked. Pure.
 */
import { focusRotationOf } from '@/features/workout-engine/services/split-decision/day-focus.utils';
import type { SessionType } from '@/features/workout-engine/services/split-decision/split-decision.types';
import { canonicalSlug } from '../engine-v2/programProfiles';
import type { WbSession, WbTrack, WbWeek } from './types';

/** 5 training days or more is always the builder. */
export const MANY_DAYS = 5;

export type WeekComplexity = 'two_tracks' | 'walk_with_other' | 'split' | 'mixed_sessions' | 'many_days';

export interface WeekShape {
  /** One entry per main session: its track and what it is (slug / slot / 'walk'). */
  sessions: ReadonlyArray<{ track: WbTrack; key: string }>;
  /** Distinct days that hold a session. */
  trainingDays: number;
  /** The strength split the policy picked for this week, when there is one. */
  split?: SessionType | null;
}

/** Splits whose days are not the same workout (a rotation the generator steers or rotates). */
const ROTATING_SPLITS = new Set<SessionType>(['push_pull_rotation', 'push_pull_mixed', 'skill_dominance', 'hyper_skill_blocks']);

export function isSplitWeek(split: SessionType | null | undefined): boolean {
  if (!split) return false;
  if (ROTATING_SPLITS.has(split)) return true;
  return (focusRotationOf(split)?.length ?? 1) > 1;
}

export function sessionKey(s: Pick<WbSession, 'track' | 'slug' | 'slot'>): string {
  if (s.track === 'strength') return canonicalSlug(s.slug ?? 'full_body');
  if (s.track === 'run') return s.slot ?? 'easy_run';
  return 'walk';
}

export function weekComplexity(shape: WeekShape): WeekComplexity[] {
  const out: WeekComplexity[] = [];
  const tracks = new Set(shape.sessions.map((s) => s.track));
  if (tracks.has('walk') && tracks.size > 1) out.push('walk_with_other');
  else if (tracks.size > 1) out.push('two_tracks');
  if (isSplitWeek(shape.split)) out.push('split');
  for (const t of Array.from(tracks)) {
    const keys = new Set(shape.sessions.filter((s) => s.track === t).map((s) => s.key));
    if (keys.size > 1) {
      out.push('mixed_sessions');
      break;
    }
  }
  if (shape.trainingDays >= MANY_DAYS) out.push('many_days');
  return out;
}

export function needsWeekBuilder(shape: WeekShape): boolean {
  return weekComplexity(shape).length > 0;
}

/** The shape of a built week (locked sessions of another track count: they share the week). */
export function shapeOfWeek<P>(week: WbWeek<P>, split?: SessionType | null): WeekShape {
  const sessions = week.days.flatMap((d) => d.sessions.map((s) => ({ track: s.track, key: sessionKey(s) })));
  return { sessions, trainingDays: week.days.filter((d) => d.sessions.length > 0).length, split: split ?? null };
}
