import { describe, it, expect } from 'vitest';
import { resolveExercisePool, buildActiveProgramFilters } from '../InputSanitizerMiddleware';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { Program } from '@/features/content/programs/core/program.types';

// generator-leveling audit — Fix #1 (skill STRICT HIDE) + Fix #2 (dropped
// non-[0] scheduled domain). Both functions here are pure (no Firebase, no
// React) — tested directly, no mocking needed.
//
// Repro case throughout: pull=6, push=9, Custom Builder multi-select
// [pull, push]. Before these fixes: muscle_up (an unreached skill)
// leaked into the pool via the single-domain forward-expansion, and push
// was silently dropped from the active-domain set (home-workout.service.ts
// reading only activePrograms[0]).

function exercise(id: string, targetPrograms: Array<{ programId: string; level: number }>): Exercise {
  return { id, targetPrograms } as unknown as Exercise;
}

function program(overrides: Partial<Program> & { id: string }): Program {
  return {
    name: overrides.id,
    isMaster: false,
    ...overrides,
  } as Program;
}

describe('Fix #1 — isExerciseSkillEligible (via resolveExercisePool): skills hidden unless directly assessed', () => {
  // userProgramLevels mirrors buildUserProgramLevels' absent=absent contract:
  // a key is present ONLY when the user has a real tracks/domains entry.
  const PULL_6_PUSH_9 = new Map<string, number>([['pull', 6], ['push', 9]]);

  const pullExercise = exercise('pull-basic', [{ programId: 'pull', level: 6 }]);
  const pushExercise = exercise('push-basic', [{ programId: 'push', level: 9 }]);
  const muscleUpExercise = exercise('muscle-up-elite', [{ programId: 'muscle_up', level: 9 }]);
  // A multi-tagged exercise with a legitimate foundational tag ALONGSIDE an
  // unreached skill tag — must stay eligible via the foundational tag; this
  // fix only excludes an exercise whose EVERY tag is an unreached skill.
  // push tag level (9) deliberately matches the test user's push level
  // exactly, so it also survives the UNRELATED ±3 tolerance filter — this
  // test isolates the skill-eligibility gate, not level-tolerance exclusion.
  const humanFlagExercise = exercise('human-flag', [
    { programId: 'push', level: 9 },
    { programId: 'human_flag', level: 18 },
  ]);

  it('excludes a muscle_up-only exercise when the user has no direct muscle_up level', () => {
    const result = resolveExercisePool(
      [pullExercise, pushExercise, muscleUpExercise],
      PULL_6_PUSH_9,
      ['pull', 'push'],
      new Map(),
      9,
    );
    const ids = result.exercises.map((e) => e.id);
    expect(ids).not.toContain('muscle-up-elite');
    expect(ids).toContain('pull-basic');
    expect(ids).toContain('push-basic');
  });

  it('a multi-tagged exercise (foundational + unreached skill) stays eligible via its foundational tag', () => {
    const result = resolveExercisePool(
      [pullExercise, pushExercise, humanFlagExercise],
      PULL_6_PUSH_9,
      ['pull', 'push'],
      new Map(),
      9,
    );
    expect(result.exercises.map((e) => e.id)).toContain('human-flag');
  });

  it('does NOT over-exclude: a user WITH a direct muscle_up level still gets muscle_up exercises', () => {
    const withMuscleUp = new Map(PULL_6_PUSH_9);
    withMuscleUp.set('muscle_up', 11);
    const result = resolveExercisePool(
      [pullExercise, pushExercise, muscleUpExercise],
      withMuscleUp,
      ['pull', 'push'],
      new Map(),
      9,
    );
    expect(result.exercises.map((e) => e.id)).toContain('muscle-up-elite');
  });

  it('a user with ONLY pull assessed (single-domain session) sees zero skill exercises', () => {
    const pullOnly = new Map<string, number>([['pull', 6]]);
    const frontLever = exercise('front-lever-elite', [{ programId: 'front_lever', level: 9 }]);
    const result = resolveExercisePool(
      [pullExercise, frontLever, muscleUpExercise],
      pullOnly,
      ['pull'],
      new Map(),
      6,
    );
    const ids = result.exercises.map((e) => e.id);
    expect(ids).not.toContain('front-lever-elite');
    expect(ids).not.toContain('muscle-up-elite');
    expect(ids).toContain('pull-basic');
  });
});

