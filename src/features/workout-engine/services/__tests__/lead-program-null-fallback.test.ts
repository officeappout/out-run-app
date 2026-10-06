import { describe, it, expect, vi } from 'vitest';
import type { Program } from '@/features/content/programs/core/program.types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

vi.mock('@/features/content/programs/core/programLevelSettings.service', () => ({
  getProgramLevelSetting: vi.fn().mockResolvedValue(null),
  isPlsCacheEnabled: vi.fn().mockReturnValue(false),
}));

import {
  resolveActiveProgramBudget,
  getDefaultVolumeTarget,
  getDefaultMaxSets,
  getDefaultMaxIntense,
} from '../lead-program.service';

/**
 * Safety-brake fix (2026-10-06): `resolveActiveProgramBudget` used to return
 * `null` whenever (a) the user has no active program, or (b) the matched
 * active program is missing `movementPattern` -- and every real call site
 * then fed that into its OWN `?? calculateWeeklyBudget(level)` (the
 * unprotected level*2 formula), while `BudgetDistributor`'s hard `maxSets`
 * cap (`!= null` guarded) silently never fired at all for the exact same
 * sessions. It now never returns null -- it routes through the SAME tier
 * defaults (`getDefaultVolumeTarget`/`getDefaultMaxIntense`/`getDefaultMaxSets`)
 * a resolved-but-unconfigured program would have fallen back to anyway.
 */

const pushProgram: Program = {
  id: 'push_prog', name: 'Push', isMaster: false, movementPattern: 'push',
};
const noPatternProgram: Program = {
  id: 'mystery_prog', name: 'Mystery', isMaster: false,
};

function profileWith(activeTemplateId: string | undefined, level = 14): UserFullProfile {
  return {
    progression: {
      activePrograms: activeTemplateId ? [{ templateId: activeTemplateId } as any] : [],
      tracks: activeTemplateId ? { [activeTemplateId]: { currentLevel: level } as any } : {},
      domains: {},
    },
  } as unknown as UserFullProfile;
}

describe('resolveActiveProgramBudget — never returns null (safety-brake fix)', () => {
  it('no active program at all: returns a safe default, not null', async () => {
    const profile = profileWith(undefined);
    const budget = await resolveActiveProgramBudget(profile, [pushProgram]);

    expect(budget).not.toBeNull();
    expect(budget.isSafeDefault).toBe(true);
    expect(budget.maxSets).toBeGreaterThan(0);
    expect(budget.weeklyVolumeTarget).toBeGreaterThan(0);
  });

  it('active program resolves but has no movementPattern: still a safe default, not null', async () => {
    const profile = profileWith('mystery_prog', 14);
    const budget = await resolveActiveProgramBudget(profile, [noPatternProgram]);

    expect(budget.isSafeDefault).toBe(true);
    expect(budget.maxSets).toBe(getDefaultMaxSets(14));
    expect(budget.weeklyVolumeTarget).toBe(getDefaultVolumeTarget(14));
    expect(budget.maxIntenseWorkoutsPerWeek).toBe(getDefaultMaxIntense(14));
  });

  it('safe-default maxSets is NEVER null/undefined — the exact field BudgetDistributor ' +
     'gates its hard cap on (`constraints.maxSets != null`)', async () => {
    const profile = profileWith(undefined);
    const budget = await resolveActiveProgramBudget(profile, [pushProgram]);
    expect(budget.maxSets).not.toBeUndefined();
    expect(budget.maxSets).not.toBeNull();
  });

  it('safe-default level comes from getBaseUserLevel (highest real track/domain level), not a hardcoded 1', async () => {
    const profile = profileWith(undefined);
    profile.progression!.tracks = { pull: { currentLevel: 19 } as any };
    const budget = await resolveActiveProgramBudget(profile, [pushProgram]);
    expect(budget.level).toBe(19);
    expect(budget.maxSets).toBe(getDefaultMaxSets(19));
  });

  it('a real, resolvable active program is UNCHANGED: isSafeDefault is false, values are program-derived', async () => {
    const profile = profileWith('push_prog', 14);
    const budget = await resolveActiveProgramBudget(profile, [pushProgram]);

    expect(budget.isSafeDefault).toBeFalsy();
    expect(budget.leadProgramId).toBe('push_prog');
    expect(budget.level).toBe(14);
    // getProgramLevelSetting is mocked to return null, so this exercises the
    // SAME getDefaultXxx fallback chain as the safe-default path -- the
    // values should match, only `isSafeDefault`/`leadProgramId` differ.
    expect(budget.maxSets).toBe(getDefaultMaxSets(14));
  });
});
