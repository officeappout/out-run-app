import { describe, it, expect, vi, beforeAll } from 'vitest';
import { runSkillRepresentationGuarantee } from '../GuaranteePassRunner';
import { buildIdToSlugMapFromPrograms } from '../../../services/program-hierarchy.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise, WorkoutGenerationContext } from '../../../logic/workout-generator.types';

/**
 * Tests for the "every selected skill represented" guarantee (Stage 2,
 * 2026-09-09, David). Fixture pattern matches guarantee-domain-protection.
 * test.ts's established conventions.
 */

// resolveToSlug (production code, called internally by the guarantee) emits
// a console.error when its module-level ID→slug map was never initialized —
// harmless here since every test uses plain slugs as programId directly
// (KNOWN_SLUGS fast-path or pass-through), but the map must be non-null to
// avoid the noisy warning path. Matches production's own init call
// (buildIdToSlugMapFromPrograms, top of home-workout.service.ts's shared
// pipeline) — empty here since no test needs real Firestore ID resolution.
beforeAll(() => {
  buildIdToSlugMapFromPrograms([]);
});

function makeExercise(id: string, name: string, targetPrograms: Array<{ programId: string; level: number }>, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id,
    name: { he: name, en: name },
    execution_methods: [{ location: 'home', requiredGearType: 'none' }] as any,
    targetPrograms,
    ...overrides,
  } as any;
}

function makeWorkoutExercise(ex: Exercise, overrides: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    exercise: ex,
    method: (ex as any).execution_methods[0],
    mechanicalType: 'none',
    sets: 3,
    reps: 10,
    isTimeBased: false,
    restSeconds: 60,
    priority: 'compound',
    score: 50,
    reasoning: [],
    exerciseRole: 'main',
    ...overrides,
  } as any;
}

function baseContext(overrides: Partial<WorkoutGenerationContext> = {}): WorkoutGenerationContext {
  return {
    availableTime: 45,
    userLevel: 10,
    location: 'home',
    userProgramLevels: new Map([['push', 10], ['pull', 10], ['legs', 10], ['core', 10]]),
    selectedSkillIds: [],
    globalExercisePool: [],
    ...overrides,
  } as any;
}

const totalSets = (exs: WorkoutExercise[]) => exs.reduce((sum, we) => sum + we.sets, 0);

describe('runSkillRepresentationGuarantee — no-op guards', () => {
  it('no selectedSkillIds — returns the input array unchanged', () => {
    const workout = [makeWorkoutExercise(makeExercise('e1', 'x', [{ programId: 'push', level: 10 }]))];
    const result = runSkillRepresentationGuarantee(workout, baseContext(), 2 as any, []);
    expect(result).toBe(workout);
  });

  it('no globalExercisePool — returns the input array unchanged even with selectedSkillIds set', () => {
    const workout = [makeWorkoutExercise(makeExercise('e1', 'x', [{ programId: 'push', level: 10 }]))];
    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({ selectedSkillIds: ['planche'], globalExercisePool: [] }),
      2 as any,
      [],
    );
    expect(result).toBe(workout);
  });

  it('selected skill already represented — no replacement happens, logs satisfaction', () => {
    const plancheEx = makeExercise('planche-1', 'planche hold', [{ programId: 'push', level: 10 }, { programId: 'planche', level: 8 }]);
    const workout = [makeWorkoutExercise(plancheEx)];
    const log: string[] = [];
    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['planche'],
        userProgramLevels: new Map([['push', 10], ['planche', 8]]),
        globalExercisePool: [plancheEx],
      }),
      2 as any,
      log,
    );
    expect(result).toBe(workout);
    expect(log.some((l) => l.includes('all selected skills already represented'))).toBe(true);
  });

  it('skill not in userProgramLevels (unassessed) — absent=absent, skipped not injected', () => {
    const pushOnly = makeExercise('push-1', 'pushup', [{ programId: 'push', level: 10 }]);
    const plancheCandidate = makeExercise('planche-cand', 'planche lean', [{ programId: 'push', level: 10 }, { programId: 'planche', level: 8 }]);
    const workout = [makeWorkoutExercise(pushOnly)];
    const log: string[] = [];
    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['planche'],
        userProgramLevels: new Map([['push', 10]]), // no 'planche' entry
        globalExercisePool: [pushOnly, plancheCandidate],
      }),
      2 as any,
      log,
    );
    expect(result).toEqual(workout);
    expect(log.some((l) => l.includes('planche absent (unassessed)'))).toBe(true);
  });
});

