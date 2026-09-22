import { describe, it, expect } from 'vitest';
import { baselineSkillMasterSubLevels } from '../skill-result-levels';

describe('baselineSkillMasterSubLevels', () => {
  it('skill-only selection (no co-selected category): push/pull/legs/core all default to 0', () => {
    // A skill-only selection's `categories` never contains literal push/pull/
    // legs/core keys (except 'core' via D2) — skillLevels here only carries
    // skill-ladder ids, so all 4 correctly fall back to 0.
    const result = baselineSkillMasterSubLevels({ planche: 12 });
    expect(result).toEqual({ push: 0, pull: 0, legs: 0, core: 0 });
  });

  it('D2: reads a real assessed core level instead of hardcoding 0', () => {
    const result = baselineSkillMasterSubLevels({ planche: 12, core: 4 });
    expect(result.core).toBe(4);
  });

  it('core level of 0 is a real assessed value, not "unassessed" — passed through as 0 either way', () => {
    const result = baselineSkillMasterSubLevels({ planche: 12, core: 0 });
    expect(result.core).toBe(0);
  });

  it('multi-skill selection: core still reads correctly regardless of how many skill keys are present', () => {
    const result = baselineSkillMasterSubLevels({ planche: 12, front_lever: 9, core: 6 });
    expect(result).toEqual({ push: 0, pull: 0, legs: 0, core: 6 });
  });

  it('a skill co-selected with a different-domain muscle chip: legs reads its real literal-category value', () => {
    // e.g. planche (push-deriving) + a 'legs' muscle chip, unioned by
    // assessment-path-config.service.ts — 'legs' is a real category here,
    // not a skill id. Regression guard: this used to be hardcoded to 0,
    // silently discarding a real assessed leg level.
    const result = baselineSkillMasterSubLevels({ planche: 5, legs: 3, core: 2 });
    expect(result.legs).toBe(3);
  });

  it('a skill co-selected with a same-domain muscle chip: the literal category is absent (D3 suppressed it upstream), so it correctly reads 0 here — the CMS parentLevelMapping formula is the only source for that domain', () => {
    // D3 collision suppression means a push-deriving skill's union never
    // contains a literal 'push' key — this function has no way to know that
    // on its own, it just reads whatever key is present. This test pins the
    // resulting behavior: 0 here, to be potentially raised afterward by
    // buildSkillResult's own CMS-derived loop (outside this function).
    const result = baselineSkillMasterSubLevels({ planche: 5, core: 2 });
    expect(result.push).toBe(0);
  });

  it('all 4 literal categories present at once (skill + full Health co-selection minus the suppressed domain): each reads its own real value', () => {
    const result = baselineSkillMasterSubLevels({ planche: 5, pull: 7, legs: 3, core: 2 });
    expect(result).toEqual({ push: 0, pull: 7, legs: 3, core: 2 });
  });
});
