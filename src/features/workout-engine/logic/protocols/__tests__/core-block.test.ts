import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  chooseCoreForm,
  chooseCoreTabataMemberCount,
  resolveFollowAlongCoreExercise,
  buildCoreTabataBlock,
  type CoreBlockForm,
} from '../core-block';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { WorkoutExercise } from '../../workout-generator.types';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// ============================================================================
// Form selection + anti-repetition
// ============================================================================

describe('chooseCoreForm — eligibility by remaining time', () => {
  it('a duration-starved session (no headroom for tabata/follow_along) always falls back to single', () => {
    for (let i = 0; i < 20; i++) {
      const form = chooseCoreForm({
        formsChosenThisTrio: [],
        availableTime: 15,
        estimatedDurationSoFar: 14, // 1 min headroom — below both FORM_TIME_COST_MINUTES (4)
        difficulty: 2,
      });
      expect(form).toBe('single');
    }
  });

  it('ample headroom makes all 3 forms reachable across repeated calls', () => {
    const seen = new Set<CoreBlockForm>();
    for (let i = 0; i < 60; i++) {
      seen.add(chooseCoreForm({
        formsChosenThisTrio: [],
        availableTime: 60,
        estimatedDurationSoFar: 10, // 50 min headroom
        difficulty: 2,
      }));
    }
    expect(seen.has('single')).toBe(true);
    expect(seen.has('tabata')).toBe(true);
    expect(seen.has('follow_along')).toBe(true);
  });
});

describe('chooseCoreForm — anti-repetition (never the same form 3 times in a row)', () => {
  it('in-trio: after 2 identical forms, the 3rd never repeats the same one', () => {
    for (let i = 0; i < 30; i++) {
      const form = chooseCoreForm({
        formsChosenThisTrio: ['tabata', 'tabata'],
        availableTime: 60,
        estimatedDurationSoFar: 10,
        difficulty: 2,
      });
      expect(form).not.toBe('tabata');
    }
  });

  it('recentCoreForms (the cross-session extension point) is honoured the same way', () => {
    for (let i = 0; i < 30; i++) {
      const form = chooseCoreForm({
        formsChosenThisTrio: ['follow_along'],
        recentCoreForms: ['follow_along'],
        availableTime: 60,
        estimatedDurationSoFar: 10,
        difficulty: 2,
      });
      expect(form).not.toBe('follow_along');
    }
  });

  it('2 non-identical forms do not trigger the anti-repetition rule', () => {
    const seen = new Set<CoreBlockForm>();
    for (let i = 0; i < 40; i++) {
      seen.add(chooseCoreForm({
        formsChosenThisTrio: ['single', 'tabata'],
        availableTime: 60,
        estimatedDurationSoFar: 10,
        difficulty: 2,
      }));
    }
    // single and tabata are both still 1 away from a 3rd repeat — only a
    // THIRD identical pick would violate the rule, so both remain reachable.
    expect(seen.size).toBeGreaterThan(1);
  });

  it('edge case: a duration-starved session with a 2-single-in-a-row streak still returns single (eligible set has no alternative)', () => {
    const form = chooseCoreForm({
      formsChosenThisTrio: ['single', 'single'],
      availableTime: 15,
      estimatedDurationSoFar: 14, // only 'single' is eligible at all
      difficulty: 2,
    });
    expect(form).toBe('single'); // falls back to the eligible set per the documented edge case
  });
});

describe('chooseCoreTabataMemberCount', () => {
  it('scales with headroom per the documented bands', () => {
    expect(chooseCoreTabataMemberCount(20)).toBe(8);
    expect(chooseCoreTabataMemberCount(10)).toBe(4);
    expect(chooseCoreTabataMemberCount(3)).toBe(2);
  });
});

// ============================================================================
// Form C — follow-along resolution
// ============================================================================

const followAlong = (id: string, level: number): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    exerciseRole: 'reinforcement',
    isFollowAlong: true,
    isFinisherVideo: true,
    movementGroup: 'core',
    primaryMuscle: 'abs',
    targetPrograms: [{ programId: 'core', level }],
    execution_methods: [],
  } as never);

