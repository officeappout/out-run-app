import { describe, it, expect } from 'vitest';
import { buildUserProgramLevels, getBaseUserLevel } from '../level-resolution.utils';
import { resolveChildDomainsForParent, isDomainAssessed } from '../program-hierarchy.utils';

const prof = (domains: any = {}, tracks: any = {}, activePrograms: any[] = []): any => ({
  progression: { domains, tracks, activePrograms, globalLevel: 1 },
});

describe('buildUserProgramLevels — absent=absent (⑨): never invent a level', () => {
  it('a domain with NO entry is absent from the map', () => {
    const { levels } = buildUserProgramLevels(prof({ push: { currentLevel: 10 } }), new Set());
    expect(levels.get('push')).toBe(10);
    expect(levels.has('legs')).toBe(false); // never assessed → absent, not L1
  });

  it('a present-but-ZERO domain is left absent (no `|| 1` → L1 resurrection)', () => {
    const { levels } = buildUserProgramLevels(
      prof({ push: { currentLevel: 12 }, legs: { currentLevel: 0 } }), new Set());
    expect(levels.get('push')).toBe(12);
    expect(levels.has('legs')).toBe(false); // 0 → absent, NOT invented to L1
  });

  it('a genuinely assessed L1 IS kept (real ≠ invented)', () => {
    const { levels } = buildUserProgramLevels(prof({ push: { currentLevel: 1 } }), new Set());
    expect(levels.get('push')).toBe(1);
  });

  it('NO Virtual-Core: core stays absent even with push/pull/legs present', () => {
    const { levels } = buildUserProgramLevels(
      prof({ push: { currentLevel: 10 }, pull: { currentLevel: 8 }, legs: { currentLevel: 6 } }), new Set());
    expect(levels.has('core')).toBe(false); // no avg-derived core invention
  });

  it('NO Pro-Core-Floor: an elite (globalMax>15) does NOT get core/isolation floored to L7', () => {
    const { levels } = buildUserProgramLevels(prof({ pull: { currentLevel: 22 } }), new Set());
    expect(levels.get('pull')).toBe(22);
    expect(levels.has('core')).toBe(false);      // not floored into existence
    expect(levels.has('isolation')).toBe(false);
  });

  it('activePrograms with no resolvable level are NOT invented to L1', () => {
    const { levels } = buildUserProgramLevels(prof({}, {}, [{ templateId: 'unknownHashXYZ' }]), new Set());
    expect(levels.has('unknownHashXYZ')).toBe(false);
  });
});

describe('getBaseUserLevel — global floor preserved (never 0/NaN)', () => {
  it('all-absent → floors at 1', () => {
    expect(getBaseUserLevel(prof({}))).toBe(1);
  });
  it('reflects the max assessed domain', () => {
    expect(getBaseUserLevel(prof({ push: { currentLevel: 14 }, legs: { currentLevel: 3 } }))).toBe(14);
  });
});

describe('resolveChildDomainsForParent — assessed-only intersection (⑨ guard #1)', () => {
  const p = (domains: any): any => ({ progression: { domains, tracks: {} } });

  it('full_body with only push/pull assessed → drops the unassessed legs/core', () => {
    const r = resolveChildDomainsForParent('full_body', p({ push: { currentLevel: 12 }, pull: { currentLevel: 10 } }));
    expect(r.slice().sort()).toEqual(['pull', 'push']);
  });

  it('full_body fully assessed → all four children', () => {
    const r = resolveChildDomainsForParent('full_body',
      p({ push: { currentLevel: 5 }, pull: { currentLevel: 5 }, legs: { currentLevel: 5 }, core: { currentLevel: 5 } }));
    expect(r.slice().sort()).toEqual(['core', 'legs', 'pull', 'push']);
  });

  it('full_body with a ZERO legs → legs dropped, not forced', () => {
    const r = resolveChildDomainsForParent('full_body', p({ push: { currentLevel: 8 }, legs: { currentLevel: 0 } }));
    expect(r).toEqual(['push']);
  });

  it('upper_body with only push assessed → [push]', () => {
    const r = resolveChildDomainsForParent('upper_body', p({ push: { currentLevel: 9 } }));
    expect(r).toEqual(['push']);
  });
});

describe('resolveChildDomainsForParent — calisthenics_upper (⑨ BUG 1 rework)', () => {
  const pWithSkills = (domains: any, skillFocusIds: string[]): any => ({
    progression: { domains, tracks: {}, skillFocusIds },
  });

  it('BEFORE (documented bug): skillFocusIds used to pass through unfiltered — ' +
     'an unassessed skill (front_lever) would flow straight into resolvedChildDomains, ' +
     'admitting its exercises at an invented level downstream. AFTER: filtered to assessed-only.', () => {
    // planche assessed (L7), front_lever picked as a skill focus but NEVER assessed (no key at all).
    const r = resolveChildDomainsForParent(
      'calisthenics_upper',
      pWithSkills({ planche: { currentLevel: 7 } }, ['planche', 'front_lever']),
    );
    expect(r).toEqual(['planche']);
    expect(r).not.toContain('front_lever');
  });

  it('both skills assessed → both kept', () => {
    const r = resolveChildDomainsForParent(
      'calisthenics_upper',
      pWithSkills({ planche: { currentLevel: 7 }, front_lever: { currentLevel: 5 } }, ['planche', 'front_lever']),
    );
    expect(r.slice().sort()).toEqual(['front_lever', 'planche']);
  });

  it('all skills unassessed → empty array (never falls back to the raw skillIds or [activeProgramId])', () => {
    const r = resolveChildDomainsForParent(
      'calisthenics_upper',
      pWithSkills({}, ['planche', 'front_lever']),
    );
    expect(r).toEqual([]);
  });

  it('a present-but-ZERO skill level is treated as unassessed, not kept', () => {
    const r = resolveChildDomainsForParent(
      'calisthenics_upper',
      pWithSkills({ planche: { currentLevel: 7 }, front_lever: { currentLevel: 0 } }, ['planche', 'front_lever']),
    );
    expect(r).toEqual(['planche']);
  });

  it('no skillFocusIds at all → empty array (not [activeProgramId])', () => {
    const r = resolveChildDomainsForParent('calisthenics_upper', pWithSkills({ planche: { currentLevel: 7 } }, []));
    expect(r).toEqual([]);
  });
});

describe('isDomainAssessed — shared single source of truth (⑨)', () => {
  it('reads a real level from domains', () => {
    expect(isDomainAssessed(prof({ legs: { currentLevel: 10 } }), 'legs')).toBe(true);
  });
  it('reads a real level from tracks', () => {
    expect(isDomainAssessed(prof({}, { legs: { currentLevel: 10 } }), 'legs')).toBe(true);
  });
  it('a domain with no entry is not assessed', () => {
    expect(isDomainAssessed(prof({}), 'legs')).toBe(false);
  });
  it('a present-but-zero domain is not assessed', () => {
    expect(isDomainAssessed(prof({ legs: { currentLevel: 0 } }), 'legs')).toBe(false);
  });
});
