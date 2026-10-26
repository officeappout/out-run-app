/**
 * plan-location-swap — the DRY-RUN half of a location switch (enable_location_gate_v1).
 *
 * Resolves every slot of the workout for `newLocation` WITHOUT touching anything: the result carries the
 * would-be entries, the system-swap log rows, the counts and the coverage verdict. The apply step
 * (finalize-swap) only runs on a plan whose coverage is allowed. No I/O here — everything async or
 * Firestore-backed arrives through `SwapPlanDeps`, so it is unit-testable.
 *
 * Per slot (the legacy null-rule, with the media/replacement rules tightened):
 *   0. pyramid → out of scope: kept + marked, NOT counted.
 *   C. cool-down, when a follow-along cool-down VIDEO is filmed for the new location
 *      (cooldown-guide.utils) → the first cool-down slot becomes that video (two for a full-body
 *      workout: upper, then lower), the rest are dropped — the same cool-down the generator builds
 *      there (owner 26.10). Counted as resolved.
 *   F. warm-up / cool-down follow-along guide → keep if it covers the location, else a pool guide of the
 *      SAME role that does (with media; never a recovery session / tabata clip, never a test doc);
 *      otherwise keep (location-agnostic clip). Counted as resolved.
 *   1. the exercise's own method at the new location has media (video OR image) → swap the method.
 *   2. a rules-checked replacement (replacement-rules.util) → swap the exercise.
 *   3. nothing → warm-up/cool-down omitted (collapse-guard restores an emptied block), main kept +
 *      marked. Counted as uncovered. (No "swap to a media-less method" step any more.)
 */
import type { Exercise, ExecutionLocation, ExecutionMethod } from '@/features/content/exercises';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { AlternativeExerciseOption } from '@/features/workout-engine/generator/services/exercise-replacement.service';
import { deriveSwappedEntry } from '../utils/derive-swapped-entry.util';
import { healPairedLinks, restoreCollapsedRoles } from '../utils/swap-entries.util';
import { computeLocationCoverage, type CoverageResult, type CoverageSlot } from './location-coverage.util';
import { LOCATION_GATE_DEFAULTS, type LocationGateConfig } from './location-gate.config';
import { methodHasAnyMedia } from '@/features/workout-engine/shared/utils/method-media.utils';
import { slotRulesFor, buildCandidateFilter, pickReplacement, type SlotRules } from './replacement-rules.util';
import { cooldownGuideSeconds, pickCooldownGuides } from '@/features/workout-engine/services/cooldown-guide.utils';
import { isTestOrPlaceholderExercise } from '@/features/workout-engine/shared/utils/test-exercise.utils';

export interface SwapPlanDeps {
  hasLocation(ex: Exercise, location: ExecutionLocation): boolean;
  selectMethod(ex: Exercise, location: ExecutionLocation): ExecutionMethod | null;
  /** Candidates for a slot (family query for pinned slots, movement-group query otherwise), already
   *  passed through `filter` and uncapped. */
  findCandidates(
    we: WorkoutExercise,
    rules: SlotRules,
    exclude: ReadonlySet<string>,
    filter: ReturnType<typeof buildCandidateFilter>,
  ): Promise<AlternativeExerciseOption[]>;
  pool: readonly Exercise[];
}

export interface PlannedSystemSwap {
  from: WorkoutExercise;
  to: Exercise;
  direction?: 'lower' | 'same' | 'higher';
  toLevel?: number;
}

export interface LocationSwapPlan {
  location: ExecutionLocation;
  entries: WorkoutExercise[];
  systemSwaps: PlannedSystemSwap[];
  counts: { swappedMethod: number; swappedExercise: number; keptMarked: number };
  slots: CoverageSlot[];
  coverage: CoverageResult;
}

