import { describe, it, expect } from 'vitest';
import {
  resolveTreeProgramId,
  isProgressionMapLeafProgram,
  getProgressionMapProgramName,
  PROGRESSION_MAP_LEAF_PROGRAMS,
  PROGRESSION_MAP_HUB_PROGRAMS,
} from '../progression-map-config';

const FRONT_LEVER = 'mFcuYlNgKXLqWVUFo0zt';
const PLANCHE = 'pCI5NHXpowu2ySucqDn8';
const ONE_ARM_PULLUP = 'cC0BOmm6KIqYAyQynEIo';
const HANDSTAND = 'IOfBZFeorTTDkcz3tOA6';
const HSPU = 'PAxprHuT7HjqrWU4wl0T';
const HUMAN_FLAG = 'EtY8YCol0qpF6DzgcTx1';
const PULL = 'UPDBtTdCvX748dtBlWYj';
const PUSH = 'J0fLpmJhG0KDN2tQouxh';
const CORE = 'kDMpobbKsuVTByTIKUpe';
const LEGS = 'OrAmOH3F375dVio5yGdU';
const NOT_ALLOWLISTED = 'someOtherProgramIdNotOnTheList';

describe('PROGRESSION_MAP_LEAF_PROGRAMS', () => {
  it('has exactly the 6 Phase 1 skills + 4 Phase 4c-1 domains', () => {
    expect(PROGRESSION_MAP_LEAF_PROGRAMS).toHaveLength(10);
  });

  it('does not include מאסל אפ (excluded per the founder — isMaster mis-flag, founder-only fix)', () => {
    const ids = PROGRESSION_MAP_LEAF_PROGRAMS.map((p) => p.programId);
    expect(ids).not.toContain('fTLWzjP9gH2VNpamyCZF');
  });

  it('includes the 4 Phase 4c-1 domains with their real (live-verified) Hebrew names', () => {
    const byId = new Map(PROGRESSION_MAP_LEAF_PROGRAMS.map((p) => [p.programId, p.nameHe]));
    expect(byId.get(PULL)).toBe('משיכה');
    expect(byId.get(PUSH)).toBe('דחיפה');
    expect(byId.get(CORE)).toBe('ליבה');
    // Not "רגליים" — no program is named that in Firestore; the real name is "פלג גוף תחתון".
    expect(byId.get(LEGS)).toBe('פלג גוף תחתון');
  });
});

describe('PROGRESSION_MAP_HUB_PROGRAMS', () => {
  it('has exactly the 4 hub-visible skills from the progression-hub brief', () => {
    expect(PROGRESSION_MAP_HUB_PROGRAMS).toHaveLength(4);
    const ids = PROGRESSION_MAP_HUB_PROGRAMS.map((p) => p.programId);
    expect(ids).toEqual([FRONT_LEVER, PLANCHE, ONE_ARM_PULLUP, HSPU]);
  });

  it('excludes handstand and human flag — deliberately held back from the hub grid', () => {
    const ids = PROGRESSION_MAP_HUB_PROGRAMS.map((p) => p.programId);
    expect(ids).not.toContain(HANDSTAND);
    expect(ids).not.toContain(HUMAN_FLAG);
  });

  it('is a strict subset of PROGRESSION_MAP_LEAF_PROGRAMS — every hub entry is also allow-listed', () => {
    const allowlistIds = new Set(PROGRESSION_MAP_LEAF_PROGRAMS.map((p) => p.programId));
    PROGRESSION_MAP_HUB_PROGRAMS.forEach((p) => expect(allowlistIds.has(p.programId)).toBe(true));
  });

  it('every non-hub leaf program has visibleInHub: false (no entry silently missing the flag)', () => {
    const hubIds = new Set(PROGRESSION_MAP_HUB_PROGRAMS.map((p) => p.programId));
    PROGRESSION_MAP_LEAF_PROGRAMS.forEach((p) => {
      expect(p.visibleInHub).toBe(hubIds.has(p.programId));
    });
  });
});

describe('isProgressionMapLeafProgram / getProgressionMapProgramName', () => {
  it('recognizes an allow-listed program', () => {
    expect(isProgressionMapLeafProgram(FRONT_LEVER)).toBe(true);
    expect(getProgressionMapProgramName(FRONT_LEVER)).toBe('פרונט לבר');
  });

  it('rejects a non-allow-listed program', () => {
    expect(isProgressionMapLeafProgram(NOT_ALLOWLISTED)).toBe(false);
    expect(getProgressionMapProgramName(NOT_ALLOWLISTED)).toBeNull();
  });

  it('Phase 4c-1: recognizes all 4 domains as leaf programs (same treatment as a skill)', () => {
    for (const id of [PULL, PUSH, CORE, LEGS]) {
      expect(isProgressionMapLeafProgram(id)).toBe(true);
    }
  });
});

describe('resolveTreeProgramId', () => {
  it('returns null when no targetPrograms entry is on the allow-list (the common case)', () => {
    const exercise = { targetPrograms: [{ programId: NOT_ALLOWLISTED, level: 3 }] };
    expect(resolveTreeProgramId(exercise)).toBeNull();
  });

  it('returns null when targetPrograms is empty or undefined', () => {
    expect(resolveTreeProgramId({ targetPrograms: [] })).toBeNull();
    expect(resolveTreeProgramId({ targetPrograms: undefined })).toBeNull();
  });

  it('resolves a single matching allow-listed entry', () => {
    const exercise = { targetPrograms: [{ programId: NOT_ALLOWLISTED, level: 1 }, { programId: FRONT_LEVER, level: 5 }] };
    expect(resolveTreeProgramId(exercise)).toBe(FRONT_LEVER);
  });

  it('cross-tagged to 2+ allow-listed programs: picks the first in array order, deterministically', () => {
    const exercise = { targetPrograms: [{ programId: PLANCHE, level: 2 }, { programId: FRONT_LEVER, level: 4 }] };
    expect(resolveTreeProgramId(exercise)).toBe(PLANCHE);

    const reversed = { targetPrograms: [{ programId: FRONT_LEVER, level: 4 }, { programId: PLANCHE, level: 2 }] };
    expect(resolveTreeProgramId(reversed)).toBe(FRONT_LEVER);
  });

  it('Phase 4c-1: resolves a pure-domain exercise (no skill tag at all) to the domain\'s own tree', () => {
    const exercise = { targetPrograms: [{ programId: PULL, level: 15 }] };
    expect(resolveTreeProgramId(exercise)).toBe(PULL);
  });

  it('Phase 4c-1: a skill exercise ALSO carrying its derived-prerequisite domain tag still opens the skill tree first (skill tag precedes the domain tag in the exercise\'s own array, matching real authored data)', () => {
    const exercise = { targetPrograms: [{ programId: FRONT_LEVER, level: 1 }, { programId: PULL, level: 10 }] };
    expect(resolveTreeProgramId(exercise)).toBe(FRONT_LEVER);
  });
});
