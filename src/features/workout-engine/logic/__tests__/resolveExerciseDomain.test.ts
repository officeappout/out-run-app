import { describe, expect, it } from 'vitest';
import { resolveExerciseDomain, buildSkillPriorityMap } from '../workout-selection.utils';

const identity = (id: string) => id;

const SKILL_PARENT_MAP: Record<string, string> = {
  planche: 'push',
  handstand: 'push',
  handstand_pushup: 'push',
  front_lever: 'pull',
  back_lever: 'pull',
  muscle_up: 'pull',
  one_arm_pullup: 'pull',
};

const ex = (targetPrograms: Array<{ programId: string; level: number }>): any => ({
  id: 'test-ex',
  targetPrograms,
});

describe('resolveExerciseDomain', () => {
  it('skill tag always wins over co-matched parent tag, regardless of array order', () => {
    const parentFirst = resolveExerciseDomain(
      ex([{ programId: 'push', level: 16 }, { programId: 'planche', level: 7 }]),
      { activeDomains: ['push', 'planche'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity },
    );
    const skillFirst = resolveExerciseDomain(
      ex([{ programId: 'planche', level: 7 }, { programId: 'push', level: 16 }]),
      { activeDomains: ['push', 'planche'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity },
    );
    expect(parentFirst).toBe('planche');
    expect(skillFirst).toBe('planche');
  });

  it('skill tag wins even when activeDomains itself lists the parent first (not caller-order-dependent)', () => {
    const resolved = resolveExerciseDomain(
      ex([{ programId: 'push', level: 16 }, { programId: 'planche', level: 7 }]),
      { activeDomains: ['push', 'planche'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity },
    );
    expect(resolved).toBe('planche');
  });

  it("no skill tag at all, parentTiebreak omitted — defaults to 'exercise-tag-order' (2026-09-09: confirmed by real-catalog differential test as what every site except resolveExerciseLevelForDomains actually wants)", () => {
    const pullTaggedFirst = resolveExerciseDomain(
      ex([{ programId: 'pull', level: 10 }, { programId: 'push', level: 12 }]),
      { activeDomains: ['push', 'pull'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity },
    );
    const pushTaggedFirst = resolveExerciseDomain(
      ex([{ programId: 'push', level: 12 }, { programId: 'pull', level: 10 }]),
      { activeDomains: ['push', 'pull'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity },
    );
    // Same activeDomains order both times — result tracks the EXERCISE's own
    // tag order, not activeDomains order, proving this is the default tier.
    expect(pullTaggedFirst).toBe('pull');
    expect(pushTaggedFirst).toBe('push');
  });

  it("no skill tag at all, parentTiebreak='active-domain-order' — resolves by activeDomains order (resolveExerciseLevelForDomains's own pre-existing mechanism, explicitly opted into)", () => {
    const pushActiveFirst = resolveExerciseDomain(
      ex([{ programId: 'pull', level: 10 }, { programId: 'push', level: 12 }]),
      { activeDomains: ['push', 'pull'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity, parentTiebreak: 'active-domain-order' },
    );
    const pullActiveFirst = resolveExerciseDomain(
      ex([{ programId: 'pull', level: 10 }, { programId: 'push', level: 12 }]),
      { activeDomains: ['pull', 'push'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity, parentTiebreak: 'active-domain-order' },
    );
    // Same exercise tag order both times — result tracks activeDomains
    // order instead, proving parentTiebreak actually switches the tier.
    expect(pushActiveFirst).toBe('push');
    expect(pullActiveFirst).toBe('pull');
  });

  it('exercise matches none of activeDomains — returns null', () => {
    const resolved = resolveExerciseDomain(
      ex([{ programId: 'legs', level: 5 }]),
      { activeDomains: ['push', 'pull'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity },
    );
    expect(resolved).toBeNull();
  });

  it('no skillPriority provided — two co-matched skills tie-break to stable targetPrograms order', () => {
    // Real catalog data (2026-09-08 census): front_lever always precedes
    // one_arm_pullup in targetPrograms for all 18 co-tagged exercises.
    const resolved = resolveExerciseDomain(
      ex([{ programId: 'front_lever', level: 6 }, { programId: 'one_arm_pullup', level: 6 }]),
      { activeDomains: ['front_lever', 'one_arm_pullup'], skillParentMap: SKILL_PARENT_MAP, resolveSlug: identity },
    );
    expect(resolved).toBe('front_lever');
  });

  it('skillPriority overrides targetPrograms order — user who selected one_arm_pullup first gets it, on real front_lever+one_arm_pullup catalog data', () => {
    // Real exercise: "מתח" (pull L11, front_lever L2, one_arm_pullup L2) — id sPASfuHeE1eAFQgHrE5z.
    const machtach = ex([
      { programId: 'pull', level: 11 },
      { programId: 'front_lever', level: 2 },
      { programId: 'one_arm_pullup', level: 2 },
    ]);
    const skillPriority = buildSkillPriorityMap(['one_arm_pullup', 'front_lever'], identity);
    const resolved = resolveExerciseDomain(machtach, {
      activeDomains: ['pull', 'front_lever', 'one_arm_pullup'],
      skillPriority,
      skillParentMap: SKILL_PARENT_MAP,
      resolveSlug: identity,
    });
    expect(resolved).toBe('one_arm_pullup');

    // Flip the user's selection order — front_lever should now win instead.
    const flippedPriority = buildSkillPriorityMap(['front_lever', 'one_arm_pullup'], identity);
    const flippedResolved = resolveExerciseDomain(machtach, {
      activeDomains: ['pull', 'front_lever', 'one_arm_pullup'],
      skillPriority: flippedPriority,
      skillParentMap: SKILL_PARENT_MAP,
      resolveSlug: identity,
    });
    expect(flippedResolved).toBe('front_lever');
  });

  it("David's real regression — one_arm_pullup co-tagged with pull, pull recorded first in targetPrograms, must still resolve to one_arm_pullup", () => {
    const resolved = resolveExerciseDomain(
      ex([{ programId: 'UPDBtTdCvX748dtBlWYj', level: 19 }, { programId: 'cC0BOmm6KIqYAyQynEIo', level: 10 }]),
      {
        activeDomains: ['pull', 'one_arm_pullup'],
        skillParentMap: SKILL_PARENT_MAP,
        resolveSlug: (id) =>
          id === 'UPDBtTdCvX748dtBlWYj' ? 'pull' : id === 'cC0BOmm6KIqYAyQynEIo' ? 'one_arm_pullup' : id,
      },
    );
    expect(resolved).toBe('one_arm_pullup');
  });

  it('no targetPrograms at all — returns null, does not throw', () => {
    const resolved = resolveExerciseDomain(ex([]), {
      activeDomains: ['push'],
      skillParentMap: SKILL_PARENT_MAP,
      resolveSlug: identity,
    });
    expect(resolved).toBeNull();
  });
});

describe('buildSkillPriorityMap', () => {
  it('preserves user selection order — first selected gets rank 1', () => {
    const map = buildSkillPriorityMap(['one_arm_pullup', 'planche', 'front_lever'], identity);
    expect(map.get('one_arm_pullup')).toBe(1);
    expect(map.get('planche')).toBe(2);
    expect(map.get('front_lever')).toBe(3);
  });

  it('undefined/empty input — returns an empty map, does not throw', () => {
    expect(buildSkillPriorityMap(undefined, identity).size).toBe(0);
    expect(buildSkillPriorityMap([], identity).size).toBe(0);
  });

  it('duplicate ids — first occurrence wins, not overwritten by a later duplicate', () => {
    const map = buildSkillPriorityMap(['planche', 'front_lever', 'planche'], identity);
    expect(map.get('planche')).toBe(1);
    expect(map.get('front_lever')).toBe(2);
  });

  it('resolveSlug is applied to each id before ranking', () => {
    const map = buildSkillPriorityMap(['rawPlancheId'], (id) => (id === 'rawPlancheId' ? 'planche' : id));
    expect(map.get('planche')).toBe(1);
    expect(map.has('rawPlancheId')).toBe(false);
  });
});
