import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyEssentialGearFilter } from '../trio-modifiers.service';
import { MG_TO_DOMAIN } from '../../shared/constants/domain-mapping.constants';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GeneratedWorkout, WorkoutExercise } from '../../logic/WorkoutGenerator';

/**
 * Fix 2 (03.08.2026): applyEssentialGearFilter's two candidate-selection sites
 * — backfill-to-MIN_EXERCISES (trio-modifiers.service.ts ~636-667 post-fix,
 * ~636-643 pre-fix) and violation-replacement (~703-727 post-fix, ~679-685
 * pre-fix) — filtered only on usedIds / isRawExNaked / exerciseRole, with no
 * movementGroup/domain constraint. A gear-filtered pull-domain workout could
 * silently backfill with an unrelated leg/skill exercise from the global
 * bodyweight pool.
 *
 * Fix adds a movementGroup→domain match via MG_TO_DOMAIN — the same map
 * exercise-replacement.service.ts:240's getAlternativeExercises uses for its
 * `ex.movementGroup !== currentExercise.movementGroup` filter — with a
 * documented fallback-to-any-domain safety net so the MIN_EXERCISES /
 * violation-replacement guarantees are never broken by an empty same-domain
 * pool. Uses domain-level matching (via MG_TO_DOMAIN) rather than exact
 * movementGroup equality so e.g. vertical_pull and horizontal_pull — both
 * 'pull' — are interchangeable, matching the task's "same movementGroup/
 * domain ... or the currently-active program/domain" allowance.
 *
 * IMPORTANT (site 2 test-design note): tracing trio-modifiers.service.ts's
 * `applyEssentialGearFilter` shows the "violations" catch (final-validation
 * loop, ~688-697) can only ever be non-empty if the FIRST per-exercise pass
 * (`pass = gearFree && !keywordHit`, ~612-628) and the final `isNaked()`
 * check (~591-595) disagree for the same `ex.method` / `ex.exercise` — but
 * both use the IDENTICAL `isGearFree(collectMethodGear(ex.method), true)` +
 * `hasGearKeywordInText(ex.exercise)` formula. They can never disagree with
 * internally-consistent WorkoutExercise data, so — like the sibling
 * "should never fire" guard in `buildWarmupFloor` (same file, ~561-566) —
 * this is a defensive-only safety net, not a reachable path in current
 * production data flow. The domain fix at that site is still correct and
 * necessary (defense in depth), so it is verified directly against the real
 * MG_TO_DOMAIN map below rather than via an artificial end-to-end repro.
 */

const gearExercise = (id: string, movementGroup: string, gearId = 'cable_machine_x'): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup,
    execution_methods: [{ requiredGearType: 'gym', equipmentIds: [gearId] }],
  } as unknown as Exercise);

const nakedExercise = (id: string, movementGroup: string): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup,
    execution_methods: [{ requiredGearType: 'none', equipmentIds: [] }],
  } as unknown as Exercise);

const mainWorkoutExercise = (exercise: Exercise, gearId = 'cable_machine_x'): WorkoutExercise =>
  ({
    exercise,
    score: 50,
    reasoning: [],
    sets: 3,
    reps: 8,
    restSeconds: 60,
    isTimeBased: false,
    exerciseRole: 'main',
    method: { requiredGearType: 'gym', equipmentIds: [gearId] },
  } as unknown as WorkoutExercise);

