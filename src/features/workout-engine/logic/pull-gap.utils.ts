/**
 * pull-gap.utils.ts — a day-focus session trains EVERY area of its focus, and an
 * upper / pull day is never push-only silently (enable_home_v2 day focus, owner
 * 20.10.2026). Pure.
 *
 * Root cause (reproduced in day-focus.hermetic.test.ts): the day focus narrows the
 * session through the strict body-area path, but the generator still SELECTS as the
 * master program does (full_body: domain filter bypassed, balanced cluster over 4
 * areas). enforceStrictFocus then deletes the off-focus picks (legs / core on an upper
 * day) and the variety refill tops up from the reserve, which is push-heavy at home
 * (most tagged pulls need a bar / rings / TRX / band) → 4 push exercises, no pull.
 *
 * Two steps:
 *   1. pipeline (once): `widenFocusForPullGap` — the day wants pull and the session
 *      pool has NONE → the strict focus also takes core (when the pool has core), so
 *      the session balances push with core instead of filling up on push;
 *   2. per option, after the strict pass: `balanceFocusAreas` — every focus area
 *      missing from the main block gets one exercise (the session pool first; for
 *      pull, then the closest gear-free pull in the catalog / the towel + table
 *      stopgaps — UNTAGGED_GEAR_FREE_PULLS), swapped for the last exercise of the
 *      most-repeated area so the duration stays. Without pull gear the workout is
 *      stamped `pullGap` so the overview can say why ("אין מתח בבית — …").
 */
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from './workout-generator.types';
import { isOnStrictFocus, strictDomainsOfExercise } from './strict-focus.utils';
import { UNTAGGED_GEAR_FREE_PULLS, levelOf, methodFits, type NeverEmptyOptions } from './never-empty.utils';
import { selectMethodForContext } from '../shared/utils/method-selection.utils';
import { normalizeGearId, satisfiesGearRequirement } from '../shared/utils/gear-mapping.utils';
import { isTestOrPlaceholderExercise } from '../shared/utils/test-exercise.utils';
import { rederiveVolumeForSwappedExercise } from './workout-budgeting.utils';
import type { PullGapMode } from '../services/split-decision/why-this-workout';

export const isPull = (ex: Exercise | undefined) => !!ex && isOnStrictFocus(ex, ['pull']);
const isMainRole = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';
/** Areas the focus balance tracks (skills fold to their parent in strictDomainsOfExercise). */
const AREAS = ['push', 'pull', 'legs', 'core'] as const;
export const areaOf = (ex: Exercise): string | undefined => strictDomainsOfExercise(ex).find((d) => (AREAS as readonly string[]).includes(d));

/** Gear that makes real pulling possible (a bar, rings, TRX, a band). */
const PULL_GEAR = ['pullup_bar', 'rings', 'trx', 'resistance_bands'];
export function hasPullGear(availableEquipment: readonly string[]): boolean {
  const avail = availableEquipment.map(normalizeGearId);
  return PULL_GEAR.some((g) => satisfiesGearRequirement(g, avail));
}

export interface PullGapFocus {
  /** The day's strict focus domains (null = the pool already is the focus). */
  domains: string[] | null;
  /** The domains the day trains ('upper' → push + pull). */
  focusDomains: readonly string[];
}

/**
 * Pipeline step. Returns the strict domains to use and whether the day has a pull gap
 * (wants pull, the session pool has none). No gap → unchanged.
 */
export function widenFocusForPullGap(
  focus: PullGapFocus,
  pool: ReadonlyArray<{ exercise: Exercise }>,
): { domains: string[] | null; gap: boolean } {
  if (!focus.focusDomains.includes('pull')) return { domains: focus.domains, gap: false };
  if (pool.some((s) => isPull(s.exercise))) return { domains: focus.domains, gap: false };
  const base = focus.domains ?? [...focus.focusDomains];
  const hasCore = pool.some((s) => isOnStrictFocus(s.exercise, ['core']));
  if (!hasCore || base.includes('core')) return { domains: focus.domains, gap: true };
  return { domains: [...base, 'core'], gap: true };
}

export type Cand = { ex: Exercise; method: ExecutionMethod; delta: number; level: number; source: 'pool' | 'catalog' | 'stopgap' };

export function usableIn(workout: GeneratedWorkout) {
  const inPlan = new Set(workout.exercises.map((e) => e.exercise.id));
  const bases = new Set(workout.exercises.map((e) => e.exercise.base_movement_id).filter((b) => b && b !== 'unspecified_movement'));
  return (ex: Exercise) =>
    !inPlan.has(ex.id) && !isTestOrPlaceholderExercise(ex)
    && !(ex.base_movement_id && bases.has(ex.base_movement_id))
    && ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown'
    && ex.exerciseRole !== 'recovery' && ex.exerciseRole !== 'reinforcement';
}

