/**
 * The running week on real weekdays — ONE pure mapper for every surface that
 * shows it (home week strip + run overlay, run week list, home run slot,
 * agenda / planner, today's planned run on the map).
 *
 * The stored plan keeps only an ordinal per run (`schedule[].day` = 1st, 2nd …
 * run of the week, emitted in slot priority order Q1 → L → Q2 → E). Today's
 * readers put run k on the k-th chosen weekday, so the long run lands on the
 * 2nd run day (schedule-combos.md gap #1) while the signup recommendation and
 * summary (runWeekRecommendation → engine v2) put it on the long-run day.
 *
 * `byType: true` (enable_home_v2) places the week the way signup does: the
 * week's slots go through engine v2 (`recommendRunWeek`) and each entry takes
 * the weekday the engine gave its slot. `byType: false` is today's ordinal
 * mapping, unchanged. Nothing here reads or writes stored data.
 */
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import { isLongRunDay, isQualityDay } from '../engine/runningRules';
import { resolveRunningLevel } from '../engine/runningLevel';
import type { RunSlot, TrainingLevel } from '../engine-v2/types';
import { recommendRunWeek } from './runWeekRecommendation';
import { normalizeLongRunDay } from './longRunDay';

export { normalizeLongRunDay };

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
const RUN_SLOTS: readonly RunSlot[] = ['quality_primary', 'quality_secondary', 'long_run', 'easy_run', 'recovery'];

/** The fields a stored schedule entry already has. */
export interface RunEntryForPlacement {
  day: number;
  slotType?: string;
  category?: string;
  isQualityWorkout?: boolean;
}

/** What the engine needs beyond the slots (all optional). */
export interface RunPlacementContext {
  level?: TrainingLevel | null;
  targetDistance?: string | null;
  /** The user's long-run day (0 = Sunday), when known. Else: the last run day. */
  preferredLongRunDay?: number | null;
}

export interface RunWeekMapOptions extends RunPlacementContext {
  /** enable_home_v2 — place by slot type; off = today's ordinal mapping. */
  byType?: boolean;
}

/** Hebrew day letters → sorted weekday indices (0 = Sunday); unknown letters dropped. */
export function runDayIndices(letters: readonly string[] | null | undefined): number[] {
  return Array.from(
    new Set((letters ?? []).map((l) => DAY_LETTERS.indexOf(l as (typeof DAY_LETTERS)[number])).filter((i) => i >= 0)),
  ).sort((a, b) => a - b);
}

/** Today's mapping: the k-th run of the week on the k-th chosen weekday. */
export function mapRunWeekByOrdinal<E extends { day: number }>(entries: readonly E[], days: readonly number[]): Map<number, E> {
  const sorted = [...days].sort((a, b) => a - b);
  const map = new Map<number, E>();
  for (const e of entries) {
    const dow = sorted[e.day - 1];
    if (dow !== undefined && !map.has(dow)) map.set(dow, e);
  }
  return map;
}

/**
 * The entry's slot: `slotType` when stored, else derived the schedule
 * engine's way (long run by category; quality by isQualityWorkout / category;
 * the first quality of the week is primary, the next secondary).
 */
export function slotsOfEntries(entries: readonly RunEntryForPlacement[]): RunSlot[] {
  let qualitySeen = 0;
  return entries.map((e) => {
    if (e.slotType && (RUN_SLOTS as readonly string[]).includes(e.slotType)) return e.slotType as RunSlot;
    const day = {
      dayOfWeek: 0,
      category: (e.category ?? 'easy_run') as WorkoutCategory,
      isQualityWorkout: e.isQualityWorkout,
    };
    if (isLongRunDay(day)) return 'long_run';
    if (isQualityDay(day)) return qualitySeen++ === 0 ? 'quality_primary' : 'quality_secondary';
    return 'easy_run';
  });
}

// The engine is a search; the same week asks the same question on every
// render / every agenda day. Pure input → cache the slot layout.
const layoutCache = new Map<string, Array<{ dow: number; slot: RunSlot }>>();
const CACHE_MAX = 64;

