/**
 * What the tutorial needs from the profile, read once: group levels (push / pull / legs), whether the
 * user runs, and how many runs a week. Pure (__tests__/profileInputs.test.ts). The strength seed
 * itself comes from scheduleSeed.service (resolveScheduleSeed), like the existing week step.
 */
import type { GroupLevels } from '@/features/schedule/engine-v2/structure/types';
import type { RunSlot } from '@/features/schedule/engine-v2/types';

type Leveled = { currentLevel?: number; level?: number } | null | undefined;
export interface ProgressionSlice {
  tracks?: Record<string, Leveled> | null;
  domains?: Record<string, Leveled> | null;
}

const levelOf = (v: Leveled): number => {
  const l = v?.currentLevel ?? v?.level ?? 0;
  return typeof l === 'number' && Number.isFinite(l) && l > 0 ? l : 0;
};

/** Each group = the higher of its track / domain level; a missing group falls back to the others' average (else 1). */
export function groupLevelsOf(progression: ProgressionSlice | null | undefined): GroupLevels {
  const t = progression?.tracks ?? {};
  const d = progression?.domains ?? {};
  const raw = { push: Math.max(levelOf(t.push), levelOf(d.push)), pull: Math.max(levelOf(t.pull), levelOf(d.pull)), legs: Math.max(levelOf(t.legs), levelOf(d.legs)) };
  const known = Object.values(raw).filter((l) => l > 0);
  const fill = known.length ? Math.max(1, Math.floor(known.reduce((s, l) => s + l, 0) / known.length)) : 1;
  return { push: raw.push || fill, pull: raw.pull || fill, legs: raw.legs || fill };
}

export const DEFAULT_RUNS_PER_WEEK = 3;

/**
 * Stub (engine owner): the week-1 run slots by count. The signup's real slots come from the running
 * program template (firstWeekRunSlots); here only the count is known.
 */
export function runSlotsFor(count: number): RunSlot[] {
  const n = Math.max(1, Math.min(4, Math.round(count) || DEFAULT_RUNS_PER_WEEK));
  if (n === 1) return ['long_run'];
  if (n === 2) return ['quality_primary', 'long_run'];
  if (n === 3) return ['quality_primary', 'quality_secondary', 'long_run'];
  return ['quality_primary', 'quality_secondary', 'easy_run', 'long_run'];
}

/** Runs a week from the saved running days (clamped 1..4), default 3. */
export function runsPerWeekOf(running: { scheduleDays?: unknown } | null | undefined): number {
  const days = Array.isArray(running?.scheduleDays) ? running!.scheduleDays.length : 0;
  return days > 0 ? Math.min(4, days) : DEFAULT_RUNS_PER_WEEK;
}
