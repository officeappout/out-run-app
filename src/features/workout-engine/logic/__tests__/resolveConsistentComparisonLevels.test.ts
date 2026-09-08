import { describe, expect, it } from 'vitest';
import { resolveConsistentComparisonLevels } from '../workout-selection.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

// Real slugs, real activeDomains order (skills first, parents appended last —
// InputSanitizerMiddleware.ts's "inverse expansion", buildActiveProgramFilters:320-333).
const ACTIVE_DOMAINS = ['planche', 'one_arm_pullup', 'push', 'pull'];

const exercise = (targetPrograms: Array<{ programId: string; level: number }>): Exercise =>
  ({ id: 'test-ex', name: { he: 'test', en: 'test' }, targetPrograms } as unknown as Exercise);

const levels = (entries: Record<string, number>): Map<string, number> => new Map(Object.entries(entries));

describe('resolveConsistentComparisonLevels', () => {
  it("David's real regression — [pull:17, front_lever:8, oap:8], user oap=7 pull=16 — must resolve consistently to the oap domain (8 vs 7, within ±3)", () => {
    const ex = exercise([
      { programId: 'pull', level: 17 },
      { programId: 'front_lever', level: 8 },
      { programId: 'one_arm_pullup', level: 8 },
    ]);
    const result = resolveConsistentComparisonLevels(
      ex, ACTIVE_DOMAINS, undefined, levels({ one_arm_pullup: 7, pull: 16 }), 1, 999,
    );
    expect(result.resolvedDomain).toBe('one_arm_pullup');
    expect(result.exerciseLevel).toBe(8);
    expect(result.userLevel).toBe(7);
    // The actual gate check: exerciseLevel must fall within userLevel±3.
    expect(Math.abs(result.exerciseLevel - result.userLevel)).toBeLessThanOrEqual(3);
  });

  it('planche boundary case — [push:18, planche:9], user planche=12 push=21 — must pass (9 vs 12, exactly at the ±3 edge)', () => {
    const ex = exercise([
      { programId: 'push', level: 18 },
      { programId: 'planche', level: 9 },
    ]);
    const result = resolveConsistentComparisonLevels(
      ex, ACTIVE_DOMAINS, undefined, levels({ planche: 12, push: 21 }), 1, 999,
    );
    expect(result.resolvedDomain).toBe('planche');
    expect(result.exerciseLevel).toBe(9);
    expect(result.userLevel).toBe(12);
    expect(Math.abs(result.exerciseLevel - result.userLevel)).toBeLessThanOrEqual(3);
  });

  it('must-fail case — proves the fix is not "always true": [pull:17, one_arm_pullup:2], user oap=7 pull=16 — 2 vs 7 is outside ±3', () => {
    const ex = exercise([
      { programId: 'pull', level: 17 },
      { programId: 'one_arm_pullup', level: 2 },
    ]);
    const result = resolveConsistentComparisonLevels(
      ex, ACTIVE_DOMAINS, undefined, levels({ one_arm_pullup: 7, pull: 16 }), 1, 999,
    );
    expect(result.resolvedDomain).toBe('one_arm_pullup');
    expect(result.exerciseLevel).toBe(2);
    expect(result.userLevel).toBe(7);
    expect(Math.abs(result.exerciseLevel - result.userLevel)).toBeGreaterThan(3);
  });

  it('order independence — pull-first vs oap-first targetPrograms arrays resolve to the identical result', () => {
    const pullFirst = exercise([
      { programId: 'pull', level: 17 },
      { programId: 'one_arm_pullup', level: 8 },
    ]);
    const oapFirst = exercise([
      { programId: 'one_arm_pullup', level: 8 },
      { programId: 'pull', level: 17 },
    ]);
    const budgets = levels({ one_arm_pullup: 7, pull: 16 });
    const r1 = resolveConsistentComparisonLevels(pullFirst, ACTIVE_DOMAINS, undefined, budgets, 1, 999);
    const r2 = resolveConsistentComparisonLevels(oapFirst, ACTIVE_DOMAINS, undefined, budgets, 1, 999);
    expect(r1).toEqual(r2);
    expect(r1.resolvedDomain).toBe('one_arm_pullup');
    expect(r1.userLevel).toBe(7);
  });

  it('no userProgramLevels provided — falls back to fallbackUserLevel, unchanged behavior for callers that opt out', () => {
    const ex = exercise([{ programId: 'pull', level: 17 }, { programId: 'one_arm_pullup', level: 8 }]);
    const result = resolveConsistentComparisonLevels(ex, ACTIVE_DOMAINS, undefined, undefined, 1, 42);
    expect(result.userLevel).toBe(42);
    // exerciseLevel is still domain-aware via resolveExerciseLevelForDomains — unaffected by the fallback.
    expect(result.exerciseLevel).toBe(8);
    expect(result.resolvedDomain).toBe('one_arm_pullup');
  });

  it('exercise resolves to no domain at all (tps[0] fallback, resolvedDomain=null) — falls back to fallbackUserLevel even with userProgramLevels present', () => {
    const ex = exercise([{ programId: 'unrelated_program', level: 5 }]);
    const result = resolveConsistentComparisonLevels(
      ex, ACTIVE_DOMAINS, undefined, levels({ one_arm_pullup: 7, pull: 16 }), 1, 42,
    );
    expect(result.resolvedDomain).toBeNull();
    expect(result.userLevel).toBe(42);
  });

  it("missing budget for the resolved domain — falls back to baseUserLevel (resolveUserLevelForProgram's own terminal fallback, not fallbackUserLevel)", () => {
    const ex = exercise([{ programId: 'one_arm_pullup', level: 8 }]);
    const result = resolveConsistentComparisonLevels(
      ex, ACTIVE_DOMAINS, undefined, levels({ pull: 16 }), 5, 999,
    );
    expect(result.resolvedDomain).toBe('one_arm_pullup');
    expect(result.userLevel).toBe(5);
  });
});