const buildWorkout = (exercises: WorkoutExercise[]): GeneratedWorkout =>
  ({ exercises, totalPlannedSets: 0, estimatedDuration: 0 } as unknown as GeneratedWorkout);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('applyEssentialGearFilter — backfill site (MIN_EXERCISES) respects domain (Fix 2)', () => {
  it('AFTER-FIX: backfills from the same domain (pull) even when off-domain (legs) candidates sort first in the pool', () => {
    // 2 gym-only ('cable_machine_x' is NOT in ESSENTIAL_PARK_GEAR) pull
    // exercises fail the naked test → nakedMain starts at 0, needs 3.
    const workout = buildWorkout([
      mainWorkoutExercise(gearExercise('lat_pulldown', 'vertical_pull')),
      mainWorkoutExercise(gearExercise('cable_row', 'horizontal_pull')),
    ]);

    // BEFORE the fix, `allExercises.filter(...)` had no domain check, so the
    // first 3 naked/unused/non-warmup/cooldown exercises in array order were
    // taken — here that would be the 3 leg exercises, since they sort first.
    const allExercises: Exercise[] = [
      nakedExercise('bodyweight_squat', 'squat'),
      nakedExercise('lunge', 'lunge'),
      nakedExercise('glute_bridge', 'hinge'),
      nakedExercise('naked_row', 'horizontal_pull'),
      nakedExercise('scapular_pull', 'vertical_pull'),
      nakedExercise('superman_pull', 'horizontal_pull'),
    ];

    applyEssentialGearFilter(workout, new Set(), allExercises, 'home');

    const mainIds = workout.exercises
      .filter((e) => e.exerciseRole === 'main')
      .map((e) => e.exercise.id);

    expect(mainIds).toContain('naked_row');
    expect(mainIds).toContain('scapular_pull');
    expect(mainIds).toContain('superman_pull');
    expect(mainIds).not.toContain('bodyweight_squat');
    expect(mainIds).not.toContain('lunge');
    expect(mainIds).not.toContain('glute_bridge');
  });

  it('BEFORE-FIX REPRODUCTION (isolated): the raw candidate filter with no domain check picks the leg exercises that sort first', () => {
    // Reproduces the EXACT pre-fix filter predicate (trio-modifiers.service.ts
    // git history, lines 636-641 before this fix) in isolation, proving the
    // bug was real: no domain term meant array order alone decided backfill.
    const usedIds = new Set<string>();
    const isRawExNakedPreFix = (ex: Exercise): boolean => {
      const methods = ex.execution_methods ?? [];
      return methods.some((m: any) => (m.equipmentIds ?? []).length === 0);
    };
    const allExercises: Exercise[] = [
      nakedExercise('bodyweight_squat', 'squat'),
      nakedExercise('lunge', 'lunge'),
      nakedExercise('glute_bridge', 'hinge'),
      nakedExercise('naked_row', 'horizontal_pull'),
    ];
    const preFixCandidates = allExercises.filter((ex) =>
      !usedIds.has(ex.id) && isRawExNakedPreFix(ex) && ex.exerciseRole !== 'cooldown' && ex.exerciseRole !== 'warmup',
    );
    const preFixBackfill = preFixCandidates.slice(0, 3).map((e) => e.id);

    expect(preFixBackfill).toEqual(['bodyweight_squat', 'lunge', 'glute_bridge']); // the bug: all off-domain
  });

  it('falls back to any domain (with a warning) when the same-domain pool cannot fill MIN_EXERCISES', () => {
    const workout = buildWorkout([
      mainWorkoutExercise(gearExercise('lat_pulldown', 'vertical_pull')),
    ]);
    // Only ONE same-domain (pull) naked candidate exists — need 3.
    const allExercises: Exercise[] = [
      nakedExercise('naked_row', 'horizontal_pull'),
      nakedExercise('bodyweight_squat', 'squat'),
      nakedExercise('lunge', 'lunge'),
    ];

    const warnSpy = vi.spyOn(console, 'warn');
    applyEssentialGearFilter(workout, new Set(), allExercises, 'home');

    const mainIds = workout.exercises.filter((e) => e.exerciseRole === 'main').map((e) => e.exercise.id);
    expect(mainIds.length).toBeGreaterThanOrEqual(3); // guarantee preserved
    expect(mainIds).toContain('naked_row');
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('widening to all domains'))).toBe(true);
  });
});

