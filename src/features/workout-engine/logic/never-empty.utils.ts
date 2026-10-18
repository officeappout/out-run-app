/**
 * never-empty.utils.ts — a generated strength workout never ships with 0 main
 * exercises silently (generator QA round 1, 2026-10-18 — 05-BENCHMARK §6.4 #10).
 *
 * Found: builder, home without gear, "back" chip, L10 → 0 main exercises and no
 * message. No gear-free pull exercise exists inside the user's level window (every
 * tagged pull needs a bar / rings / band / park rig), the selection honestly found
 * nothing on focus, and nothing downstream noticed.
 *
 * Rescue, in order — always within the session's location + gear, test docs excluded:
 *   1. on-focus exercises from the session's context-filtered pool at ANY level up to
 *      the user's (closest first — "lower-level pull variants");
 *   2. on-focus exercises from the whole catalog with a method this location + gear
 *      allows (same level rule);
 *   3. catalog-gap stopgaps: real, filmed gear-free pulls whose docs have no
 *      movementGroup yet (towel pulldown, reverse table row) — stamped with the
 *      movementGroup they train, until the catalog tags them;
 *   4. nothing on focus at all → the closest gear-free work in ANY area.
 * Every rescue sets `focusFallbackNote` (Hebrew, user-facing) so the UI / coach can
 * say why the session differs from the request.
 */