describe('Fix #2 — buildActiveProgramFilters: union across ALL non-master activePrograms, not just [0]', () => {
  const PROGRAMS: Program[] = [
    program({ id: 'push-hash', slug: 'push', movementPattern: 'push', isMaster: false }),
    program({ id: 'pull-hash', slug: 'pull', movementPattern: 'pull', isMaster: false }),
    program({ id: 'upper-body-hash', slug: 'upper_body', isMaster: true, subPrograms: ['push-hash', 'pull-hash'] }),
  ];

  function profileWith(activeIds: string[], levels: Record<string, number>): UserFullProfile {
    return {
      progression: {
        activePrograms: activeIds.map((id) => ({ id, templateId: id, focusDomains: [] })),
        domains: Object.fromEntries(
          Object.entries(levels).map(([k, v]) => [k, { currentLevel: v, maxLevel: 20, isUnlocked: true }]),
        ),
        tracks: {},
      },
    } as unknown as UserFullProfile;
  }

  it('push + pull (co-equal, non-master) — BOTH survive, baseDomainCount=2 (fails pre-fix: only [pull] survived)', () => {
    const profile = profileWith(['pull', 'push'], { pull: 6, push: 9 });
    const { filters, baseDomainCount } = buildActiveProgramFilters(profile, profile, PROGRAMS, undefined);

    expect(filters).toContain('pull');
    expect(filters).toContain('push');
    expect(baseDomainCount).toBe(2);
  });

  it('baseDomainCount=2 means the single-domain skill-sibling forward-expansion never fires — no muscle_up leak for this session', () => {
    const profile = profileWith(['pull', 'push'], { pull: 6, push: 9 });
    const { filters } = buildActiveProgramFilters(profile, profile, PROGRAMS, undefined);

    expect(filters).not.toContain('muscle_up');
    expect(filters).not.toContain('front_lever');
  });

  it('a single scheduled domain (pull alone) is UNAFFECTED — baseDomainCount=1, forward-expansion still fires as designed', () => {
    const profile = profileWith(['pull'], { pull: 6 });
    const { filters, baseDomainCount } = buildActiveProgramFilters(profile, profile, PROGRAMS, undefined);

    expect(baseDomainCount).toBe(1);
    // The forward skill-sibling expansion (unchanged by this fix) still adds
    // pull's skill siblings as FILTER-ELIGIBLE tags — Fix #1 (tested above,
    // via resolveExercisePool) is what gates whether an unreached one
    // actually survives into the candidate pool, not this function.
    expect(filters).toContain('muscle_up');
  });

  it('a single master program (upper_body) is UNAFFECTED by the union — still resolves via resolveChildDomainsForParent as before', () => {
    const profile = profileWith(['upper_body'], { push: 9, pull: 6 });
    const { filters } = buildActiveProgramFilters(profile, profile, PROGRAMS, undefined);

    expect(filters).toContain('push');
    expect(filters).toContain('pull');
  });
});

describe('Combined repro — owner\'s exact case: pull=6, push=9, Custom Builder multi-select [pull, push]', () => {
  const PROGRAMS: Program[] = [
    program({ id: 'push-hash', slug: 'push', movementPattern: 'push', isMaster: false }),
    program({ id: 'pull-hash', slug: 'pull', movementPattern: 'pull', isMaster: false }),
  ];
  const userLevels = new Map<string, number>([['pull', 6], ['push', 9]]);

  // A small, realistic slice of the real catalog: a few ordinary pull/push
  // exercises near the user's levels, plus elite skill exercises (muscle_up,
  // front_lever) the user has never individually assessed — exactly the
  // shape that leaked through pre-fix.
  const CATALOG: Exercise[] = [
    exercise('pull-up', [{ programId: 'pull', level: 6 }]),
    exercise('row', [{ programId: 'pull', level: 5 }]),
    exercise('pushup', [{ programId: 'push', level: 9 }]),
    exercise('dip', [{ programId: 'push', level: 8 }]),
    exercise('muscle-up', [{ programId: 'muscle_up', level: 9 }]),
    exercise('front-lever-raise', [{ programId: 'front_lever', level: 10 }]),
  ];

  it('produces pull+push exercises only, zero skill leakage, and push is a non-empty required domain (no quota failure)', () => {
    const profile = {
      progression: {
        activePrograms: [
          { id: 'pull', templateId: 'pull', focusDomains: [] },
          { id: 'push', templateId: 'push', focusDomains: [] },
        ],
        domains: {
          pull: { currentLevel: 6, maxLevel: 20, isUnlocked: true },
          push: { currentLevel: 9, maxLevel: 20, isUnlocked: true },
        },
        tracks: {},
      },
    } as unknown as UserFullProfile;

    // Fix #2a (home-workout.service.ts's own union — exercised directly
    // there in its own call site; here we use its documented output shape:
    // activePrograms.length>1, none master → union of
    // resolveChildDomainsForParent across both, which for two leaf domains
    // is just the domains themselves).
    const resolvedChildDomains = ['pull', 'push'];

    // Fix #2b (buildActiveProgramFilters) — confirms baseDomainCount=2 so
    // the forward skill-sibling expansion never fires for this session.
    const { filters, baseDomainCount } = buildActiveProgramFilters(profile, profile, PROGRAMS, undefined);
    expect(baseDomainCount).toBe(2);
    expect(filters.sort()).toEqual(['pull', 'push']);

    // Fix #1 — the actual candidate pool, gated by direct-assessment only.
    const pool = resolveExercisePool(CATALOG, userLevels, resolvedChildDomains, new Map(), 9);
    const ids = pool.exercises.map((e) => e.id).sort();

    // BEFORE these fixes (documented for the report, not re-asserted here):
    // filters = ['pull','front_lever','back_lever','muscle_up','one_arm_pullup']
    // (push absent — Fix #2 bug), pool included 'muscle-up' and
    // 'front-lever-raise' via the skill-sibling expansion (Fix #1 bug),
    // and push's own exercises ('pushup','dip') never entered the pool
    // at all because push was never a resolvedChildDomains entry.
    expect(ids).toEqual(['dip', 'pull-up', 'pushup', 'row']);
    expect(ids).not.toContain('muscle-up');
    expect(ids).not.toContain('front-lever-raise');
    // Push has real candidates in the pool — the quota-failure symptom
    // ("No exercise for push") cannot reproduce once push survives into
    // resolvedChildDomains with its own exercises intact.
    expect(pool.exercises.some((e) => e.targetPrograms?.some((tp) => tp.programId === 'push'))).toBe(true);
  });
});
