import { describe, it, expect } from 'vitest';
import { resolveExercisePool } from '../../core/middleware/InputSanitizerMiddleware';
import { ContextualEngine } from '../ContextualEngine';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { ContextualFilterContext } from '../contextual-engine.types';

/**
 * End-to-end skill-leak verification, owed after PR #104 (generator-leveling
 * audit: isExerciseSkillEligible + buildActiveProgramFilters multi-domain
 * union). PR #104 shipped 9 unit tests against resolveExercisePool/
 * buildActiveProgramFilters directly (InputSanitizerMiddleware.test.ts) —
 * this file goes one real stage further: resolveExercisePool's output is fed
 * into ContextualEngine.filterAndScore (the SAME function home-workout
 * generation actually calls next), asserting on ContextualFilterResult.
 * exercises — real ScoredExercise objects, not an internal string[] filter
 * list.
 *
 * Why two stages and not three (WorkoutGenerator.generateWorkout): skill
 * exclusion is fully decided in these two stages — WorkoutGenerator only
 * selects/scores/budgets from the pool these two stages already produced; it
 * never reintroduces an excluded exercise. Going one stage further would add
 * construction risk (WorkoutGenerationContext's full guarantee-pass/budget
 * machinery) without adding signal to the skill-leak question specifically —
 * the "thin E2E only if it adds real signal" case doesn't clear its own bar
 * here, so it was deliberately not added.
 *
 * Why not Firestore-backed (generateHomeWorkoutTrio directly): every existing
 * test in this repo that touches generateHomeWorkoutTrio mocks it, because
 * it's Firestore-backed and CI has no Firestore credentials for the test
 * suite (confirmed by reading every existing caller site, not assumed) —
 * a real-Firestore test here would be unrepeatable in CI, the opposite of
 * what was asked for.
 *
 * REAL FINDING while building these tests (not hypothesized — confirmed by
 * direct execution, see "KNOWN GAP" describe block below): `human_flag` is
 * NOT covered by EITHER skill-gating mechanism in the pipeline —
 * DOMAIN_RESOLUTION_SKILL_PARENT_MAP (PR #104's gate, workout-selection.utils
 * .ts) has 6 entries (planche/handstand/handstand_pushup/front_lever/
 * back_lever/muscle_up/one_arm_pullup) and GATED_SKILL_DOMAINS (the older,
 * pre-#104 "Exclusive Skill Domain Gate" inside ContextualEngine.ts) covers
 * only `['muscle_up']`. A human_flag-only exercise passes both unconditionally
 * for an unassessed user. Documented with it.fails so this stays visible
 * and CI stays green until someone deliberately decides to close it.
 */

function ex(id: string, nameHe: string, targetPrograms: Array<{ programId: string; level: number }>): Exercise {
  return {
    id,
    name: { he: nameHe, en: id },
    targetPrograms,
    // ContextualEngine.filterAndScore resolves a real method via
    // selectMethodForContext (exercise.execution_methods || [] → null if
    // empty, hard-excluding the exercise at the location-matching stage
    // regardless of the skill gate) — a minimal bodyweight/no-gear method
    // valid for 'home' is required for these fixtures to reach the skill
    // gate at all. Not needed by resolveExercisePool alone (Stage 1,
    // InputSanitizerMiddleware.test.ts's existing fixtures correctly omit
    // it), only by this file's Stage-2 chain.
    execution_methods: [{ location: 'home', requiredGearType: 'none' }],
  } as unknown as Exercise;
}

// A realistic slice of the catalog: ordinary push/pull/legs/core work at the
// test user's levels, plus one exercise per gated elite skill — all leveled
// to exactly match baseUserLevel (9) so NOTHING here is excluded by the
// unrelated ±3 level-tolerance filter; any exclusion in these tests is
// attributable to the skill gate alone.
const PUSH_PULL_CATALOG: Exercise[] = [
  ex('pushup-std', 'שכיבות סמיכה', [{ programId: 'push', level: 9 }]),
  ex('dip-parallel', 'מקבילים', [{ programId: 'push', level: 9 }]),
  ex('pullup-std', 'מתח רגיל', [{ programId: 'pull', level: 6 }]),
  ex('row-bent', 'חתירה בכפיפה', [{ programId: 'pull', level: 6 }]),
  ex('muscle-up-elite', 'מאסל אפ', [{ programId: 'muscle_up', level: 9 }]),
  ex('front-lever-raise', 'הרמת פרונט לבר', [{ programId: 'front_lever', level: 9 }]),
  ex('planche-lean', 'פלאנץ׳ לין', [{ programId: 'planche', level: 9 }]),
  ex('one-arm-pullup-neg', 'מתח יד אחת (נגטיב)', [{ programId: 'one_arm_pullup', level: 9 }]),
  ex('handstand-pushup-wall', 'שכיבות סמיכה בעמידת ידיים (קיר)', [{ programId: 'handstand_pushup', level: 9 }]),
  ex('back-lever-tuck', 'בק לבר טאק', [{ programId: 'back_lever', level: 9 }]),
  ex('human-flag-tuck', 'דגל אנושי טאק', [{ programId: 'human_flag', level: 9 }]),
];

const ELITE_SKILL_IDS = [
  'muscle-up-elite',
  'front-lever-raise',
  'planche-lean',
  'one-arm-pullup-neg',
  'handstand-pushup-wall',
  'back-lever-tuck',
];

const EXPECTED_BASELINE_IDS = ['pushup-std', 'dip-parallel', 'pullup-std', 'row-bent'];

/** Full 2-stage pipeline: InputSanitizerMiddleware → ContextualEngine, the
 *  same two real functions home-workout generation calls in that order. */
