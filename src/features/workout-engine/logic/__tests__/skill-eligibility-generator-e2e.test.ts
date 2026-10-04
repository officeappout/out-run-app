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
 * REAL FINDING while building these tests, now FIXED (04.10.2026, same
 * change): `human_flag` was covered by NEITHER skill-gating mechanism in
 * the pipeline — DOMAIN_RESOLUTION_SKILL_PARENT_MAP (PR #104's gate,
 * workout-selection.utils.ts) had 6 entries (planche/handstand/
 * handstand_pushup/front_lever/back_lever/muscle_up/one_arm_pullup) and
 * GATED_SKILL_DOMAINS (the older, pre-#104 "Exclusive Skill Domain Gate"
 * inside ContextualEngine.ts) covers only `['muscle_up']`. A human_flag-only
 * exercise passed both unconditionally for an unassessed user, confirmed by
 * direct execution before the fix. Closed by adding `human_flag: 'push'` to
 * DOMAIN_RESOLUTION_SKILL_PARENT_MAP (David's explicit decision: mirror the
 * generator's own skill maps directly, not a new feature flag) — see that
 * map's own doc-comment for why only this one of the 4 known copies of this
 * data was touched. The "all 7 elite skills excluded" assertions below
 * cover human_flag the same as the other 6 now; no special-cased exception
 * remains.
 *
 * handstand (same round, separate decision): David also asked to take
 * handstand out of active offering (insufficient assessment content).
 * Unlike human_flag, handstand's GENERATOR-level gate was never broken — it
 * has been in DOMAIN_RESOLUTION_SKILL_PARENT_MAP since PR #104. Investigated
 * before writing any code: program-path/page.tsx's onboarding skill picker
 * already has its own live, content-driven "skill readiness gate" that
 * disables any skill with <2 authored onboarding levels — confirmed
 * handstand reads 0 live, so that entry point was ALREADY correctly
 * blocking new selection, no change needed. recommendation.service.ts had
 * no such check at all; gated behind a re-introduced
 * HANDSTAND_ASSESSMENT_ENABLED flag (feature-flags.ts), mirroring the prior
 * (since-removed) mechanism of the same name. Neither change touches
 * existing users' stored handstand progress or the generator's own gate.
 * See "handstand" describe block below for the generator-level regression
 * guard (explicitly requested alongside human_flag's, even though nothing
 * needed fixing there).
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
  // 'handstand' is a DIFFERENT skill tag than 'handstand_pushup' above —
  // both already covered by DOMAIN_RESOLUTION_SKILL_PARENT_MAP since before
  // this round (04.10.2026). Added as its own fixture (not previously
  // present in this catalog) specifically because David separately asked
  // for an explicit handstand-excluded-when-unassessed assertion, alongside
  // human_flag's — this locks in generator-level behavior that was already
  // correct; see the module doc-comment for the SEPARATE, real onboarding-
  // layer gap found and fixed this same round (recommendation.service.ts).
  ex('handstand-hold', 'עמידת ידיים בקיר', [{ programId: 'handstand', level: 9 }]),
];

const ELITE_SKILL_IDS = [
  'muscle-up-elite',
  'front-lever-raise',
  'planche-lean',
  'handstand-hold',
  'one-arm-pullup-neg',
  'handstand-pushup-wall',
  'back-lever-tuck',
  'human-flag-tuck', // now covered — see module doc-comment
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

  it('excludes every elite skill exercise and keeps only appropriate push/pull work — exact set, all 7 skills covered', () => {
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push'], 9);
    const ids = result.exercises.map((e) => e.exercise.id).sort();

    for (const skillId of ELITE_SKILL_IDS) {
      expect(ids).not.toContain(skillId);
    }
    expect(ids).toEqual(EXPECTED_BASELINE_IDS.slice().sort());
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
    // resolveExercisePool's own output already has all 7 gated skills removed
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
      ex('human-flag-tuck-2', 'דגל אנושי טאק', [{ programId: 'human_flag', level: 2 }]),
    ];
    const result = runPipeline(beginnerCatalog, userLevels, ['pull', 'push'], 2);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).not.toContain('muscle-up-elite-2');
    expect(ids).not.toContain('planche-lean-2');
    expect(ids).not.toContain('human-flag-tuck-2');
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
    expect(ids).not.toContain('human-flag-tuck'); // still unreached — still excluded (post-fix)
  });

  it('does not accidentally widen to OTHER unreached skills just because one skill became active', () => {
    const userLevels = new Map<string, number>([['pull', 6], ['push', 9], ['front_lever', 7]]);
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push', 'front_lever'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).not.toContain('one-arm-pullup-neg');
    expect(ids).not.toContain('back-lever-tuck');
    expect(ids).not.toContain('handstand-pushup-wall');
    expect(ids).not.toContain('human-flag-tuck');
    expect(ids).not.toContain('handstand-hold');
  });
});

describe('human_flag fix verification (04.10.2026) — now gated identically to the other 6 elite skills', () => {
  it('a human_flag-only exercise IS excluded for an unassessed user, same as muscle_up/front_lever/etc.', () => {
    const userLevels = new Map<string, number>([['pull', 6], ['push', 9]]);
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).not.toContain('human-flag-tuck');
  });

  it('does NOT over-exclude: a user WITH a direct human_flag level still gets human_flag exercises', () => {
    const userLevels = new Map<string, number>([['pull', 6], ['push', 9], ['human_flag', 9]]);
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push', 'human_flag'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).toContain('human-flag-tuck');
  });
});

describe('handstand — generator-level gate was ALREADY correct before this round (regression guard, explicitly requested)', () => {
  // Unlike human_flag, handstand has been in DOMAIN_RESOLUTION_SKILL_PARENT_MAP
  // since PR #104 — nothing changed here. The real handstand work this round
  // was at the ONBOARDING layer (program-path/page.tsx's live readiness gate
  // was already correctly blocking it — confirmed 0 authored levels via
  // getOnboardingLevelsForCategory('handstand') before writing any code;
  // recommendation.service.ts had no such check at all and now does, behind
  // HANDSTAND_ASSESSMENT_ENABLED — see feature-flags.ts). These two tests
  // lock in the generator-level behavior explicitly, as requested, alongside
  // human_flag's — not because it was broken, but so it's asserted by name.
  it('a handstand-only exercise IS excluded for an unassessed user, same as human_flag/muscle_up/etc.', () => {
    const userLevels = new Map<string, number>([['pull', 6], ['push', 9]]);
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).not.toContain('handstand-hold');
  });

  it('does NOT over-exclude: a user WITH a direct handstand level still gets handstand exercises', () => {
    const userLevels = new Map<string, number>([['pull', 6], ['push', 9], ['handstand', 9]]);
    const result = runPipeline(PUSH_PULL_CATALOG, userLevels, ['pull', 'push', 'handstand'], 9);
    const ids = result.exercises.map((e) => e.exercise.id);
    expect(ids).toContain('handstand-hold');
  });
});
