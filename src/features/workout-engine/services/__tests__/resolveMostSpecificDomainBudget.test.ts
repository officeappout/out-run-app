import { describe, expect, it } from 'vitest';
import { resolveMostSpecificDomainBudget } from '../level-resolution.utils';

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

type Budget = { domain: string; level: number; weekly: number; daily: number };
const budget = (domain: string, level: number): Budget => ({ domain, level, weekly: 0, daily: 0 });

describe('resolveMostSpecificDomainBudget', () => {
  it('exercise with only a specific tag — returns its budget', () => {
    const result = resolveMostSpecificDomainBudget(
      [{ programId: 'planche', level: 7 }],
      [budget('planche', 10)],
      SKILL_PARENT_MAP,
      identity,
    );
    expect(result?.domain).toBe('planche');
    expect(result?.level).toBe(10);
  });

  it('exercise with only a parent tag — returns the parent budget (nothing more specific exists)', () => {
    const result = resolveMostSpecificDomainBudget(
      [{ programId: 'pull', level: 19 }],
      [budget('pull', 19)],
      SKILL_PARENT_MAP,
      identity,
    );
    expect(result?.domain).toBe('pull');
  });

  it('exercise with both, specific first in array — returns the specific budget', () => {
    const result = resolveMostSpecificDomainBudget(
      [{ programId: 'one_arm_pullup', level: 10 }, { programId: 'pull', level: 19 }],
      [budget('pull', 19), budget('one_arm_pullup', 10)],
      SKILL_PARENT_MAP,
      identity,
    );
    expect(result?.domain).toBe('one_arm_pullup');
  });

  it('exercise with both, parent first in array — the broken case, must still return the specific budget', () => {
    const result = resolveMostSpecificDomainBudget(
      [{ programId: 'pull', level: 19 }, { programId: 'one_arm_pullup', level: 10 }],
      [budget('pull', 19), budget('one_arm_pullup', 10)],
      SKILL_PARENT_MAP,
      identity,
    );
    expect(result?.domain).toBe('one_arm_pullup');
  });

  it('order independence — both "both" cases return the identical budget', () => {
    const specificFirst = resolveMostSpecificDomainBudget(
      [{ programId: 'one_arm_pullup', level: 10 }, { programId: 'pull', level: 19 }],
      [budget('pull', 19), budget('one_arm_pullup', 10)],
      SKILL_PARENT_MAP,
      identity,
    );
    const parentFirst = resolveMostSpecificDomainBudget(
      [{ programId: 'pull', level: 19 }, { programId: 'one_arm_pullup', level: 10 }],
      [budget('pull', 19), budget('one_arm_pullup', 10)],
      SKILL_PARENT_MAP,
      identity,
    );
    expect(specificFirst).toEqual(parentFirst);
    expect(specificFirst?.domain).toBe('one_arm_pullup');
  });

  it('exercise with no relevant tag at all — returns undefined', () => {
    const result = resolveMostSpecificDomainBudget(
      [{ programId: 'legs', level: 5 }],
      [budget('pull', 19), budget('one_arm_pullup', 10)],
      SKILL_PARENT_MAP,
      identity,
    );
    expect(result).toBeUndefined();
  });

  it('no targetPrograms at all — returns undefined', () => {
    const result = resolveMostSpecificDomainBudget(
      undefined,
      [budget('pull', 19)],
      SKILL_PARENT_MAP,
      identity,
    );
    expect(result).toBeUndefined();
  });

  it('specific tag present but no budget exists for it — falls back to the parent budget', () => {
    const result = resolveMostSpecificDomainBudget(
      [{ programId: 'pull', level: 19 }, { programId: 'one_arm_pullup', level: 10 }],
      [budget('pull', 19)], // no one_arm_pullup budget — user hasn't assessed it
      SKILL_PARENT_MAP,
      identity,
    );
    expect(result?.domain).toBe('pull');
  });

  it("David's real regression — [{pull,19},{one_arm_pullup,10}], budgets include both — result must be the oap budget, not pull's", () => {
    const result = resolveMostSpecificDomainBudget(
      [{ programId: 'UPDBtTdCvX748dtBlWYj', level: 19 }, { programId: 'cC0BOmm6KIqYAyQynEIo', level: 10 }],
      [budget('pull', 19), budget('one_arm_pullup', 10)],
      SKILL_PARENT_MAP,
      (id) =>
        id === 'UPDBtTdCvX748dtBlWYj' ? 'pull' : id === 'cC0BOmm6KIqYAyQynEIo' ? 'one_arm_pullup' : id,
    );
    expect(result?.domain).toBe('one_arm_pullup');
    expect(result?.level).toBe(10);
  });
});