function engineLayout(slots: RunSlot[], days: number[], ctx: RunPlacementContext): Array<{ dow: number; slot: RunSlot }> {
  const key = JSON.stringify([slots, days, ctx.level ?? null, ctx.targetDistance ?? null, ctx.preferredLongRunDay ?? null]);
  const hit = layoutCache.get(key);
  if (hit) return hit;
  const rec = recommendRunWeek({
    slots,
    days,
    preferredLongRunDay: ctx.preferredLongRunDay ?? null,
    level: ctx.level ?? 'intermediate',
    targetDistance: ctx.targetDistance ?? '5k',
  });
  const layout = rec.days.map((d) => ({ dow: d.dow, slot: d.slot }));
  if (layoutCache.size >= CACHE_MAX) layoutCache.delete(layoutCache.keys().next().value as string);
  layoutCache.set(key, layout);
  return layout;
}

/**
 * The week's entries by slot type (engine v2). Each engine day takes the first
 * unplaced entry of its slot (entries in stored order); entries the engine
 * did not place fill the remaining run days in order, exactly like today.
 * Any engine failure falls back to the ordinal mapping.
 */
export function mapRunWeekByType<E extends RunEntryForPlacement>(
  entries: readonly E[],
  days: readonly number[],
  ctx: RunPlacementContext = {},
): Map<number, E> {
  const sortedDays = Array.from(new Set(days)).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  const ordered = [...entries].sort((a, b) => a.day - b.day);
  if (ordered.length === 0 || sortedDays.length === 0) return new Map();
  let layout: Array<{ dow: number; slot: RunSlot }>;
  try {
    layout = engineLayout(slotsOfEntries(ordered), sortedDays, ctx);
  } catch {
    return mapRunWeekByOrdinal(entries, sortedDays);
  }
  const slots = slotsOfEntries(ordered);
  const placed = new Set<number>();
  const map = new Map<number, E>();
  for (const { dow, slot } of layout) {
    const i = ordered.findIndex((_, k) => !placed.has(k) && slots[k] === slot);
    if (i < 0 || map.has(dow)) continue;
    placed.add(i);
    map.set(dow, ordered[i]);
  }
  const freeDays = sortedDays.filter((d) => !map.has(d));
  ordered.forEach((e, k) => {
    if (placed.has(k)) return;
    const dow = freeDays.shift();
    if (dow !== undefined) map.set(dow, e);
  });
  return map;
}

/** The one entry point: by type under enable_home_v2, else today's ordinal mapping. */
export function mapRunWeek<E extends RunEntryForPlacement>(
  entries: readonly E[],
  days: readonly number[],
  opts: RunWeekMapOptions = {},
): Map<number, E> {
  return opts.byType ? mapRunWeekByType(entries, days, opts) : mapRunWeekByOrdinal(entries, days);
}

/** Same as mapRunWeek, from the profile's Hebrew day letters. */
export function mapRunWeekFromLetters<E extends RunEntryForPlacement>(
  entries: readonly E[],
  dayLetters: readonly string[] | null | undefined,
  opts: RunWeekMapOptions = {},
): Map<number, E> {
  return mapRunWeek(entries, runDayIndices(dayLetters), opts);
}

/** Minimal shape of `profile.running` the placement context reads. */
export interface RunPlacementProfile {
  paceProfile?: { profileType?: number } | null;
  onboardingData?: { currentAbility?: { abilityTier?: string } | null } | null;
  generatedProgramTemplate?: { targetDistance?: string } | null;
  /** enable_home_v2: the user's long-run day (signup / schedule builder). */
  longRunDay?: number | null;
}

/**
 * Engine context from the stored running profile — the schedule builder's own
 * level rule (weaverInput.resolveRunningLevel: pace profile type, else the
 * onboarding ability tier), the plan's target distance, and the user's
 * long-run day (`running.longRunDay`, written only under enable_home_v2).
 * No long-run day → the engine's default (the last run day).
 */
export function runPlacementOf(running: RunPlacementProfile | null | undefined): RunPlacementContext {
  return {
    level: resolveRunningLevel(running),
    targetDistance: running?.generatedProgramTemplate?.targetDistance ?? null,
    preferredLongRunDay: normalizeLongRunDay(running?.longRunDay),
  };
}