export function fitting(list: Exercise[], opts: NeverEmptyOptions, source: Cand['source'], minDelta: number, maxDelta: number): Cand[] {
  return list.flatMap((ex) => {
    const method = selectMethodForContext(ex, opts.location, opts.availableEquipment);
    if (!method || !methodFits(method, opts.location, opts.availableEquipment)) return [];
    const { delta, level } = levelOf(ex, opts);
    return delta >= minDelta && delta <= maxDelta ? [{ ex, method, delta, level, source }] : [];
  }).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.delta - b.delta);
}

/** The best exercise for `area`: session pool (level −3…+1) → for pull: catalog (≤ user level) → stopgaps. */
export function findAreaCandidate(workout: GeneratedWorkout, opts: NeverEmptyOptions, area: string): Cand | null {
  const usable = usableIn(workout);
  const onArea = (ex: Exercise) => usable(ex) && isOnStrictFocus(ex, [area]);
  const fromPool = fitting(opts.pool.filter(onArea), opts, 'pool', -3, 1);
  if (fromPool.length) return fromPool[0];
  if (area !== 'pull') return null;
  const fromCatalog = fitting(opts.allExercises.filter(onArea), opts, 'catalog', -Infinity, 0);
  if (fromCatalog.length) return fromCatalog[0];
  const stopgaps = opts.allExercises
    .filter((ex) => UNTAGGED_GEAR_FREE_PULLS[ex.id] && usable(ex))
    .map((ex) => ({ ...ex, movementGroup: UNTAGGED_GEAR_FREE_PULLS[ex.id] } as Exercise));
  return fitting(stopgaps, opts, 'stopgap', -Infinity, 0)[0] ?? null;
}

function toWorkoutExercise(c: Cand, opts: NeverEmptyOptions, sets: number): WorkoutExercise {
  const d = rederiveVolumeForSwappedExercise(c.ex, c.delta, opts.difficulty, undefined, undefined, opts.progressionPolicy);
  return {
    exercise: c.ex, method: c.method, mechanicalType: d.mechanicalType,
    sets: Math.max(2, sets), reps: d.reps, repsRange: d.repsRange, isTimeBased: d.isTimeBased, restSeconds: d.restSeconds,
    priority: 'compound', score: 0, reasoning: [`focus_balance:${c.source}(L${c.level},delta=${c.delta})`],
    exerciseRole: 'main', tier: d.tier, programLevel: c.level, levelDelta: c.delta, isOverLevel: c.delta > 0,
  } as WorkoutExercise;
}

/**
 * Per-option step (after the strict pass). Adds one exercise for every focus area the
 * main block misses, swapping out the last plain exercise of the most-repeated area
 * (≥ 2 of it) or inserting before the cool-down. Returns / stamps `workout.pullGap`
 * when the day wants pull and there is no pull gear here; null otherwise.
 */
export function balanceFocusAreas(
  workout: GeneratedWorkout,
  opts: NeverEmptyOptions,
  focusDomains: readonly string[],
): PullGapMode | null {
  const mains = () => workout.exercises.filter(isMainRole);
  if (mains().length === 0) return null; // the never-empty rescue owns an empty block
  const added: string[] = [];

  for (const area of focusDomains) {
    if (!(AREAS as readonly string[]).includes(area)) continue;
    if (mains().some((e) => isOnStrictFocus(e.exercise, [area]))) continue;
    const c = findAreaCandidate(workout, opts, area);
    if (!c) continue;
    const counts = new Map<string, number>();
    for (const e of mains()) { const a = areaOf(e.exercise); if (a) counts.set(a, (counts.get(a) ?? 0) + 1); }
    const [topArea, topCount] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
    const victims = workout.exercises
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => isMainRole(e) && !e.protocolBlock && !e.pairedWith && areaOf(e.exercise) === topArea);
    if (topCount >= 2 && victims.length) {
      const { e: old, i } = victims[victims.length - 1];
      workout.exercises = [...workout.exercises.slice(0, i), toWorkoutExercise(c, opts, old.sets ?? 2), ...workout.exercises.slice(i + 1)];
    } else {
      const cd = workout.exercises.findIndex((e) => e.exerciseRole === 'cooldown');
      const at = cd >= 0 ? cd : workout.exercises.length;
      workout.exercises = [...workout.exercises.slice(0, at), toWorkoutExercise(c, opts, 2), ...workout.exercises.slice(at)];
    }
    added.push(`${area}:${c.ex.id}(${c.source})`);
  }

  let mode: PullGapMode | null = null;
  if (focusDomains.includes('pull') && !hasPullGear(opts.availableEquipment)) {
    const m = mains();
    mode = m.some((e) => isPull(e.exercise)) ? 'bodyweight_pull'
      : m.some((e) => isOnStrictFocus(e.exercise, ['core'])) ? 'core' : 'push_only';
    workout.pullGap = mode;
  }
  if (added.length || mode) {
    workout.pipelineLog = [...(workout.pipelineLog ?? []), `focus_balance: ${added.join(', ') || 'nothing added'}${mode ? ` · pull_gap=${mode}` : ''}`];
  }
  return mode;
}
