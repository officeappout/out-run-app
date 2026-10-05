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

describe('Item 4 — skill-gate cold-cache leak: isExerciseSkillEligible fails CLOSED on an unresolved hash tag', () => {
  // Repro case (2026-10-05, generator-validation-harness.ts): a real
  // exercise ("נדנוד הכנה לעליית כוח", a muscle_up prep swing) leaked to a
  // user with pull=5/push=5/legs=5 assessed and NO muscle_up assessment.
  // Its real Firestore tag is targetPrograms:[{programId:"fTLWzjP9gH2VNpa
  // mCZF" (a 20-char hash, resolves to 'muscle_up' in a WARM idToSlug map),
  // level:2}]. Before the fix: isExerciseSkillEligible called the standalone
  // resolveToSlug(raw), which reads a SHARED, module-level cache this unit
  // test (and, live, a concurrent request) never populates/can race on —
  // returning the raw hash unchanged, missing the
  // DOMAIN_RESOLUTION_SKILL_PARENT_MAP lookup (keyed by slug), and reading
  // as foundational. Fixed: resolveExercisePool's own idToSlug PARAMETER
  // (request-scoped) is used directly, with a hash-shaped-and-unresolved
  // tag now failing CLOSED instead of open.
  const PULL_5 = new Map<string, number>([['pull', 5], ['push', 5], ['legs', 5]]);
  const MUSCLE_UP_HASH = 'fTLWzjP9gH2VNpamyCZF'; // 20 chars, no underscore — the real shape
  const prepSwing = exercise('prep-swing-muscle-up', [{ programId: MUSCLE_UP_HASH, level: 2 }]);
  const pullExercise2 = exercise('pull-basic-2', [{ programId: 'pull', level: 5 }]);

  it('reproduces the leak and confirms it is now closed: EMPTY idToSlug (cold/unresolved) excludes the hash-tagged skill exercise', () => {
    const result = resolveExercisePool(
      [pullExercise2, prepSwing],
      PULL_5,
      ['pull'],
      new Map(), // empty — exactly the "cache never resolved this id" case
      5,
    );
    const ids = result.exercises.map((e) => e.id);
    expect(ids).not.toContain('prep-swing-muscle-up');
    expect(ids).toContain('pull-basic-2');
  });

  it('does NOT over-exclude: a WARM idToSlug correctly resolving the hash to muscle_up still excludes it for an unassessed user (same outcome, right reason)', () => {
    const warmMap = new Map([[MUSCLE_UP_HASH, 'muscle_up']]);
    const result = resolveExercisePool([pullExercise2, prepSwing], PULL_5, ['pull'], warmMap, 5);
    expect(result.exercises.map((e) => e.id)).not.toContain('prep-swing-muscle-up');
  });

  it('does NOT over-exclude on the real (warm) path: a user who HAS muscle_up assessed gets the exercise once idToSlug resolves the hash', () => {
    // userProgramLevels is ALWAYS slug-keyed (buildUserProgramLevels'
    // absent=absent contract) -- it can never contain a raw hash. So the
    // "directly assessed" check can only ever match once the hash is
    // actually resolved to its slug. On the real request path (primary
    // fix: resolveExercisePool's own idToSlug parameter, populated
    // synchronously on every request before this runs) that's the normal
    // case -- confirmed here.
    // muscle_up level set to 2, matching prepSwing's own targetPrograms
    // level tag exactly (same convention the pre-existing tests above use)
    // so it also survives the UNRELATED ±3 level-tolerance filter --
    // isolates the skill-eligibility gate, not level-tolerance exclusion.
    const withMuscleUp = new Map(PULL_5);
    withMuscleUp.set('muscle_up', 2);
    const warmResult = resolveExercisePool(
      [pullExercise2, prepSwing], withMuscleUp, ['pull'], new Map([[MUSCLE_UP_HASH, 'muscle_up']]), 5,
    );
    expect(warmResult.exercises.map((e) => e.id)).toContain('prep-swing-muscle-up');
  });

  it('documents the accepted trade-off: under a genuinely EMPTY idToSlug, even an assessed user\'s own hash-tagged skill is excluded, not just an unassessed one\'s', () => {
    // Known, accepted limitation of the fail-closed design, not a separate
    // bug: with idToSlug empty, the hash can't be resolved to 'muscle_up'
    // at all, so "is this assessed" can't be answered either way --
    // checking userProgramLevels.has(<the raw hash>) can never match (that
    // map is slug-keyed). Same STRICT HIDE philosophy as the original Fix
    // #1 (generator-leveling audit): when assessment status can't be
    // verified, hide rather than risk showing locked content -- a narrow,
    // self-correcting (next request, idToSlug warm again) under-delivery
    // is preferred over any chance of an over-delivery leak. This is why
    // the PRIMARY fix (passing the request-scoped idToSlug through,
    // instead of the racy global resolveToSlug) matters far more than this
    // safety net -- idToSlug is populated synchronously on every real
    // request, so this branch should rarely if ever fire in production.
    const withMuscleUp = new Map(PULL_5);
    withMuscleUp.set('muscle_up', 11);
    const coldResult = resolveExercisePool([pullExercise2, prepSwing], withMuscleUp, ['pull'], new Map(), 5);
    expect(coldResult.exercises.map((e) => e.id)).not.toContain('prep-swing-muscle-up');
  });

  it('documents the same trade-off for a hypothetical foundational hash-shaped tag: an unresolved hash is excluded even when it isn\'t actually a skill', () => {
    // Every foundational fixture elsewhere in this file tags via the
    // literal slug ('push'/'pull'/etc.), matching this catalog's observed
    // convention -- a foundational exercise referencing its domain by raw
    // Firestore hash id (rather than slug) is not a confirmed real case.
    // If one did exist, this is the one scenario where fail-closed costs
    // something real: a non-skill exercise could be wrongly excluded under
    // a cold cache. Accepted deliberately (same reasoning as the test
    // above) -- cannot distinguish "unresolved foundational hash" from
    // "unresolved skill hash" without a resolved slug, and the two
    // failure directions are not symmetric in cost (a content-gating leak
    // vs. one exercise temporarily missing from an otherwise-healthy pool).
    const UNRESOLVED_HASH = 'J0fLpmJhG0KDN2tQouxh'; // 20 chars, no underscore -- real shape, arbitrary id
    const hashTagged = exercise('hash-tagged-unverifiable', [{ programId: UNRESOLVED_HASH, level: 5 }]);
    const result = resolveExercisePool([hashTagged], PULL_5, ['pull'], new Map(), 5);
    expect(result.exercises.map((e) => e.id)).not.toContain('hash-tagged-unverifiable');
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
