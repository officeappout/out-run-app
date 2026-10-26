import { describe, expect, it } from 'vitest';
import {
  FRONT_LEVER_UNLOCK_PULL,
  PLANCHE_UNLOCK_PUSH,
  estimateSkillLevel,
  unlockedSkills,
  withChosenSkills,
} from '../skill-unlock';

describe('skill unlock (screen 5a)', () => {
  it('thresholds are the owner decision: front lever from pull 14, planche from push 16', () => {
    expect(FRONT_LEVER_UNLOCK_PULL).toBe(14);
    expect(PLANCHE_UNLOCK_PUSH).toBe(16);
  });

  it('nothing unlocks below the thresholds', () => {
    expect(unlockedSkills({ push: 15, pull: 13 })).toEqual([]);
    expect(unlockedSkills({})).toEqual([]);
    expect(unlockedSkills({ push: Number.NaN, pull: undefined })).toEqual([]);
  });

  it('front lever at exactly pull 14, planche at exactly push 16', () => {
    expect(unlockedSkills({ push: 10, pull: 14 })).toEqual([{ skillId: 'front_lever', source: 'pull', estimatedLevel: 5 }]);
    expect(unlockedSkills({ push: 16, pull: 3 })).toEqual([{ skillId: 'planche', source: 'push', estimatedLevel: 7 }]);
  });

  it('both, planche first (board order), estimate = base minus 9', () => {
    expect(unlockedSkills({ push: 20, pull: 18 })).toEqual([
      { skillId: 'planche', source: 'push', estimatedLevel: 11 },
      { skillId: 'front_lever', source: 'pull', estimatedLevel: 9 },
    ]);
  });

  it('estimate is clamped to [1, max]', () => {
    expect(estimateSkillLevel(5)).toBe(1);
    expect(estimateSkillLevel(25, 12)).toBe(12);
    expect(unlockedSkills({ push: 25 }, { planche: 10 })[0].estimatedLevel).toBe(10);
  });

  it('adding skills appends them after the full-body entry, without sub levels, deduped', () => {
    const base = [{ programId: 'full_body', levelId: 'full_body_level_15', levelMode: 'auto', masterProgramSubLevels: { push: 16, pull: 14, legs: 12, core: 10 } }];
    const out = withChosenSkills(base, [
      { skillId: 'planche', level: 7 },
      { skillId: 'front_lever', level: 5.4 },
      { skillId: 'planche', level: 3 },
    ]);
    expect(out[0]).toBe(base[0]);
    expect(out.slice(1)).toEqual([
      { programId: 'planche', levelMode: 'manual', levelId: 'planche_level_7' },
      { programId: 'front_lever', levelMode: 'manual', levelId: 'front_lever_level_5' },
    ]);
    expect(withChosenSkills(base, [])).toEqual(base);
  });
});