export async function planLocationSwap(
  exercises: readonly WorkoutExercise[],
  location: ExecutionLocation,
  deps: SwapPlanDeps,
  config: LocationGateConfig = LOCATION_GATE_DEFAULTS,
): Promise<LocationSwapPlan> {
  const exclude = new Set<string>(exercises.map((e) => e.exercise.id));
  const oldToNew = new Map<string, string>();
  const newEntries: WorkoutExercise[] = [];
  const systemSwaps: PlannedSystemSwap[] = [];
  const omittedSupplemental: WorkoutExercise[] = [];
  const slots: CoverageSlot[] = [];
  const counts = { swappedMethod: 0, swappedExercise: 0, keptMarked: 0 };
  // C) the cool-down video(s) for the new location, if filmed there — by the workout's body focus.
  const mains = exercises
    .filter((we) => we.exerciseRole !== 'warmup' && we.exerciseRole !== 'cooldown')
    .map((we) => we.exercise);
  const cooldownGuides = pickCooldownGuides(deps.pool, location, mains);
  let cooldownGuidePlaced = false;

  for (const we of exercises) {
    const role = we.exerciseRole;
    const isSupplemental = role === 'warmup' || role === 'cooldown';
    const kind: CoverageSlot['kind'] = role === 'warmup' ? 'warmup' : role === 'cooldown' ? 'cooldown' : 'main';
    const rules = slotRulesFor(we);
    const slot = (resolved: boolean) => slots.push({ kind, pinned: rules.pinned && !isSupplemental, resolved });

    // C) cool-down video(s): the first cool-down slot becomes the video(s), the others are dropped.
    if (role === 'cooldown' && cooldownGuides.length > 0) {
      slot(true);
      if (cooldownGuidePlaced) continue;
      cooldownGuidePlaced = true;
      for (const g of cooldownGuides) {
        const seconds = cooldownGuideSeconds(g.method);
        const timed = { sets: 1, reps: seconds, repsRange: undefined, isTimeBased: true };
        if (we.exercise.id === g.exercise.id) {
          newEntries.push({ ...we, method: g.method as WorkoutExercise['method'], ...timed });
          continue;
        }
        newEntries.push({ ...deriveSwappedEntry(we, g.exercise, g.method), ...timed });
        systemSwaps.push({ from: we, to: g.exercise });
        exclude.add(g.exercise.id);
        if (!oldToNew.has(we.exercise.id)) oldToNew.set(we.exercise.id, g.exercise.id);
        counts.swappedExercise++;
      }
      continue;
    }

    // F) follow-along guide
    const methodCount = (we.exercise.execution_methods ?? we.exercise.executionMethods ?? []).length;
    if (isSupplemental && we.exercise.isFollowAlong === true && methodCount <= 1) {
      if (!deps.hasLocation(we.exercise, location)) {
        const guide = deps.pool.find(
          (ex) =>
            ex.isFollowAlong === true &&
            ex.exerciseRole === role &&
            !isTestOrPlaceholderExercise(ex) &&
            !exclude.has(ex.id) &&
            deps.hasLocation(ex, location),
        );
        const guideMethod = guide ? deps.selectMethod(guide, location) : null;
        if (guide && guideMethod && methodHasAnyMedia(guideMethod)) {
          newEntries.push(deriveSwappedEntry(we, guide, guideMethod));
          systemSwaps.push({ from: we, to: guide });
          exclude.add(guide.id);
          oldToNew.set(we.exercise.id, guide.id);
          counts.swappedExercise++;
          slot(true);
          continue;
        }
      }
      newEntries.push(we);
      slot(true);
      continue;
    }

    // 0) pyramid — out of scope (injection is off): kept as one unit, marked, not counted.
    if (Array.isArray(we.pyramidSequence) && we.pyramidSequence.length > 0) {
      newEntries.push({ ...we, dimensionUnavailable: { dimension: 'location', value: location } });
      counts.keptMarked++;
      continue;
    }

    // 1) own method at the new location with media
    const m = deps.selectMethod(we.exercise, location);
    if (deps.hasLocation(we.exercise, location) && m && methodHasAnyMedia(m)) {
      newEntries.push(deriveSwappedEntry(we, we.exercise, m));
      counts.swappedMethod++;
      slot(true);
      continue;
    }

    // 2) rules-checked replacement
    const options = await deps.findCandidates(we, rules, exclude, buildCandidateFilter(rules));
    const pick = pickReplacement(options, rules);
    if (pick && pick.selectedExecutionMethod) {
      newEntries.push(deriveSwappedEntry(we, pick.exercise, pick.selectedExecutionMethod));
      systemSwaps.push({
        from: we,
        to: pick.exercise,
        direction: pick.levelComparison,
        ...(typeof pick.resolvedLevel === 'number' ? { toLevel: pick.resolvedLevel } : {}),
      });
      exclude.add(pick.exercise.id);
      oldToNew.set(we.exercise.id, pick.exercise.id);
      counts.swappedExercise++;
      slot(true);
      continue;
    }

    // 3) uncovered
    slot(false);
    if (isSupplemental) {
      omittedSupplemental.push(we);
      continue;
    }
    newEntries.push({ ...we, dimensionUnavailable: { dimension: 'location', value: location } });
    counts.keptMarked++;
  }

  restoreCollapsedRoles(newEntries, omittedSupplemental);
  const entries = healPairedLinks(newEntries, oldToNew);
  return { location, entries, systemSwaps, counts, slots, coverage: computeLocationCoverage(slots, config) };
}