import type { Exercise, ExecutionLocation, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import type { DifficultyLevel, GeneratedWorkout, WorkoutExercise } from './workout-generator.types';
import { MG_TO_DOMAIN, collectMethodGear } from '../shared/constants/domain-mapping.constants';
import { normalizeGearId, satisfiesGearRequirement, isGearOptional, ASSUMED_HOME_GEAR } from '../shared/utils/gear-mapping.utils';
import { selectMethodForContext } from '../shared/utils/method-selection.utils';
import { isTestOrPlaceholderExercise } from '../shared/utils/test-exercise.utils';
import { rederiveVolumeForSwappedExercise } from './workout-budgeting.utils';
import { resolveExerciseLevelForDomains, DOMAIN_RESOLUTION_SKILL_PARENT_MAP } from './workout-selection.utils';
import { isOnStrictFocus } from './strict-focus.utils';

/**
 * Catalog-gap stopgap (rescue tier 3): gear-free pull movements whose catalog docs
 * carry no movementGroup — so no pool, quota or strict-focus check can see them as
 * "pull". Remove an entry once its doc is tagged in the admin.
 */
export const UNTAGGED_GEAR_FREE_PULLS: Readonly<Record<string, string>> = {
  vUt6DeXfFk9zvRO5IQza: 'vertical_pull',   // "פולי עליון על הריצפה עם מגבת" (towel)
  RxpMhnXQBW80jq1no41f: 'horizontal_pull', // "שולחן הפוך" (reverse table row, L1)
};

const SURFACES = new Set(['mat', 'yoga_mat', 'wall', 'chair', 'bodyweight', 'none', 'floor']);
const DOMAIN_HE: Record<string, string> = { push: 'דחיפה', pull: 'גב ומשיכה', legs: 'רגליים', core: 'בטן וליבה' };

export interface NeverEmptyOptions {
  /** Session pool after location / gear / injury filtering (globalExercisePool). */
  pool: Exercise[];
  /** Whole catalog (test docs are excluded here regardless). */
  allExercises: Exercise[];
  location: ExecutionLocation;
  availableEquipment: string[];
  userProgramLevels: Map<string, number>;
  requiredDomains?: string[];
  strict?: boolean;
  minMain: number;
  difficulty: DifficultyLevel;
  activeProgramId?: string;
}

function methodFits(method: ExecutionMethod | null | undefined, location: ExecutionLocation, available: string[]): boolean {
  if (!method) return false;
  const indoor = location === 'home' || location === 'office' || location === 'school';
  const avail = [...available.map(normalizeGearId), ...(indoor ? Array.from(ASSUMED_HOME_GEAR) : [])];
  return collectMethodGear(method as Parameters<typeof collectMethodGear>[0])
    .filter(id => !SURFACES.has(id) && !SURFACES.has(normalizeGearId(id)) && !isGearOptional(id))
    .every(id => satisfiesGearRequirement(normalizeGearId(id), avail));
}

/** Domain + level delta for a candidate (user level for its own area). */
function levelOf(ex: Exercise, opts: NeverEmptyOptions): { domain?: string; delta: number; level: number } {
  const mg = ex.movementGroup as string | undefined;
  const raw = mg ? MG_TO_DOMAIN[mg] : undefined;
  const domain = raw ? (DOMAIN_RESOLUTION_SKILL_PARENT_MAP[raw] ?? raw) : undefined;
  const { level, resolvedDomain } = resolveExerciseLevelForDomains(ex, undefined, opts.activeProgramId);
  const userLvl = (resolvedDomain ? opts.userProgramLevels.get(resolvedDomain) : undefined)
    ?? (domain ? opts.userProgramLevels.get(domain) : undefined)
    ?? (opts.userProgramLevels.size ? Math.max(...Array.from(opts.userProgramLevels.values())) : level);
  return { domain, delta: level - userLvl, level };
}

/**
 * Fills an EMPTY main block (0 main exercises) and returns the note it set, or null
 * when the workout already had main work (or nothing at all could be found — then
 * the caller's honest empty / rest-day handling stands).
 */
export function rescueEmptyMainBlock(workout: GeneratedWorkout, opts: NeverEmptyOptions): string | null {
  const isMain = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';
  if (workout.exercises.some(isMain)) return null;

  const focus = opts.strict && opts.requiredDomains?.length ? opts.requiredDomains : undefined;
  const inPlan = new Set(workout.exercises.map(e => e.exercise.id));
  const usable = (ex: Exercise) =>
    !inPlan.has(ex.id) && !isTestOrPlaceholderExercise(ex)
    && ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown'
    && ex.exerciseRole !== 'recovery' && ex.exerciseRole !== 'reinforcement';

  type Cand = { ex: Exercise; method: ExecutionMethod; delta: number; level: number };
  const rank = (cands: Cand[]) =>
    cands
      .filter(c => c.delta <= 0) // at or below the user's level — never above (H4)
      .sort((a, b) => b.delta - a.delta || a.level - b.level);
  const fromList = (list: Exercise[], onFocus: (ex: Exercise) => boolean): Cand[] =>
    rank(list.filter(ex => usable(ex) && !!ex.movementGroup && onFocus(ex)).flatMap(ex => {
      const method = selectMethodForContext(ex, opts.location, opts.availableEquipment);
      if (!method || !methodFits(method, opts.location, opts.availableEquipment)) return [];
      const { delta, level } = levelOf(ex, opts);
      return [{ ex, method, delta, level }];
    }));

  const onFocus = (ex: Exercise) => !focus || isOnStrictFocus(ex, focus);
  let picked = fromList(opts.pool, onFocus);
  let tier = 'pool';
  if (!picked.length) { picked = fromList(opts.allExercises, onFocus); tier = 'catalog'; }
  if (!picked.length && (!focus || focus.includes('pull'))) {
    const stopgaps = opts.allExercises
      .filter(ex => UNTAGGED_GEAR_FREE_PULLS[ex.id] && usable(ex))
      .map(ex => ({ ...ex, movementGroup: UNTAGGED_GEAR_FREE_PULLS[ex.id] } as Exercise));
    picked = fromList(stopgaps, () => true);
    tier = 'catalog_gap_stopgap';
  }
  let offFocus = false;
  if (!picked.length) {
    picked = fromList(opts.pool, () => true);
    tier = 'any_area';
    offFocus = !!focus;
  }
  if (!picked.length) return null;

  const take = picked.slice(0, Math.max(1, opts.minMain));
  const mains: WorkoutExercise[] = take.map(c => {
    const d = rederiveVolumeForSwappedExercise(c.ex, c.delta, opts.difficulty);
    return {
      exercise: c.ex,
      method: c.method,
      mechanicalType: d.mechanicalType,
      sets: 2,
      reps: d.reps,
      repsRange: d.repsRange,
      isTimeBased: d.isTimeBased,
      restSeconds: d.restSeconds,
      priority: 'compound',
      score: 0,
      reasoning: [`never_empty_rescue:${tier}(L${c.level},delta=${c.delta})`],
      exerciseRole: 'main',
      tier: d.tier,
      programLevel: c.level,
      levelDelta: c.delta,
      isOverLevel: false,
    } as WorkoutExercise;
  });
  // Main block sits between the warm-up and the cool-down.
  const firstCooldown = workout.exercises.findIndex(e => e.exerciseRole === 'cooldown');
  const at = firstCooldown >= 0 ? firstCooldown : workout.exercises.length;
  workout.exercises = [...workout.exercises.slice(0, at), ...mains, ...workout.exercises.slice(at)];

  const areas = (focus ?? []).map(d => DOMAIN_HE[d] ?? d).join(' / ');
  const note = offFocus
    ? `לא מצאנו תרגילי ${areas} שמתאימים לציוד ולמיקום שלך — בנינו אימון קרוב ככל האפשר. הוספת ציוד (למשל מתח לדלת או גומייה) תפתח תרגילים מתאימים.`
    : focus
      ? `אין תרגילי ${areas} ברמה שלך בלי ציוד נוסף — בחרנו את הגרסאות הקרובות ביותר שאפשר לעשות כאן.`
      : 'לא נמצאו תרגילים ברמה שלך לציוד ולמיקום האלה — בחרנו את הגרסאות הקרובות ביותר.';
  workout.focusFallbackNote = note;
  workout.pipelineLog = [...(workout.pipelineLog ?? []), `never_empty_rescue: ${mains.length} via ${tier}${offFocus ? ' (off focus)' : ''}`];
  return note;
}

/**
 * Variety top-up for enforceVolumeCap's Phase V (H3): when the main block is below
 * the duration's minimum and WorkoutGenerator's 5-deep reserve can't cover it, add
 * further candidates from the session pool to `workout.reserveExercises` — on focus
 * for strict requests, levelDelta in [−3, +1], a method this location + gear allows,
 * areas the session has least of first. Phase V then adds them at the set floor and
 * the trim phases (sets → rest → exercises) keep the time. Returns how many it added.
 */
export function topUpVarietyReserve(workout: GeneratedWorkout, opts: NeverEmptyOptions): number {
  const isMain = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';
  const mains = workout.exercises.filter(isMain);
  const need = opts.minMain - mains.length - (workout.reserveExercises?.length ?? 0);
  if (mains.length === 0 || need <= 0) return 0;
  const focus = opts.strict && opts.requiredDomains?.length ? opts.requiredDomains : undefined;
  const taken = new Set([...workout.exercises, ...(workout.reserveExercises ?? [])].map(e => e.exercise.id));
  const baseIds = new Set([...workout.exercises, ...(workout.reserveExercises ?? [])].map(e => e.exercise.base_movement_id).filter(b => b && b !== 'unspecified_movement'));
  const areaCount = new Map<string, number>();
  for (const e of mains) {
    const d = levelOf(e.exercise, opts).domain;
    if (d) areaCount.set(d, (areaCount.get(d) ?? 0) + 1);
  }
  const cands = opts.pool
    .filter(ex => !taken.has(ex.id) && !isTestOrPlaceholderExercise(ex) && !!ex.movementGroup
      && ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown'
      && ex.exerciseRole !== 'recovery' && ex.exerciseRole !== 'reinforcement'
      && !(ex.base_movement_id && baseIds.has(ex.base_movement_id))
      && (!focus || isOnStrictFocus(ex, focus)))
    .flatMap(ex => {
      const method = selectMethodForContext(ex, opts.location, opts.availableEquipment);
      if (!method || !methodFits(method, opts.location, opts.availableEquipment)) return [];
      const { domain, delta, level } = levelOf(ex, opts);
      if (delta < -3 || delta > 1) return [];
      return [{ ex, method, domain, delta, level }];
    })
    .sort((a, b) =>
      (areaCount.get(a.domain ?? '') ?? 0) - (areaCount.get(b.domain ?? '') ?? 0)
      || Math.abs(a.delta) - Math.abs(b.delta) || a.delta - b.delta);
  const added: WorkoutExercise[] = [];
  for (const c of cands) {
    if (added.length >= need) break;
    if (c.ex.base_movement_id && c.ex.base_movement_id !== 'unspecified_movement') {
      if (baseIds.has(c.ex.base_movement_id)) continue;
      baseIds.add(c.ex.base_movement_id);
    }
    const d = rederiveVolumeForSwappedExercise(c.ex, c.delta, opts.difficulty);
    added.push({
      exercise: c.ex, method: c.method, mechanicalType: d.mechanicalType,
      sets: 2, reps: d.reps, repsRange: d.repsRange, isTimeBased: d.isTimeBased, restSeconds: d.restSeconds,
      priority: 'compound', score: 0, reasoning: [`variety_top_up:pool(L${c.level},delta=${c.delta})`],
      exerciseRole: 'main', tier: d.tier, programLevel: c.level, levelDelta: c.delta, isOverLevel: c.delta > 0,
    } as WorkoutExercise);
    if (c.domain) areaCount.set(c.domain, (areaCount.get(c.domain) ?? 0) + 1);
  }
  if (added.length) workout.reserveExercises = [...(workout.reserveExercises ?? []), ...added];
  return added.length;
}
