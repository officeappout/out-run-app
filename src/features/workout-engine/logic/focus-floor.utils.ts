/**
 * focus-floor.utils.ts — a day-focus session (enable_home_v2) still reaches the
 * duration's minimum main-exercise count (H3) when the focus pool is thin. Pure.
 *
 * Found by the v2 generator QA matrix (#591): a pull day at home without a bar
 * (PPL / upper_body pool), levels 16–20, shipped 1–3 exercises for 20–45 min — the
 * pool has 2–3 gear-free rows, so `widenFocusForPullGap` (core only when NO pull
 * exists) never widened and `topUpVarietyReserve` (pool, level −3…+1, on focus)
 * found nothing more. Same shape on a L20 push day at home without gear.
 *
 * Runs per option after `topUpVarietyReserve`, only when the day has a focus.
 * Adds reserve candidates (enforceVolumeCap's Phase V inserts them at the set floor):
 *   - the day's focus areas — session pool (−3…+1), then gear-free catalog
 *     progressions at or below the user's level (closest level first), and for pull
 *     the untagged gear-free stopgaps;
 *   - core only where the day already allows it: a focus that includes core, or a
 *     pull day without pull gear (the pull-gap path — the "why" line says so);
 *   - never push on a day whose focus has no push.
 * Least-represented allowed area first, so a 2-row pull day becomes rows + core.
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from './workout-generator.types';
import { UNTAGGED_GEAR_FREE_PULLS, type NeverEmptyOptions } from './never-empty.utils';
import { areaOf, fitting, hasPullGear, type Cand } from './pull-gap.utils';
import { isOnStrictFocus } from './strict-focus.utils';
import { isTestOrPlaceholderExercise } from '../shared/utils/test-exercise.utils';
import { rederiveVolumeForSwappedExercise } from './workout-budgeting.utils';

const AREAS = ['push', 'pull', 'legs', 'core'] as const;
const isMainRole = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';

/** The areas a focus day may be topped up with (focus areas, + core on a gear-free pull day). */
export function focusFloorAreas(focusAreas: readonly string[], availableEquipment: readonly string[]): string[] {
  const areas = focusAreas.filter((a) => (AREAS as readonly string[]).includes(a));
  if (!areas.includes('core') && areas.includes('pull') && !hasPullGear(availableEquipment)) areas.push('core');
  return areas;
}

/** Returns how many reserve candidates it added (0 when the floor is already reachable). */
export function topUpFocusDayReserve(
  workout: GeneratedWorkout,
  opts: NeverEmptyOptions,
  focusAreas: readonly string[],
): number {
  const mains = workout.exercises.filter(isMainRole);
  const reserve = workout.reserveExercises ?? [];
  let need = opts.minMain - mains.length - reserve.length;
  if (mains.length === 0 || need <= 0) return 0;

  const areas = focusFloorAreas(focusAreas, opts.availableEquipment);
  if (!areas.length) return 0;
  const all = [...workout.exercises, ...reserve];
  const taken = new Set(all.map((e) => e.exercise.id));
  const bases = new Set(all.map((e) => e.exercise.base_movement_id).filter((b): b is string => !!b && b !== 'unspecified_movement'));
  const usable = (ex: Exercise) =>
    !taken.has(ex.id) && !isTestOrPlaceholderExercise(ex)
    && !(ex.base_movement_id && bases.has(ex.base_movement_id))
    && ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown'
    && ex.exerciseRole !== 'recovery' && ex.exerciseRole !== 'reinforcement';

  const count = new Map<string, number>(areas.map((a) => [a, 0]));
  for (const e of [...mains, ...reserve]) {
    const a = areaOf(e.exercise);
    if (a && count.has(a)) count.set(a, (count.get(a) ?? 0) + 1);
  }

  const candidatesFor = (area: string): Cand[] => {
    const onArea = (ex: Exercise) => usable(ex) && isOnStrictFocus(ex, [area]);
    const fromPool = fitting(opts.pool.filter(onArea), opts, 'pool', -3, 1);
    if (fromPool.length) return fromPool;
    const fromCatalog = fitting(opts.allExercises.filter(onArea), opts, 'catalog', -Infinity, 0);
    if (fromCatalog.length || area !== 'pull') return fromCatalog;
    const stopgaps = opts.allExercises
      .filter((ex) => UNTAGGED_GEAR_FREE_PULLS[ex.id] && usable(ex))
      .map((ex) => ({ ...ex, movementGroup: UNTAGGED_GEAR_FREE_PULLS[ex.id] } as Exercise));
    return fitting(stopgaps, opts, 'stopgap', -Infinity, 0);
  };

  const added: WorkoutExercise[] = [];
  const exhausted = new Set<string>();
  while (need > 0 && exhausted.size < areas.length) {
    const area = areas
      .filter((a) => !exhausted.has(a))
      .sort((a, b) => (count.get(a) ?? 0) - (count.get(b) ?? 0))[0];
    const c = candidatesFor(area)[0];
    if (!c) { exhausted.add(area); continue; }
    taken.add(c.ex.id);
    if (c.ex.base_movement_id && c.ex.base_movement_id !== 'unspecified_movement') bases.add(c.ex.base_movement_id);
    const d = rederiveVolumeForSwappedExercise(c.ex, c.delta, opts.difficulty);
    added.push({
      exercise: c.ex, method: c.method, mechanicalType: d.mechanicalType,
      sets: 2, reps: d.reps, repsRange: d.repsRange, isTimeBased: d.isTimeBased, restSeconds: d.restSeconds,
      priority: 'compound', score: 0, reasoning: [`focus_floor:${area}:${c.source}(L${c.level},delta=${c.delta})`],
      exerciseRole: 'main', tier: d.tier, programLevel: c.level, levelDelta: c.delta, isOverLevel: c.delta > 0,
    } as WorkoutExercise);
    count.set(area, (count.get(area) ?? 0) + 1);
    need--;
  }
  if (added.length) {
    workout.reserveExercises = [...reserve, ...added];
    workout.pipelineLog = [...(workout.pipelineLog ?? []), `focus_floor: +${added.length} (${added.map((e) => e.reasoning[0].split(':')[1]).join(', ')})`];
  }
  return added.length;
}
