import { describe, it, expect } from 'vitest';
import { hasExplicitCoreLevel, matchesDomainForSlot, selectExercisesWithDomainQuotas } from '../workout-selection.utils';
import { exerciseMatchesProgram } from '../../services/shadow-level.utils';
import type { ScoredExercise } from '../contextual-engine.types';
import type { WorkoutGenerationContext } from '../workout-generator.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Core-slot gate (00-PLAN.md §12.3): an exercise fills the CORE domain slot
 * only if it has an explicit `targetPrograms` entry resolving to `'core'`.
 * `movementGroup: 'core'` alone (what `exerciseMatchesProgram` itself still
 * uses, unchanged) is not sufficient for SLOT ENTRY — see the doc comment on
 * `matchesDomainForSlot`/`hasExplicitCoreLevel` in workout-selection.utils.ts.
 *
 * These fixtures use real "flag" exercise shapes (movementGroup:'core',
 * targetPrograms on pull/push/human_flag, no core entry) — the exact pattern
 * confirmed live in the catalog for all 9 human_flag exercises and
 * "כפיפת ירך על הגבהה" (03-LEVEL-TRIAGE.md Part 1b3).
 *
 * DEPENDENCY (00-PLAN.md §14, "אזהרה"): this gate only works for exercises
 * that already have a real core level. The "real core exercise" fixtures
 * below simulate the state AFTER scripts/audit/apply-level-triage.ts has
 * been applied (03-LEVEL-TRIAGE.md Part 1b1/1b2) — without that migration,
 * even פלאנק/אופניים would be gated out too. See docs/workout-engine/03-CHANGES.md.
 */

function makeExercise(id: string, name: string, targetPrograms: { programId: string; level: number }[], overrides: Partial<any> = {}): Exercise {
  return {
    id,
    name: { he: name, en: name },
    movementGroup: 'core',
    primaryMuscle: 'abs',
    targetPrograms,
    ...overrides,
  } as any;
}

function scored(ex: Exercise, score = 10): ScoredExercise {
  // levelDiff: -1 matches difficulty=2 (Normal)'s exact selection band in
  // selectExercisesForDifficulty (workout-selection.utils.ts ~line 410-423) —
  // set explicitly on every fixture so the Tier-2 tests below isolate the
  // core-slot domain gate specifically, not an unrelated difficulty-band effect.
  return { exercise: ex, method: 'bodyweight' as any, score, reasoning: [], mechanicalType: 'none' as any, levelDiff: -1 } as any;
}

// The 9 real flag exercises, abstracted to their shared shape: movementGroup
// 'core', real pull+push+human_flag levels, NO core entry (verified live,
// 03-LEVEL-TRIAGE.md Part 1b3).
const FLAG_EXERCISE = makeExercise('flag-1', 'דגל אנושי', [
  { programId: 'pull', level: 21 },
  { programId: 'push', level: 21 },
  { programId: 'human_flag', level: 10 },
]);

// כפיפת ירך על הגבהה: movementGroup 'core', primaryMuscle 'quads', real legs
// level, no core entry (03-LEVEL-TRIAGE.md Part 1b1).
const HIP_FLEXION_EXERCISE = makeExercise('hip-flexion-1', 'כפיפת ירך על הגבהה', [{ programId: 'legs', level: 4 }], { primaryMuscle: 'quads' });

// A real core exercise (post-migration state — e.g. פלאנק after
// apply-level-triage.ts adds its core entry).
const REAL_CORE_EXERCISE = makeExercise('plank-1', 'פלאנק', [
  { programId: 'push', level: 2 },
  { programId: 'core', level: 2 },
]);

// ============================================================================
// Tier 1 — direct unit tests on the actual gate logic (precise, no confounds)
// ============================================================================