describe('runSkillRepresentationGuarantee — hard invariant: replace-only, never add', () => {
  it('exercise count and total sets identical before/after a real replacement', () => {
    const filler1 = makeWorkoutExercise(makeExercise('filler-1', 'generic core', [{ programId: 'core', level: 10 }]), { sets: 3, priority: 'accessory', score: 5 });
    const filler2 = makeWorkoutExercise(makeExercise('filler-2', 'generic legs', [{ programId: 'legs', level: 10 }]), { sets: 4, priority: 'accessory', score: 8 });
    const workout = [filler1, filler2];
    const plancheCandidate = makeExercise('planche-cand', 'planche lean', [{ programId: 'push', level: 10 }, { programId: 'planche', level: 8 }]);

    const before = { count: workout.length, sets: totalSets(workout) };
    const log: string[] = [];
    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['planche'],
        userProgramLevels: new Map([['push', 10], ['pull', 10], ['legs', 10], ['core', 10], ['planche', 8]]),
        globalExercisePool: [filler1.exercise, filler2.exercise, plancheCandidate],
      }),
      2 as any,
      log,
    );

    expect(result.length).toBe(before.count);
    expect(totalSets(result)).toBe(before.sets);
    // A real replacement did happen — not a silent no-op.
    expect(result.some((we) => we.exercise.id === 'planche-cand')).toBe(true);
  });

  it('never emits an INVARIANT VIOLATION console.error across a multi-skill replacement run', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const filler1 = makeWorkoutExercise(makeExercise('filler-1', 'generic core', [{ programId: 'core', level: 10 }]), { score: 5 });
    const filler2 = makeWorkoutExercise(makeExercise('filler-2', 'generic legs', [{ programId: 'legs', level: 10 }]), { score: 8 });
    const workout = [filler1, filler2];
    const plancheCandidate = makeExercise('planche-cand', 'planche lean', [{ programId: 'push', level: 10 }, { programId: 'planche', level: 8 }]);
    const oapCandidate = makeExercise('oap-cand', 'oap negative', [{ programId: 'pull', level: 10 }, { programId: 'one_arm_pullup', level: 8 }]);

    runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['planche', 'one_arm_pullup'],
        userProgramLevels: new Map([['push', 10], ['pull', 10], ['legs', 10], ['core', 10], ['planche', 8], ['one_arm_pullup', 8]]),
        globalExercisePool: [filler1.exercise, filler2.exercise, plancheCandidate, oapCandidate],
      }),
      2 as any,
      [],
    );

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('runSkillRepresentationGuarantee — 3-tier replacement ladder', () => {
  it('Tier 1: a non-skill-representing exercise is replaced before any skill-representing one, even if it scores higher', () => {
    const nonSkillHighScore = makeWorkoutExercise(
      makeExercise('nonskill-1', 'generic core work', [{ programId: 'core', level: 10 }]),
      { score: 90 }, // high score — would survive on merit alone
    );
    const skillLowScore = makeWorkoutExercise(
      makeExercise('skill-1', 'one_arm_pullup negative', [{ programId: 'pull', level: 10 }, { programId: 'one_arm_pullup', level: 6 }]),
      { score: 5 }, // already represents a DIFFERENT selected skill — low score, but must be protected from Tier 1
    );
    const workout = [nonSkillHighScore, skillLowScore];
    const plancheCandidate = makeExercise('planche-cand', 'planche lean', [{ programId: 'push', level: 10 }, { programId: 'planche', level: 8 }]);

    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['one_arm_pullup', 'planche'],
        userProgramLevels: new Map([['push', 10], ['pull', 10], ['core', 10], ['planche', 8], ['one_arm_pullup', 6]]),
        globalExercisePool: [nonSkillHighScore.exercise, skillLowScore.exercise, plancheCandidate],
      }),
      2 as any,
      [],
    );

    // The already-skill-representing exercise must survive (Tier 1 protects it).
    expect(result.some((we) => we.exercise.id === 'skill-1')).toBe(true);
    // The non-skill high-scorer is the one that got replaced instead.
    expect(result.some((we) => we.exercise.id === 'nonskill-1')).toBe(false);
    expect(result.some((we) => we.exercise.id === 'planche-cand')).toBe(true);
  });

  it('Tier 2: when every non-skill exercise is domain-protected, an EXCESS selected-skill exercise is sacrificed instead, lowest-priority skill first', () => {
    // Only skill-representing exercises exist in mainExercises — no Tier-1 candidate at all.
    // one_arm_pullup has TWO representatives (excess); front_lever has exactly one (not excess).
    const oapExcess1 = makeWorkoutExercise(
      makeExercise('oap-excess-1', 'oap hold A', [{ programId: 'pull', level: 10 }, { programId: 'one_arm_pullup', level: 6 }]),
      { score: 20 },
    );
    const oapExcess2 = makeWorkoutExercise(
      makeExercise('oap-excess-2', 'oap hold B', [{ programId: 'pull', level: 10 }, { programId: 'one_arm_pullup', level: 6 }]),
      { score: 30 },
    );
    const flSole = makeWorkoutExercise(
      makeExercise('fl-sole', 'front lever hold', [{ programId: 'pull', level: 10 }, { programId: 'front_lever', level: 6 }]),
      { score: 10 }, // lowest score, but NOT excess — must survive
    );
    const workout = [oapExcess1, oapExcess2, flSole];
    const plancheCandidate = makeExercise('planche-cand', 'planche lean', [{ programId: 'push', level: 10 }, { programId: 'planche', level: 8 }]);

    // one_arm_pullup ranked LOWER priority (higher rank number) than front_lever —
    // its excess representative must be the one sacrificed, not front_lever's sole one.
    const skillPriority = new Map([['front_lever', 1], ['one_arm_pullup', 2]]);

    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['front_lever', 'one_arm_pullup', 'planche'],
        skillPriority,
        userProgramLevels: new Map([['push', 10], ['pull', 10], ['legs', 10], ['core', 10], ['planche', 8], ['front_lever', 6], ['one_arm_pullup', 6]]),
        globalExercisePool: [oapExcess1.exercise, oapExcess2.exercise, flSole.exercise, plancheCandidate],
      }),
      2 as any,
      [],
    );

    // front_lever's sole representative must survive.
    expect(result.some((we) => we.exercise.id === 'fl-sole')).toBe(true);
    // Exactly one of the two oap-excess exercises was sacrificed.
    const oapSurvivors = result.filter((we) => we.exercise.id === 'oap-excess-1' || we.exercise.id === 'oap-excess-2');
    expect(oapSurvivors.length).toBe(1);
    expect(result.some((we) => we.exercise.id === 'planche-cand')).toBe(true);
  });

  it('Tier 3: no safe victim anywhere — logs a representation conflict, does not force a replacement', () => {
    // Single exercise in the whole workout, and it's the sole representative
    // of the 'legs' primary domain — Tier 1 refuses it (domain-protected),
    // and there's no skill-representing exercise at all for Tier 2.
    const soleLegs = makeWorkoutExercise(
      makeExercise('legs-sole', 'squat', [{ programId: 'legs', level: 10 }], { movementGroup: 'squat' } as any),
      { score: 50 },
    );
    const workout = [soleLegs];
    const plancheCandidate = makeExercise('planche-cand', 'planche lean', [{ programId: 'push', level: 10 }, { programId: 'planche', level: 8 }]);
    const log: string[] = [];

    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['planche'],
        userProgramLevels: new Map([['push', 10], ['pull', 10], ['legs', 10], ['core', 10], ['planche', 8]]),
        globalExercisePool: [soleLegs.exercise, plancheCandidate],
      }),
      2 as any,
      log,
    );

    expect(result).toEqual(workout);
    expect(log.some((l) => l.includes('candidate found but no safe victim') || l.includes('CONFLICT'))).toBe(true);
  });
});

