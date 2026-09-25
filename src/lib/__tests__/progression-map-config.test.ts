import { describe, it, expect } from 'vitest';
import {
  resolveTreeProgramId,
  isProgressionMapLeafProgram,
  getProgressionMapProgramName,
  PROGRESSION_MAP_LEAF_PROGRAMS,
} from '../progression-map-config';

const FRONT_LEVER = 'mFcuYlNgKXLqWVUFo0zt';
const PLANCHE = 'pCI5NHXpowu2ySucqDn8';
const NOT_ALLOWLISTED = 'someOtherProgramIdNotOnTheList';

describe('PROGRESSION_MAP_LEAF_PROGRAMS', () => {
  it('has exactly the 6 allow-listed programs from the brief', () => {
    expect(PROGRESSION_MAP_LEAF_PROGRAMS).toHaveLength(6);
  });

  it('does not include מאסל אפ (excluded per the founder — isMaster mis-flag, founder-only fix)', () => {
    const ids = PROGRESSION_MAP_LEAF_PROGRAMS.map((p) => p.programId);
    expect(ids).not.toContain('fTLWzjP9gH2VNpamyCZF');
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
});
