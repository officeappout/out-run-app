import { describe, it, expect, vi } from 'vitest';

const { mockGetProgramLevelSetting } = vi.hoisted(() => ({
  mockGetProgramLevelSetting: vi.fn(),
}));

vi.mock('@/features/content/programs/core/programLevelSettings.service', () => ({
  getProgramLevelSetting: mockGetProgramLevelSetting,
}));

import { buildAssessedDomainBudgetsFromRealSettings } from '../home-workout.service';

/**
 * Gap fixed here (2026-10-06): `buildAssessedDomainBudgets` always derived
 * `weekly` via the generic `calculateWeeklyBudget(level) = level*2` formula,
 * even for a domain that is itself a skill-track program (planche,
 * front_lever, …) with its own real `programLevelSettings` curve (PR #160).
 * `resolveLeadProgramBudget` already read real settings for a SINGLE-skill
 * session — this sibling closes the gap for the TRUE combined/master
 * session (`calisthenics_upper`), which is the one place real per-skill
 * curves never took effect before.
 */
describe('buildAssessedDomainBudgetsFromRealSettings — reads real PLS, not the generic formula', () => {
  const planche = { id: 'planche' };

  it('a resolvable program with real settings wins over the generic formula', async () => {
    mockGetProgramLevelSetting.mockResolvedValueOnce({ weeklyVolumeTarget: 24, maxSets: 22 });
    const userProgramLevels = new Map([['planche', 22]]);

    const { entries, maxSetsByDomain } = await buildAssessedDomainBudgetsFromRealSettings(
      ['planche'], userProgramLevels, 3, [planche],
    );

    expect(entries).toEqual([{ domain: 'planche', level: 22, weekly: 24, daily: 8 }]);
    expect(maxSetsByDomain.get('planche')).toBe(22);
  });

  it('no program resolves for the domain → falls back to the generic level*2 formula, no maxSets entry', async () => {
    const userProgramLevels = new Map([['front_lever', 10]]);

    const { entries, maxSetsByDomain } = await buildAssessedDomainBudgetsFromRealSettings(
      ['front_lever'], userProgramLevels, 3, [planche], // only 'planche' in allPrograms — front_lever unresolvable
    );

    expect(entries).toEqual([{ domain: 'front_lever', level: 10, weekly: 20, daily: 7 }]);
    expect(maxSetsByDomain.has('front_lever')).toBe(false);
  });

  it('program resolves but has no PLS doc at that level → falls back to the generic formula', async () => {
    mockGetProgramLevelSetting.mockResolvedValueOnce(null);
    const userProgramLevels = new Map([['planche', 5]]);

    const { entries, maxSetsByDomain } = await buildAssessedDomainBudgetsFromRealSettings(
      ['planche'], userProgramLevels, 3, [planche],
    );

    expect(entries[0].weekly).toBe(10); // calculateWeeklyBudget(5) = max(4, 5*2)
    expect(maxSetsByDomain.has('planche')).toBe(false);
  });

  it('getProgramLevelSetting throws → still returns a usable fallback entry, never crashes', async () => {
    mockGetProgramLevelSetting.mockRejectedValueOnce(new Error('Firestore unavailable'));
    const userProgramLevels = new Map([['planche', 8]]);

    const { entries } = await buildAssessedDomainBudgetsFromRealSettings(
      ['planche'], userProgramLevels, 3, [planche],
    );

    expect(entries[0].weekly).toBe(16); // calculateWeeklyBudget(8) = max(4, 8*2)
  });

  it('absent=absent (⑨) preserved: a domain never assessed is excluded entirely, not invented', async () => {
    const userProgramLevels = new Map([['planche', 7]]);

    const { entries } = await buildAssessedDomainBudgetsFromRealSettings(
      ['planche', 'front_lever'], userProgramLevels, 3, [planche],
    );

    expect(entries.map(e => e.domain)).toEqual(['planche']);
  });
});