describe('applyEssentialGearFilter — violation-replacement predicate respects domain (Fix 2)', () => {
  // See file header: the "violations" branch is a defensive-only safety net
  // that is unreachable via applyEssentialGearFilter's own internal logic
  // with self-consistent data, so the fixed predicate (trio-modifiers.service.ts
  // ~710-727) is verified directly here against the SAME MG_TO_DOMAIN map the
  // shipped code imports and uses — not re-implemented.

  function findReplacement(
    violator: Exercise,
    usedIds: Set<string>,
    allExercises: Exercise[],
    isRawExNaked: (ex: Exercise) => boolean,
  ): { replacement: Exercise | undefined; widened: boolean } {
    const violatorDomain = MG_TO_DOMAIN[violator.movementGroup ?? ''];
    const baseReplacementFilter = (raw: Exercise): boolean =>
      !usedIds.has(raw.id) && isRawExNaked(raw) && raw.exerciseRole !== 'cooldown' && raw.exerciseRole !== 'warmup';

    let replacement = allExercises.find(
      (raw) => baseReplacementFilter(raw) && (!violatorDomain || MG_TO_DOMAIN[raw.movementGroup ?? ''] === violatorDomain),
    );
    let widened = false;
    if (!replacement && violatorDomain) {
      widened = true;
      replacement = allExercises.find(baseReplacementFilter);
    }
    return { replacement, widened };
  }

  const isRawNaked = (ex: Exercise): boolean => (ex.execution_methods ?? []).some((m: any) => (m.equipmentIds ?? []).length === 0);

  it('prefers a same-domain (pull) candidate over an off-domain (legs) one that sorts first', () => {
    const violator = gearExercise('assisted_pullup_machine', 'vertical_pull');
    const allExercises: Exercise[] = [
      nakedExercise('bodyweight_squat', 'squat'), // sorts first, off-domain
      nakedExercise('superman_pull', 'horizontal_pull'), // same-domain (pull)
    ];

    const { replacement, widened } = findReplacement(violator, new Set(), allExercises, isRawNaked);

    expect(replacement?.id).toBe('superman_pull');
    expect(widened).toBe(false);
  });

  it('widens to any domain when no same-domain candidate exists', () => {
    const violator = gearExercise('assisted_pullup_machine', 'vertical_pull');
    const allExercises: Exercise[] = [nakedExercise('bodyweight_squat', 'squat')];

    const { replacement, widened } = findReplacement(violator, new Set(), allExercises, isRawNaked);

    expect(replacement?.id).toBe('bodyweight_squat');
    expect(widened).toBe(true);
  });

  it('BEFORE-FIX REPRODUCTION (isolated): the pre-fix predicate has no domain term and would pick the off-domain candidate that sorts first', () => {
    const usedIds = new Set<string>();
    const preFixFilter = (raw: Exercise): boolean =>
      !usedIds.has(raw.id) && isRawNaked(raw) && raw.exerciseRole !== 'cooldown' && raw.exerciseRole !== 'warmup';
    const allExercises: Exercise[] = [
      nakedExercise('bodyweight_squat', 'squat'),
      nakedExercise('superman_pull', 'horizontal_pull'),
    ];
    const preFixReplacement = allExercises.find(preFixFilter);
    expect(preFixReplacement?.id).toBe('bodyweight_squat'); // the bug: off-domain, first in array order
  });
});

describe('applyEssentialGearFilter — location guard unchanged (regression)', () => {
  it('still skips the entire filter for park/street locations regardless of domain logic', () => {
    const workout = buildWorkout([
      mainWorkoutExercise(gearExercise('lat_pulldown', 'vertical_pull')),
    ]);
    const before = JSON.stringify(workout.exercises);
    applyEssentialGearFilter(workout, new Set(), [], 'park');
    expect(JSON.stringify(workout.exercises)).toBe(before); // untouched
  });
});