describe('hasExplicitCoreLevel / matchesDomainForSlot — the gate itself (00-PLAN.md §12.3)', () => {
  it('a flag exercise (pull/push/human_flag levels, no core entry) has NO explicit core level', () => {
    expect(hasExplicitCoreLevel(FLAG_EXERCISE)).toBe(false);
  });

  it('כפיפת ירך על הגבהה (legs level only) has NO explicit core level', () => {
    expect(hasExplicitCoreLevel(HIP_FLEXION_EXERCISE)).toBe(false);
  });

  it('a real core exercise (has a core targetPrograms entry) DOES have an explicit core level', () => {
    expect(hasExplicitCoreLevel(REAL_CORE_EXERCISE)).toBe(true);
  });

  it('matchesDomainForSlot rejects the flag exercise for domain=core, but exerciseMatchesProgram (unchanged) still classifies it as core', () => {
    expect(exerciseMatchesProgram(FLAG_EXERCISE, 'core')).toBe(true); // classification: unchanged
    expect(matchesDomainForSlot(FLAG_EXERCISE, 'core')).toBe(false); // slot entry: gated
  });

  it('matchesDomainForSlot accepts the flag exercise for domain=pull/push/human_flag (its real, correctly-leveled domains)', () => {
    expect(matchesDomainForSlot(FLAG_EXERCISE, 'pull')).toBe(true);
    expect(matchesDomainForSlot(FLAG_EXERCISE, 'push')).toBe(true);
    expect(matchesDomainForSlot(FLAG_EXERCISE, 'human_flag')).toBe(true);
  });

  it('matchesDomainForSlot accepts כפיפת ירך על הגבהה for domain=legs (its real, correctly-leveled domain)', () => {
    expect(matchesDomainForSlot(HIP_FLEXION_EXERCISE, 'legs')).toBe(true);
  });

  it('matchesDomainForSlot accepts a real core exercise for domain=core', () => {
    expect(matchesDomainForSlot(REAL_CORE_EXERCISE, 'core')).toBe(true);
  });
});

// ============================================================================
// Tier 2 — integration test through the real public function, realistic pool
// ============================================================================

function makeContext(requiredDomains: string[], userProgramLevels: Map<string, number>, globalExercisePool: ScoredExercise['exercise'][] = []): WorkoutGenerationContext {
  return { userLevel: 10, requiredDomains, userProgramLevels, globalExercisePool } as any;
}

describe('selectExercisesWithDomainQuotas — the dedicated per-domain pick (core domain isolated)', () => {
  // requiredDomains is deliberately ['core'] ONLY in these two tests. The flag
  // exercise legitimately carries real push/pull/human_flag levels too — in a
  // multi-domain pool it can correctly WIN the push or pull slot on score,
  // which is not a bug (it's a real, correctly-leveled exercise for THOSE
  // domains). Isolating to core alone removes that confound and tests
  // exactly the claim in question: does anything ever fill the CORE slot
  // without a real core level.

  it('picks a real core exercise for the core slot over a higher-scored flag exercise', () => {
    const flag = scored(FLAG_EXERCISE, 100); // deliberately higher score
    const realCore = scored(REAL_CORE_EXERCISE, 1); // deliberately lower score
    const pool = [flag, realCore];
    const context = makeContext(['core'], new Map([['core', 2]]));
    const selected = selectExercisesWithDomainQuotas(pool as any, 1, false, context, 2 as any);

    expect(selected.find((s) => s.exercise.id === 'plank-1')).toBeDefined();
    expect(selected.find((s) => s.exercise.id === 'flag-1')).toBeUndefined();
  });

  it('with no real core candidate available, the core slot stays empty rather than being filled by the flag exercise (no backfill budget)', () => {
    // count === 0: there is nothing else to fill even via the generic backfill
    // pass, isolating this to the dedicated per-domain pick specifically.
    const pool = [scored(FLAG_EXERCISE), scored(HIP_FLEXION_EXERCISE)];
    const context = makeContext(['core'], new Map([['core', 2]]));
    const selected = selectExercisesWithDomainQuotas(pool as any, 0, false, context, 2 as any);

    expect(selected.find((s) => s.exercise.id === 'flag-1')).toBeUndefined();
    expect(selected.find((s) => s.exercise.id === 'hip-flexion-1')).toBeUndefined();
    expect(selected).toHaveLength(0);
  });
});

// ============================================================================
// Tier 3 — honest documentation of a narrow, pre-existing, NOT core-specific
// residual: the generic backfill pass (unrelated to domain-quota selection)
// was never domain-restricted for ANY domain. See matchesDomainForSlot's doc
// comment for why this does not reintroduce the cross-scale level bug.
// ============================================================================

describe('known residual: generic backfill is not domain-gated (pre-existing, not core-specific, out of scope for this gate)', () => {
  it('in a pathologically thin pool (the flag exercise is the ONLY candidate at all), it can still appear via the generic backfill pass — documented, not silently hidden', () => {
    const pool = [scored(FLAG_EXERCISE)];
    const context = makeContext(['core'], new Map([['core', 5]]));
    const selected = selectExercisesWithDomainQuotas(pool as any, 1, false, context, 2 as any);
    // This is the ONLY scenario (pool has literally nothing else) where the
    // flag exercise survives — it is NOT selected as "the core representative"
    // (that pick correctly fails, see the DOMAIN QUOTA FAILED log), it is
    // picked by the later, always-domain-agnostic backfill pass filling the
    // remaining session slot count. In any pool with real alternatives for
    // other required domains (Tier 2 above), this does not happen.
    expect(selected.find((s) => s.exercise.id === 'flag-1')).toBeDefined();
  });
});