describe('resolveFollowAlongCoreExercise', () => {
  const ladder = [followAlong('t4', 4), followAlong('t8', 8), followAlong('t12', 12), followAlong('t16', 16)];

  it('picks the nearest-at-or-below level for a mid-ladder user', () => {
    const picked = resolveFollowAlongCoreExercise(ladder, 10, undefined);
    expect(picked?.id).toBe('t8');
  });

  it('picks the exact match when the user level equals a ladder rung', () => {
    const picked = resolveFollowAlongCoreExercise(ladder, 12, undefined);
    expect(picked?.id).toBe('t12');
  });

  it('below the whole ladder (L1 user) falls back to the easiest item, not undefined', () => {
    const picked = resolveFollowAlongCoreExercise(ladder, 1, undefined);
    expect(picked?.id).toBe('t4');
  });

  it('above the whole ladder (L20 user) picks the hardest item', () => {
    const picked = resolveFollowAlongCoreExercise(ladder, 20, undefined);
    expect(picked?.id).toBe('t16');
  });

  it('excludes candidates without a real core level (the §12.3 gate applies to form C too)', () => {
    const noLevel: Exercise = { ...followAlong('unleveled', 8), targetPrograms: [] } as never;
    const picked = resolveFollowAlongCoreExercise([noLevel], 8, undefined);
    expect(picked).toBeUndefined();
  });

  it('empty pool returns undefined, not a crash', () => {
    expect(resolveFollowAlongCoreExercise([], 8, undefined)).toBeUndefined();
  });
});

// ============================================================================
// Form B — injury shield in the tabata core block
// ============================================================================

const coreHiitExercise = (id: string, injuryShield?: string[]): Exercise =>
  ({
    id,
    name: { he: id, en: id },
    movementGroup: 'core',
    tags: ['hiit_friendly'],
    symmetry: 'bilateral',
    targetPrograms: [{ programId: 'core', level: 3 }],
    injuryShield: injuryShield as never,
    execution_methods: [],
  } as never);

const dummyTarget = (): WorkoutExercise[] => [];

describe('buildCoreTabataBlock — injury shield', () => {
  it('excludes a candidate whose injuryShield overlaps the user injuries, still composes from the rest', () => {
    const target = dummyTarget();
    const corePool = [
      coreHiitExercise('safe1'),
      coreHiitExercise('safe2'),
      coreHiitExercise('hurts_back', ['lower_back' as never]),
    ];
    const spec = buildCoreTabataBlock(target, {
      memberCount: 2,
      corePool,
      userLevel: 5,
      injuryShield: ['lower_back' as never],
    });
    expect(spec).toBeDefined();
    expect(spec?.exerciseIds).not.toContain('hurts_back');
    expect(target.some((ex) => ex.exercise.id === 'hurts_back')).toBe(false);
  });

  it('no injuries ⇒ no restriction (backward compatible, matches ContextualEngine.passesInjuryShield)', () => {
    const target = dummyTarget();
    const corePool = [coreHiitExercise('a'), coreHiitExercise('b', ['lower_back' as never])];
    const spec = buildCoreTabataBlock(target, {
      memberCount: 2,
      corePool,
      userLevel: 5,
    });
    expect(spec?.exerciseIds).toHaveLength(2);
  });

  it('fails to compose (returns undefined) rather than injecting an injury-violating member when too few safe candidates remain', () => {
    const target = dummyTarget();
    const corePool = [
      coreHiitExercise('only_one_safe'),
      coreHiitExercise('hurts', ['lower_back' as never]),
    ];
    const spec = buildCoreTabataBlock(target, {
      memberCount: 2,
      corePool,
      userLevel: 5,
      injuryShield: ['lower_back' as never],
    });
    expect(spec).toBeUndefined();
    expect(target).toHaveLength(0); // nothing partially injected
  });

  it('member count is exact — memberCount:2 never returns a 4-member block even when 4 are eligible', () => {
    const target = dummyTarget();
    const corePool = [
      coreHiitExercise('a'), coreHiitExercise('b'), coreHiitExercise('c'), coreHiitExercise('d'),
    ];
    const spec = buildCoreTabataBlock(target, { memberCount: 2, corePool, userLevel: 5 });
    expect(spec?.exerciseIds).toHaveLength(2);
  });
});
