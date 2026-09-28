import { describe, it, expect } from 'vitest';
import { getSameProgramLevelExercises } from '../program-level-swap-query';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises/core/exercise.types';
import type { UserFullProfile } from '@/types/user-profile';

const PROGRAM_A = 'programA';
const FAKE_PROFILE = {} as UserFullProfile;

function method(overrides: Partial<ExecutionMethod>): ExecutionMethod {
  return {
    location: 'park',
    requiredGearType: 'improvised',
    media: {},
    ...overrides,
  } as unknown as ExecutionMethod;
}

function ex(
  id: string,
  targetPrograms: { programId: string; level: number }[],
  methods: ExecutionMethod[] = [method({})],
): Exercise {
  return {
    id,
    name: { he: id, en: id },
    targetPrograms,
    execution_methods: methods,
  } as unknown as Exercise;
}

describe('getSameProgramLevelExercises (round 10 — count must match the "+N" badge)', () => {
  it('includes every OTHER exercise tagged to the same (programId, level) — no location/method filtering drops a candidate', () => {
    // Regression case for the reported bug: badge said "+6", sheet listed 3.
    // Root cause was over-filtering (park=null rejecting fixed_equipment
    // methods) — this fixture reproduces that exact shape: several
    // candidates whose ONLY method needs fixed equipment, which the old
    // code would have silently dropped when park=null.
    const target = ex('target', [{ programId: PROGRAM_A, level: 1 }]);
    const siblings = [
      ex('sib1', [{ programId: PROGRAM_A, level: 1 }], [method({ requiredGearType: 'fixed_equipment' })]),
      ex('sib2', [{ programId: PROGRAM_A, level: 1 }], [method({ requiredGearType: 'fixed_equipment' })]),
      ex('sib3', [{ programId: PROGRAM_A, level: 1 }], [method({ requiredGearType: 'user_gear' })]),
      ex('sib4', [{ programId: PROGRAM_A, level: 1 }], [method({ requiredGearType: 'improvised' })]),
      ex('sib5', [{ programId: PROGRAM_A, level: 1 }], [method({ requiredGearType: 'fixed_equipment' })]),
      ex('sib6', [{ programId: PROGRAM_A, level: 1 }], [method({ requiredGearType: 'fixed_equipment' })]),
    ];
    const pool = [target, ...siblings];

    // siblingCount, mirrored from build-skill-tree.service.ts's own formula:
    const candidatesAtLevel = pool.filter((e) => e.targetPrograms?.some((tp) => tp.programId === PROGRAM_A && tp.level === 1));
    const expectedSiblingCount = candidatesAtLevel.length - 1;
    expect(expectedSiblingCount).toBe(6); // sanity: matches the "+6" from the bug report

    return getSameProgramLevelExercises(PROGRAM_A, 1, 'target', 'park', null, FAKE_PROFILE, pool).then((result) => {
      expect(result).toHaveLength(expectedSiblingCount);
      expect(result.map((r) => r.exercise.id).sort()).toEqual(['sib1', 'sib2', 'sib3', 'sib4', 'sib5', 'sib6']);
    });
  });

  it('excludes only excludeExerciseId, and only exercises actually matching (programId, level)', () => {
    const pool = [
      ex('self', [{ programId: PROGRAM_A, level: 1 }]),
      ex('same-level', [{ programId: PROGRAM_A, level: 1 }]),
      ex('other-level', [{ programId: PROGRAM_A, level: 2 }]),
      ex('other-program', [{ programId: 'programB', level: 1 }]),
    ];
    return getSameProgramLevelExercises(PROGRAM_A, 1, 'self', 'park', null, FAKE_PROFILE, pool).then((result) => {
      expect(result.map((r) => r.exercise.id)).toEqual(['same-level']);
    });
  });

  it('picks a real execution method via findMethodForLocation when one exists for the location', () => {
    const withImage = ex(
      'e1',
      [{ programId: PROGRAM_A, level: 1 }],
      [method({ media: { imageUrl: 'https://cdn/photo.jpg' } })],
    );
    return getSameProgramLevelExercises(PROGRAM_A, 1, 'exclude-me', 'park', null, FAKE_PROFILE, [withImage]).then((result) => {
      expect(result[0].selectedExecutionMethod.media?.imageUrl).toBe('https://cdn/photo.jpg');
    });
  });

  it('never drops a candidate with a literally empty execution_methods array — falls back to a placeholder method instead', () => {
    const noMethods = ex('no-methods', [{ programId: PROGRAM_A, level: 1 }], []);
    return getSameProgramLevelExercises(PROGRAM_A, 1, 'exclude-me', 'park', null, FAKE_PROFILE, [noMethods]).then((result) => {
      expect(result).toHaveLength(1);
      expect(result[0].exercise.id).toBe('no-methods');
      expect(result[0].selectedExecutionMethod).toBeDefined();
    });
  });

  it('returns an empty list when no other exercise matches the exact (programId, level) pair', () => {
    const pool = [ex('only-one', [{ programId: PROGRAM_A, level: 1 }])];
    return getSameProgramLevelExercises(PROGRAM_A, 1, 'only-one', 'park', null, FAKE_PROFILE, pool).then((result) => {
      expect(result).toEqual([]);
    });
  });
});