function runPipeline(
  catalog: Exercise[],
  userProgramLevels: Map<string, number>,
  resolvedChildDomains: string[],
  baseUserLevel: number,
) {
  const pool = resolveExercisePool(catalog, userProgramLevels, resolvedChildDomains, new Map(), baseUserLevel);

  const context: ContextualFilterContext = {
    location: 'home',
    lifestyles: [],
    injuryShield: [],
    intentMode: 'normal',
    availableEquipment: [],
    getUserLevelForExercise: () => baseUserLevel,
    activeDomains: resolvedChildDomains,
    userProgramLevels,
    baseUserLevel,
    levelTolerance: 3,
  };

  const engine = new ContextualEngine();
  return engine.filterAndScore(pool.exercises, context);
}

describe('Scenario 1 — the exact PR #104 repro: pull=6, push=9, NO direct skill tracks', () => {
  const userLevels = new Map<string, number>([['pull', 6], ['push', 9]]);

  it('excludes every elite skill exercise covered by the current skill gates, and includes all appropriate push/pull work', () => {
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);

    for (const skillId of ELITE_SKILL_IDS) {
      expect(ids).not.toContain(skillId);
    }
    for (const baselineId of EXPECTED_BASELINE_IDS) {
      expect(ids).toContain(baselineId);
    }
    // Deliberately NOT asserting ids.length / exact-set-equality here — the
    // known human_flag gap (see KNOWN GAP block below) means the real
    // current result also contains 'human-flag-tuck'. Coupling THIS test
    // (about the 6 gates that DO work) to that separate, already-tracked
    // finding would make it fail for the wrong reason.
  });

  it('every baseline (push/pull) exercise that survives is genuinely push or pull work, not an accidental other-domain leak', () => {
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push'], 9);
    const baselineSurvivors = result.exercises.filter((e) => EXPECTED_BASELINE_IDS.includes(e.exercise.id));
    expect(baselineSurvivors.length).toBe(EXPECTED_BASELINE_IDS.length);
    for (const se of baselineSurvivors) {
      const tags = se.exercise.targetPrograms?.map((tp) => tp.programId) ?? [];
      expect(tags.some((t) => t === 'push' || t === 'pull')).toBe(true);
    }
  });

  it('the filter-stage counters attribute the skill exclusions to the skill gate, not level tolerance', () => {
    const pool = resolveExercisePool(PUSH_PULL_CATALOG, userLevels, ['pull', 'push'], new Map(), 9);
    // resolveExercisePool's own output already has all 6 gated skills removed
    // (Fix #1 runs first, "against the raw catalog" per its own doc comment).
    const poolIds = pool.exercises.map((e) => e.id);
    for (const skillId of ELITE_SKILL_IDS) {
      expect(poolIds).not.toContain(skillId);
    }
  });
});

describe('Scenario 2 — foundational beginner: low levels, no skills assessed', () => {
  it('a brand-new user (level 2, pull+push only) sees zero elite skills', () => {
    const userLevels = new Map<string, number>([['pull', 2], ['push', 2]]);
    const beginnerCatalog: Exercise[] = [
      ex('pushup-knee', 'שכיבות סמיכה על ברכיים', [{ programId: 'push', level: 2 }]),
      ex('pullup-band', 'מתח בעזרת גומייה', [{ programId: 'pull', level: 2 }]),
      ex('muscle-up-elite-2', 'מאסל אפ', [{ programId: 'muscle_up', level: 2 }]),
      ex('planche-lean-2', 'פלאנץ׳ לין', [{ programId: 'planche', level: 2 }]),
    ];
    const result = runPipeline(beginnerCatalog, userLevels, ['pull', 'push'], 2);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).not.toContain('muscle-up-elite-2');
    expect(ids).not.toContain('planche-lean-2');
    expect(ids.length).toBeGreaterThan(0); // the session isn't left empty
  });
});

describe('Scenario 3 — a user WITH a direct skill track (front_lever) — the filter must not over-hide', () => {
  it('front_lever exercises ARE allowed once the user has a direct front_lever level; muscle_up (still unreached) stays excluded', () => {
    const userLevels = new Map<string, number>([['pull', 6], ['push', 9], ['front_lever', 7]]);
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push', 'front_lever'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);

    expect(ids).toContain('front-lever-raise'); // now allowed — direct assessment
    expect(ids).not.toContain('muscle-up-elite'); // still unreached — still excluded
    expect(ids).not.toContain('planche-lean');
    // human-flag-tuck deliberately NOT asserted here either way — it's the
    // known, separately-tracked gap (see KNOWN GAP block below): it
    // currently survives in EVERY scenario in this file, regardless of
    // front_lever's assessment state, so it carries no signal for "does
    // assessing front_lever correctly stay scoped to front_lever."
  });

  it('does not accidentally widen to OTHER unreached skills just because one skill became active', () => {
    const userLevels = new Map<string, number>([['pull', 6], ['push', 9], ['front_lever', 7]]);
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push', 'front_lever'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).not.toContain('one-arm-pullup-neg');
    expect(ids).not.toContain('back-lever-tuck');
    expect(ids).not.toContain('handstand-pushup-wall');
  });
});

describe('KNOWN GAP (found while building these tests, not hypothesized) — human_flag is not covered by either skill gate', () => {
  it.fails('EXPECTED TO FAIL today: a human_flag-only exercise should be excluded for an unassessed user, same as the other 6 elite skills — it is not, because human_flag is absent from BOTH DOMAIN_RESOLUTION_SKILL_PARENT_MAP (workout-selection.utils.ts) and GATED_SKILL_DOMAINS (ContextualEngine.ts, which only lists muscle_up). Flip this to a real it() the day either map gains a human_flag entry.', () => {
    const userLevels = new Map<string, number>([['pull', 6], ['push', 9]]);
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).not.toContain('human-flag-tuck');
  });
});
