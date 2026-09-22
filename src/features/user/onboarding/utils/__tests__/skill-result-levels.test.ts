import { describe, it, expect } from 'vitest';
import { baselineSkillMasterSubLevels } from '../skill-result-levels';

describe('baselineSkillMasterSubLevels', () => {
  it('push/pull/legs are always 0 — never assessed via a skill-ladder slider', () => {
    const result = baselineSkillMasterSubLevels({ planche: 12, core: 4 });
    expect(result.push).toBe(0);
    expect(result.pull).toBe(0);
    expect(result.legs).toBe(0);
  });

  it('D2: reads a real assessed core level instead of hardcoding 0', () => {
    const result = baselineSkillMasterSubLevels({ planche: 12, core: 4 });
    expect(result.core).toBe(4);
  });

  it('core level of 0 is a real assessed value, not "unassessed" — passed through as 0 either way', () => {
    const result = baselineSkillMasterSubLevels({ planche: 12, core: 0 });
    expect(result.core).toBe(0);
  });

  it('no core key present (pre-D2 shape, or mini-assessment mode where D2 is skipped): falls back to 0', () => {
    const result = baselineSkillMasterSubLevels({ planche: 12 });
    expect(result.core).toBe(0);
  });

  it('multi-skill selection: core still reads correctly regardless of how many skill keys are present', () => {
    const result = baselineSkillMasterSubLevels({ planche: 12, front_lever: 9, core: 6 });
    expect(result).toEqual({ push: 0, pull: 0, legs: 0, core: 6 });
  });
});