describe('runSkillRepresentationGuarantee — dual-coverage preference (real front_lever + one_arm_pullup catalog data, 2026-09-09 census)', () => {
  // Real exercise "מתח" (id sPASfuHeE1eAFQgHrE5z): pull:L11, front_lever:L2, one_arm_pullup:L2 —
  // one of the 18 real catalog exercises co-tagged with both skills (no planche+one_arm_pullup
  // pair exists in the catalog to test with instead; front_lever+one_arm_pullup is the closest
  // real substitute, per the correction that flagged this exact test-coverage gap).
  const dualTaggedRealExercise = makeExercise(
    'sPASfuHeE1eAFQgHrE5z', 'מתח',
    [{ programId: 'pull', level: 11 }, { programId: 'front_lever', level: 2 }, { programId: 'one_arm_pullup', level: 2 }],
  );

  it('a single dual-tagged candidate satisfies BOTH under-represented skills in ONE replacement, not two', () => {
    const filler1 = makeWorkoutExercise(makeExercise('filler-1', 'generic core', [{ programId: 'core', level: 2 }]), { score: 5 });
    const filler2 = makeWorkoutExercise(makeExercise('filler-2', 'generic legs', [{ programId: 'legs', level: 2 }]), { score: 8 });
    const workout = [filler1, filler2];

    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['front_lever', 'one_arm_pullup'],
        userProgramLevels: new Map([['pull', 11], ['legs', 2], ['core', 2], ['front_lever', 2], ['one_arm_pullup', 2]]),
        globalExercisePool: [filler1.exercise, filler2.exercise, dualTaggedRealExercise],
      }),
      2 as any,
      [],
    );

    // Exercise count unchanged — dual coverage from ONE slot, not two replacements.
    expect(result.length).toBe(2);
    expect(result.some((we) => we.exercise.id === 'sPASfuHeE1eAFQgHrE5z')).toBe(true);
    // Only ONE of the two fillers was replaced.
    const fillersSurviving = result.filter((we) => we.exercise.id === 'filler-1' || we.exercise.id === 'filler-2');
    expect(fillersSurviving.length).toBe(1);
  });

  it('prefers the dual-tagged candidate over a single-skill-only candidate when both are available', () => {
    const filler = makeWorkoutExercise(makeExercise('filler-1', 'generic core', [{ programId: 'core', level: 2 }]), { score: 5 });
    const workout = [filler];
    // A single-skill-only front_lever candidate exists too — the dual-tagged
    // real exercise should still be picked first, per the preference.
    const flOnlyCandidate = makeExercise('fl-only', 'front lever raise', [{ programId: 'pull', level: 11 }, { programId: 'front_lever', level: 2 }]);

    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['front_lever', 'one_arm_pullup'],
        userProgramLevels: new Map([['pull', 11], ['core', 2], ['front_lever', 2], ['one_arm_pullup', 2]]),
        globalExercisePool: [filler.exercise, flOnlyCandidate, dualTaggedRealExercise],
      }),
      2 as any,
      [],
    );

    expect(result.some((we) => we.exercise.id === 'sPASfuHeE1eAFQgHrE5z')).toBe(true);
  });
});

