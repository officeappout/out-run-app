import { describe, expect, it } from 'vitest';
import { buildProgramSummary, isRenderableNormsFact, tracksFromLevels } from '../quiz-v3-summary';

/** A progression.tracks fixture, as a profile holds it right after the signup sync. */
const profileFixture = {
  progression: {
    tracks: {
      full_body: { currentLevel: 6, percent: 0 },
      push: { currentLevel: 6, percent: 5 },
      pull: { currentLevel: 4, percent: 5 },
      legs: { currentLevel: 8, percent: 5 },
      core: { currentLevel: 6, percent: 5 },
      planche: { currentLevel: 2, percent: 0 },
    },
  },
};

describe('summary rows (screen 6)', () => {
  it('one row per group in push / pull / legs / core order, master = mean', () => {
    const s = buildProgramSummary(profileFixture.progression.tracks);
    expect(s.rows).toEqual([
      { group: 'push', level: 6, percent: 5 },
      { group: 'pull', level: 4, percent: 5 },
      { group: 'legs', level: 8, percent: 5 },
      { group: 'core', level: 6, percent: 5 },
    ]);
    expect(s.master).toEqual({ level: 6, percent: 5, groupCount: 4 });
  });

  it('master level from the caller when given (the assessment average)', () => {
    expect(buildProgramSummary(profileFixture.progression.tracks, 7).master.level).toBe(7);
  });

  it('unassessed groups are left out, never level 0', () => {
    const s = buildProgramSummary({ push: { currentLevel: 3 }, pull: { currentLevel: 0 }, legs: undefined });
    expect(s.rows).toEqual([{ group: 'push', level: 3, percent: 0 }]);
    expect(s.master.groupCount).toBe(1);
  });

  it('from the assessment levels: every group starts at 0%', () => {
    const s = buildProgramSummary(tracksFromLevels({ push: 16, pull: 14, legs: 12, core: 10 }), 13);
    expect(s.rows.map((r) => [r.group, r.level, r.percent])).toEqual([
      ['push', 16, 0], ['pull', 14, 0], ['legs', 12, 0], ['core', 10, 0],
    ]);
    expect(s.master).toEqual({ level: 13, percent: 0, groupCount: 4 });
  });

  it('the "did you know" fact needs a real source', () => {
    expect(isRenderableNormsFact(undefined)).toBe(false);
    expect(isRenderableNormsFact({ group: 'push', percentile: 70, source: ' ' })).toBe(false);
    expect(isRenderableNormsFact({ group: 'push', percentile: 140, source: 'ACSM' })).toBe(false);
    expect(isRenderableNormsFact({ group: 'push', percentile: 70, source: 'ACSM' })).toBe(true);
  });
});
