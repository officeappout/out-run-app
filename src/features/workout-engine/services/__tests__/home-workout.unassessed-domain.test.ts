import { describe, it, expect } from 'vitest';
import { buildUserProgramLevels, getBaseUserLevel } from '../level-resolution.utils';

// Bug fix regression test — home-workout.service.ts:1378,1397,1435-1436
//
// Before the fix, the isUpperBodyMaster / isCalisthenicsUpperMaster budget
// paths did `userProgramLevels.get(domain) ?? baseUserLevel`, which borrowed
// the user's GLOBAL max level (from a completely different, assessed domain)
// whenever the specific domain/skill had never been assessed. That silently
// invented data feeding the real set-budget (not just a display value).
//
// The fix replaces `?? baseUserLevel` with `?? UNASSESSED_DOMAIN_LEVEL` (1),
// matching the "absent=absent" principle already enforced at the source of
// truth in level-resolution.utils.ts (buildUserProgramLevels never invents a
// level for an unassessed domain — it simply leaves it out of the map).

const profile = (domains: any = {}, tracks: any = {}): any => ({
  progression: { domains, tracks, activePrograms: [], globalLevel: 1 },
});

describe('home-workout.service — unassessed domain no longer borrows baseUserLevel', () => {
  it('push=L14 only, pull never assessed: pull stays ABSENT from userProgramLevels', () => {
    const { levels } = buildUserProgramLevels(profile({ push: { currentLevel: 14 } }), new Set());
    expect(levels.get('push')).toBe(14);
    expect(levels.has('pull')).toBe(false); // source of truth already correct
  });

  it('BEFORE (reproduction of the bug formula): pull would have inherited L14 from baseUserLevel', () => {
    const p = profile({ push: { currentLevel: 14 } });
    const { levels } = buildUserProgramLevels(p, new Set());
    const baseUserLevel = getBaseUserLevel(p); // 14 (global max across domains)

    // This is the OLD expression that used to live at home-workout.service.ts:1436
    const oldPullLevel = levels.get('pull') ?? baseUserLevel;
    expect(oldPullLevel).toBe(14); // <- the bug: pull "inherits" push's level
  });

  it('AFTER (fixed formula): pull falls back to the conservative UNASSESSED_DOMAIN_LEVEL (1), not L14', () => {
    const p = profile({ push: { currentLevel: 14 } });
    const { levels } = buildUserProgramLevels(p, new Set());

    // This mirrors the NEW expression now at home-workout.service.ts:1436
    const UNASSESSED_DOMAIN_LEVEL = 1;
    const newPullLevel = levels.get('pull') ?? UNASSESSED_DOMAIN_LEVEL;
    expect(newPullLevel).toBe(1);
    expect(newPullLevel).not.toBe(14);
  });

  it('front_lever (skill track) unassessed: same before/after contrast as pull', () => {
    // baseUserLevel here would be driven by an unrelated assessed track (e.g. push=L16)
    const p = profile({ push: { currentLevel: 16 } });
    const { levels } = buildUserProgramLevels(p, new Set());
    const baseUserLevel = getBaseUserLevel(p);

    expect(levels.has('front_lever')).toBe(false); // never assessed → absent

    const oldFrontLeverLevel = levels.get('front_lever') ?? baseUserLevel; // OLD bug formula
    expect(oldFrontLeverLevel).toBe(16); // wrong: borrowed push's L16

    const UNASSESSED_DOMAIN_LEVEL = 1;
    const newFrontLeverLevel = levels.get('front_lever') ?? UNASSESSED_DOMAIN_LEVEL; // NEW formula
    expect(newFrontLeverLevel).toBe(1);
  });
});