describe('runSkillRepresentationGuarantee — declared parent-fallback (Option A+C)', () => {
  it('falls back to the parent domain when no skill-tagged candidate exists, and logs it as DECLARED FALLBACK', () => {
    const filler = makeWorkoutExercise(makeExercise('filler-1', 'generic core', [{ programId: 'core', level: 8 }]), { score: 5 });
    const workout = [filler];
    // No planche-tagged exercise anywhere in the pool — only a plain push exercise.
    const pushOnlyCandidate = makeExercise('push-fallback', 'basic pushup', [{ programId: 'push', level: 8 }]);
    const log: string[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['planche'],
        userProgramLevels: new Map([['push', 8], ['core', 8], ['planche', 8]]),
        globalExercisePool: [filler.exercise, pushOnlyCandidate],
      }),
      2 as any,
      log,
    );

    expect(result.some((we) => we.exercise.id === 'push-fallback')).toBe(true);
    expect(log.some((l) => l.includes('DECLARED_FALLBACK'))).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DECLARED FALLBACK'));
    warnSpy.mockRestore();
  });

  it('no fallback possible either (parent domain also unassessed) — representation conflict, deferred', () => {
    const filler = makeWorkoutExercise(makeExercise('filler-1', 'generic legs', [{ programId: 'legs', level: 8 }]), { score: 5 });
    const workout = [filler];
    const log: string[] = [];

    const result = runSkillRepresentationGuarantee(
      workout,
      baseContext({
        selectedSkillIds: ['planche'],
        userProgramLevels: new Map([['legs', 8], ['planche', 8]]), // no 'push' entry at all
        globalExercisePool: [filler.exercise],
      }),
      2 as any,
      log,
    );

    expect(result).toEqual(workout);
    expect(log.some((l) => l.includes('CONFLICT'))).toBe(true);
  });
});
